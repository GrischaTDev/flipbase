-- Zweck: dauerhafte Favoritenmeldungen, kontoweise Einstellungen und sichere Importbasis.
-- Betroffen: marketplace_favorite_*, marketplace_account_entries, Import-RPC und privater Meldungskanal.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create or replace function public.marketplace_apply_vinted_import (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid,
  p_user_id       uuid,
  p_snapshot      jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_connection public.marketplace_connections;
  v_session public.marketplace_browser_sessions;
  v_observed_at timestamptz;
  v_entry jsonb;
  v_area text;
  v_status text;
  v_failure text;
  v_kind text;
  v_parent_id uuid;
  v_body jsonb;
  v_old_feedback jsonb;
  v_counts jsonb := '{"profile":0,"publication":0,"conversation":0,"message":0,"sale":0}';
begin
  perform pg_advisory_xact_lock(91731, 1);
  -- Gleiche Sperrreihenfolge wie die bestehenden Browser-RPCs: Konto, dann Sitzung.
  select * into v_connection from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found or v_connection.status <> 'connected' then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = p_user_id for update;
  if not found or v_session.state <> 'active' or v_session.expires_at <= clock_timestamp() then
    raise exception 'Sitzungszugriff verweigert' using errcode = '42501';
  end if;
  -- Alte manuelle Sitzungen bleiben während des getrennten Worker-Rollouts nutzbar.
  if v_session.worker_epoch is not null and not exists (
    select 1 from public.marketplace_worker_runtime where worker_id = v_session.worker_id
      and worker_epoch = v_session.worker_epoch and expires_at > clock_timestamp()
  ) then raise exception 'Worker nicht mehr aktiv' using errcode = '42501'; end if;
  if v_session.operation_id is not null and not exists (
    select 1 from public.marketplace_operations o
      left join public.marketplace_sync_schedules s on s.id=o.schedule_id and s.workspace_id=o.workspace_id and s.connection_id=o.connection_id
    where o.id=v_session.operation_id and o.browser_session_id=v_session.public_id and o.state='running'
      and o.workspace_id=p_workspace_id and o.connection_id=p_connection_id and o.requested_by=p_user_id
      and o.worker_epoch=v_session.worker_epoch and o.authorization_version=1 and o.lease_expires_at>clock_timestamp()
      and (o.authorization_kind='manual_read' or (o.authorization_kind='scheduled_read' and s.enabled
        and s.authorization_version=o.schedule_authorization_version and s.activated_by=o.requested_by))
  ) then raise exception 'Auftragsfreigabe widerrufen' using errcode='42501'; end if;
  -- Lesesperren verhindern Rechteentzug zwischen Prüfung und abschließendem Schreiben.
  perform 1 from public.platform_operators where user_id = p_user_id for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin') for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object'
    or p_snapshot->'identity'->>'id' is distinct from v_connection.external_account_id then
    raise exception 'Kontoidentität stimmt nicht überein' using errcode = '42501';
  end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'areas') is distinct from 'object'
    or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or (p_snapshot ? 'rejectedSaleIds' and jsonb_typeof(p_snapshot->'rejectedSaleIds') is distinct from 'array') then
    raise exception 'Ungültiger Import' using errcode = '22023';
  end if;
  begin
    v_observed_at := (p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Ungültige Abrufzeit' using errcode = '22023';
  end;
  if not isfinite(v_observed_at) or v_observed_at <= (
    select max(observed_at) from public.marketplace_account_sync_sources where workspace_id = p_workspace_id and connection_id = p_connection_id
  ) then raise exception 'Veralteter Import' using errcode = '22023'; end if;

  foreach v_area in array array['profile','publications','conversations','messages','sales','feedback'] loop
    v_status := p_snapshot->'areas'->v_area->>'status';
    v_failure := p_snapshot->'areas'->v_area->>'failure';
    if jsonb_typeof(p_snapshot->'areas'->v_area) is distinct from 'object'
      or v_status is null or v_status not in ('complete','partial','failed')
      or (v_failure is not null and v_failure not in ('unauthorized','forbidden','rate_limited','provider_unavailable','invalid_response','timeout','network','browser_context'))
      or (v_status = 'failed' and v_failure is null) or (v_area = 'profile' and v_status <> 'complete') then
      raise exception 'Ungültiger Quellenstatus' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'profile') <> 1
    or exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*) > 1) then
    raise exception 'Profil oder eindeutige Einträge fehlen' using errcode = '22023';
  end if;
  select body->'feedbacks' into v_old_feedback from public.marketplace_account_entries
    where workspace_id = p_workspace_id and connection_id = p_connection_id and kind = 'profile';

  -- Gleiche Kontosperre und Einstellungsfassung für Ausgangsbasis und alle
  -- tatsächlich übernommenen Inserate dieses Batches.
  perform public.marketplace_prepare_favorite_import(p_workspace_id,p_connection_id,v_observed_at);

  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') order by (value->>'kind' = 'message') loop
    v_kind := v_entry->>'kind';
    v_area := case v_kind when 'profile' then 'profile' when 'publication' then 'publications' when 'conversation' then 'conversations' when 'message' then 'messages' when 'sale' then 'sales' end;
    if v_area is null or jsonb_typeof(v_entry) is distinct from 'object'
      or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or char_length(v_entry->>'externalId') not between 1 and 256
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or p_snapshot->'areas'->v_area->>'status' = 'failed'
      or (v_kind = 'profile' and v_entry->>'externalId' is distinct from v_connection.external_account_id)
      or (v_kind <> 'message' and v_entry ? 'parentExternalId') then
      raise exception 'Ungültiger Kontoeintrag' using errcode = '22023';
    end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode = '22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Ungültige Eintragszeit' using errcode = '22023';
    end;
    v_parent_id := null;
    if v_kind = 'message' then
      select id into v_parent_id from public.marketplace_account_entries
        where workspace_id = p_workspace_id and connection_id = p_connection_id and kind = 'conversation' and external_id = v_entry->>'parentExternalId';
      if v_parent_id is null or (p_snapshot->'areas'->'conversations'->>'status' = 'complete' and not exists (
        select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'conversation' and e->>'externalId' = v_entry->>'parentExternalId'
      )) then raise exception 'Nachricht ohne Kontogespräch' using errcode = '22023'; end if;
    end if;
    v_body := v_entry->'body';
    if v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' <> 'failed' then
      if jsonb_typeof(v_body->'feedbacks') is distinct from 'array' then raise exception 'Ungültige Bewertungen' using errcode = '22023'; end if;
      if exists (select 1 from jsonb_array_elements(v_body->'feedbacks') feedback where jsonb_typeof(feedback) <> 'object'
        or jsonb_typeof(feedback->'id') is distinct from 'string' or char_length(feedback->>'id') not between 1 and 256) then
        raise exception 'Ungültige Bewertungskennung' using errcode = '22023';
      end if;
    end if;
    if v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' = 'failed' then
      v_body := (v_body - 'feedbacks') || case when v_old_feedback is null then '{}'::jsonb else jsonb_build_object('feedbacks',v_old_feedback) end;
    elsif v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' = 'partial' then
      if jsonb_typeof(v_body->'feedbacks') is distinct from 'array' then raise exception 'Ungültige Teilbewertungen' using errcode = '22023'; end if;
      v_body := jsonb_set(v_body,'{feedbacks}',coalesce((
        select jsonb_agg(merged.value order by merged.position) from (
          select distinct on (source.value->>'id') source.value, source.position from (
            select value, ordinality as position from jsonb_array_elements(v_body->'feedbacks') with ordinality
            union all
            select value, ordinality + jsonb_array_length(v_body->'feedbacks') from jsonb_array_elements(coalesce(v_old_feedback,'[]')) with ordinality
          ) source order by source.value->>'id',source.position
        ) merged
      ),'[]'::jsonb));
    end if;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_kind,v_entry->>'externalId',v_parent_id,v_body,(v_entry->>'sortAt')::timestamptz,v_observed_at)
      on conflict (workspace_id,connection_id,kind,external_id) do update
        set parent_id = excluded.parent_id,body = excluded.body,sort_at = excluded.sort_at,observed_at = excluded.observed_at
        where public.marketplace_account_entries.observed_at <= excluded.observed_at;
    if found then v_counts := jsonb_set(v_counts,array[v_kind],to_jsonb((v_counts->>v_kind)::int + 1)); end if;
  end loop;

  -- Nur nachweislich vollständige Listen dürfen fehlende alte Einträge entfernen.
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.observed_at < v_observed_at and a.kind in ('publication','conversation')
    and not exists (select 1 from public.marketplace_account_entries child where child.parent_id = a.id and child.observed_at >= v_observed_at)
    and p_snapshot->'areas'->(case a.kind when 'publication' then 'publications' else 'conversations' end)->>'status' = 'complete'
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = a.kind and e->>'externalId' = a.external_id);
  if exists (select 1 from jsonb_array_elements(coalesce(p_snapshot->'rejectedSaleIds','[]')) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 256)
    or (jsonb_array_length(coalesce(p_snapshot->'rejectedSaleIds','[]')) > 0 and p_snapshot->'areas'->'sales'->>'status' = 'failed') then
    raise exception 'Ungültige Verkaufsbereinigung' using errcode = '22023';
  end if;
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.kind = 'sale' and a.observed_at < v_observed_at and a.external_id in (select jsonb_array_elements_text(coalesce(p_snapshot->'rejectedSaleIds','[]')))
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'sale' and e->>'externalId' = a.external_id);

  foreach v_area in array array['profile','publications','conversations','messages','sales','feedback'] loop
    v_status := p_snapshot->'areas'->v_area->>'status';
    insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,failure,observed_at,last_success_at,last_complete_at)
      values(p_workspace_id,p_connection_id,v_area,v_status,p_snapshot->'areas'->v_area->>'failure',v_observed_at,
        case when v_status <> 'failed' then v_observed_at end,case when v_status = 'complete' then v_observed_at end)
      on conflict (workspace_id,connection_id,area) do update set status = excluded.status,failure = excluded.failure,observed_at = excluded.observed_at,
        last_success_at = coalesce(excluded.last_success_at,public.marketplace_account_sync_sources.last_success_at),
        last_complete_at = coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  end loop;
  if not exists (select 1 from jsonb_each(p_snapshot->'areas') a where a.value->>'status' = 'failed') then
    update public.marketplace_connections set last_synced_at = v_observed_at where id = p_connection_id and (last_synced_at is null or last_synced_at < v_observed_at);
  end if;
  if v_session.expires_at <= clock_timestamp() then raise exception 'Sitzung während des Imports abgelaufen' using errcode = '42501'; end if;
  perform public.marketplace_finalize_favorite_import(p_workspace_id,p_connection_id,v_observed_at,p_snapshot->'areas'->'publications'->>'status' <> 'failed');
  return v_counts;
end;
$function$;

create function public.marketplace_finalize_favorite_import (
  p_workspace_id         uuid,
  p_connection_id        uuid,
  p_observed_at          timestamp with time zone,
  p_publications_success boolean
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
declare v_context jsonb;
begin
  v_context := nullif(current_setting('flipbase.favorite_notification_import',true),'')::jsonb;
  if p_publications_success then
    update public.marketplace_favorite_notification_settings set baseline_pending = false
      where workspace_id = p_workspace_id and connection_id = p_connection_id and enabled
        and version = (v_context->>'version')::bigint;
  end if;
  if exists(select 1 from public.marketplace_favorite_notifications where workspace_id = p_workspace_id and connection_id = p_connection_id and observed_at = p_observed_at) then
    -- Ausschließlich Invalidierung: keine Inserat-, Konto- oder Kennzahlendetails.
    perform realtime.send('{}'::jsonb,'favorite_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_notifications',true);
  end if;
  perform set_config('flipbase.favorite_notification_import','',true);
end;
$function$;

revoke all on function public.marketplace_finalize_favorite_import(uuid, uuid, timestamp with time zone, boolean) from public;

grant all on function public.marketplace_finalize_favorite_import(uuid, uuid, timestamp with time zone, boolean) to service_role;

create function public.marketplace_known_favorite_count (
  p_body jsonb
)
  returns bigint
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare v_count numeric;
begin
  if jsonb_typeof(p_body->'metrics'->'favorites') is distinct from 'number' then return null; end if;
  v_count := (p_body->'metrics'->>'favorites')::numeric;
  if v_count < 0 or v_count > 9007199254740991 or trunc(v_count) <> v_count then return null; end if;
  return v_count::bigint;
end;
$function$;

revoke all on function public.marketplace_known_favorite_count(jsonb) from public;

grant all on function public.marketplace_known_favorite_count(jsonb) to service_role;

create function public.marketplace_mark_favorite_notifications (
  p_workspace_id    uuid,
  p_notification_id text    default null::text,
  p_clear           boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_clear is null then raise exception 'Ungültige Meldungsaktion' using errcode = '22023'; end if;
  if p_clear then
    delete from public.marketplace_favorite_notifications where workspace_id = p_workspace_id and (p_notification_id is null or id::text = p_notification_id);
  else
    update public.marketplace_favorite_notifications set read = true where workspace_id = p_workspace_id and not read and (p_notification_id is null or id::text = p_notification_id);
  end if;
  if found then perform realtime.send('{}'::jsonb,'favorite_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_notifications',true); end if;
  return jsonb_build_object('ok',true);
end;
$function$;

revoke all on function public.marketplace_mark_favorite_notifications(uuid, text, boolean) from public;

grant all on function public.marketplace_mark_favorite_notifications(uuid, text, boolean) to authenticated;

grant all on function public.marketplace_mark_favorite_notifications(uuid, text, boolean) to service_role;

create function public.marketplace_prepare_favorite_import (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_observed_at   timestamp with time zone
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
declare v_version bigint;
begin
  insert into public.marketplace_favorite_notification_settings(workspace_id, connection_id)
    values(p_workspace_id, p_connection_id) on conflict (workspace_id, connection_id) do nothing;
  select version into v_version from public.marketplace_favorite_notification_settings
    where workspace_id = p_workspace_id and connection_id = p_connection_id for update;
  perform set_config('flipbase.favorite_notification_import', jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'observedAt',p_observed_at,'version',v_version)::text, true);
end;
$function$;

revoke all on function public.marketplace_prepare_favorite_import(uuid, uuid, timestamp with time zone) from public;

grant all on function public.marketplace_prepare_favorite_import(uuid, uuid, timestamp with time zone) to service_role;

create function public.marketplace_preserve_favorite_notification_scope()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.connection_id is distinct from old.connection_id then
    raise exception 'Meldungszuordnung darf nicht geändert werden' using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke all on function public.marketplace_preserve_favorite_notification_scope() from public;

grant all on function public.marketplace_preserve_favorite_notification_scope() to service_role;

create function public.marketplace_read_favorite_notification_settings (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare v_setting public.marketplace_favorite_notification_settings;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted') then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  select * into v_setting from public.marketplace_favorite_notification_settings where workspace_id = p_workspace_id and connection_id = p_connection_id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'enabled',coalesce(v_setting.enabled,true),'version',coalesce(v_setting.version,0));
end;
$function$;

revoke all on function public.marketplace_read_favorite_notification_settings(uuid, uuid) from public;

grant all on function public.marketplace_read_favorite_notification_settings(uuid, uuid) to authenticated;

grant all on function public.marketplace_read_favorite_notification_settings(uuid, uuid) to service_role;

create function public.marketplace_read_favorite_notifications (
  p_workspace_id uuid
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare v_items jsonb; v_unread bigint;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select count(*) into v_unread from public.marketplace_favorite_notifications where workspace_id = p_workspace_id and not read;
  with latest as (
    select n.*, c.display_name from public.marketplace_favorite_notifications n
      join public.marketplace_connections c on c.workspace_id = n.workspace_id and c.id = n.connection_id and c.marketplace = 'vinted'
    where n.workspace_id = p_workspace_id order by n.observed_at desc,n.id desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'connectionId',n.connection_id,'accountName',n.display_name,'observedAt',n.observed_at,'read',n.read,
    'listings',coalesce((select jsonb_agg(jsonb_build_object('entryId',e.entry_id,'title',e.title,'previousFavorites',e.previous_favorites,'favorites',e.favorites) order by e.id)
      from public.marketplace_favorite_notification_events e where e.workspace_id = n.workspace_id and e.connection_id = n.connection_id and e.notification_id = n.id),'[]'::jsonb))
    order by n.observed_at desc,n.id desc),'[]'::jsonb) into v_items from latest n;
  return jsonb_build_object('workspaceId',p_workspace_id,'items',v_items,'unreadCount',v_unread);
end;
$function$;

revoke all on function public.marketplace_read_favorite_notifications(uuid) from public;

grant all on function public.marketplace_read_favorite_notifications(uuid) to authenticated;

grant all on function public.marketplace_read_favorite_notifications(uuid) to service_role;

create function public.marketplace_record_favorite_notification_event()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare v_context jsonb; v_setting public.marketplace_favorite_notification_settings;
  v_previous bigint; v_favorites bigint; v_notification_id bigint;
begin
  v_context := nullif(current_setting('flipbase.favorite_notification_import',true),'')::jsonb;
  if old.kind <> 'publication' or new.kind <> 'publication' or new.observed_at <= old.observed_at
    or new.workspace_id is distinct from old.workspace_id or new.connection_id is distinct from old.connection_id
    or v_context is null or v_context->>'workspaceId' <> new.workspace_id::text
    or v_context->>'connectionId' <> new.connection_id::text
    or (v_context->>'observedAt')::timestamptz <> new.observed_at then return new; end if;
  select * into v_setting from public.marketplace_favorite_notification_settings
    where workspace_id = new.workspace_id and connection_id = new.connection_id;
  if not found or not v_setting.enabled or v_setting.baseline_pending
    or v_setting.version is distinct from (v_context->>'version')::bigint
    or old.favorite_notification_version is distinct from v_setting.version then return new; end if;
  v_previous := public.marketplace_known_favorite_count(old.body);
  v_favorites := public.marketplace_known_favorite_count(new.body);
  if v_previous is null or v_favorites is null or v_favorites <= v_previous then return new; end if;
  insert into public.marketplace_favorite_notifications(workspace_id,connection_id,observed_at)
    values(new.workspace_id,new.connection_id,new.observed_at)
    on conflict (workspace_id,connection_id,observed_at) do nothing returning id into v_notification_id;
  if v_notification_id is null then
    select id into v_notification_id from public.marketplace_favorite_notifications
      where workspace_id = new.workspace_id and connection_id = new.connection_id and observed_at = new.observed_at;
  end if;
  insert into public.marketplace_favorite_notification_events(workspace_id,connection_id,notification_id,entry_id,external_listing_id,title,previous_favorites,favorites,observed_at,setting_version)
    values(new.workspace_id,new.connection_id,v_notification_id,new.id,new.external_id,coalesce(new.body->>'title','Inserat'),v_previous,v_favorites,new.observed_at,v_setting.version)
    on conflict (workspace_id,connection_id,external_listing_id,observed_at) do nothing;
  return new;
end;
$function$;

revoke all on function public.marketplace_record_favorite_notification_event() from public;

grant all on function public.marketplace_record_favorite_notification_event() to service_role;

create function public.marketplace_set_favorite_notification_settings (
  p_workspace_id     uuid,
  p_connection_id    uuid,
  p_enabled          boolean,
  p_expected_version bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setting public.marketplace_favorite_notification_settings;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_enabled is null or p_expected_version is null or p_expected_version < 0 then raise exception 'Ungültige Meldungseinstellung' using errcode = '22023'; end if;
  select * into v_setting from public.marketplace_favorite_notification_settings where workspace_id = p_workspace_id and connection_id = p_connection_id for update;
  if coalesce(v_setting.version,0) <> p_expected_version then raise exception 'Meldungseinstellung wurde zwischenzeitlich geändert' using errcode = '40001'; end if;
  if not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_setting.id is null then
    insert into public.marketplace_favorite_notification_settings(workspace_id,connection_id,enabled) values(p_workspace_id,p_connection_id,p_enabled);
  elsif v_setting.enabled <> p_enabled then
    update public.marketplace_favorite_notification_settings set enabled = p_enabled, version = version + 1, baseline_pending = true where id = v_setting.id;
  end if;
  return public.marketplace_read_favorite_notification_settings(p_workspace_id,p_connection_id);
end;
$function$;

revoke all on function public.marketplace_set_favorite_notification_settings(uuid, uuid, boolean, bigint) from public;

grant all on function public.marketplace_set_favorite_notification_settings(uuid, uuid, boolean, bigint) to authenticated;

grant all on function public.marketplace_set_favorite_notification_settings(uuid, uuid, boolean, bigint) to service_role;

create function public.marketplace_stamp_favorite_notification_version()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare v_context jsonb;
begin
  v_context := nullif(current_setting('flipbase.favorite_notification_import',true),'')::jsonb;
  if new.kind = 'publication' and v_context->>'workspaceId' = new.workspace_id::text
    and v_context->>'connectionId' = new.connection_id::text
    and (v_context->>'observedAt')::timestamptz = new.observed_at then
    new.favorite_notification_version := (v_context->>'version')::bigint;
  end if;
  return new;
end;
$function$;

revoke all on function public.marketplace_stamp_favorite_notification_version() from public;

grant all on function public.marketplace_stamp_favorite_notification_version() to service_role;

alter table public.marketplace_account_entries
  add column favorite_notification_version bigint;

comment on column public.marketplace_account_entries.favorite_notification_version is 'Einstellungsfassung der letzten akzeptierten Inseratbeobachtung; verhindert nachträgliche Meldungen nach Teilabrufen.';

create trigger marketplace_record_favorite_notification_event
  after update on public.marketplace_account_entries
  for each row
  execute function public.marketplace_record_favorite_notification_event();

create trigger marketplace_stamp_favorite_notification_version
  before insert or update on public.marketplace_account_entries
  for each row
  execute function public.marketplace_stamp_favorite_notification_version();

create table public.marketplace_favorite_notification_events (
  id                  bigint                   generated always as identity not null,
  workspace_id        uuid                     not null,
  connection_id       uuid                     not null,
  notification_id     bigint                   not null,
  entry_id            uuid                     not null,
  external_listing_id text                     not null,
  title               text                     not null,
  previous_favorites  bigint                   not null,
  favorites           bigint                   not null,
  observed_at         timestamp with time zone not null,
  setting_version     bigint                   not null
);

comment on table public.marketplace_favorite_notification_events is 'Bekannte Nettoanstiege akzeptierter Inseratzeilen; Eintragskennung bleibt auch bei später entferntem Inserat für Direktlinks erhalten.';

alter table public.marketplace_favorite_notification_events
  enable row level security;

alter table public.marketplace_favorite_notification_events
  add constraint marketplace_favorite_notifica_workspace_id_connection_id_ex_key unique (workspace_id, connection_id, external_listing_id, observed_at);

alter table public.marketplace_favorite_notification_events
  add constraint marketplace_favorite_notification_even_previous_favorites_check check (previous_favorites >= 0 and previous_favorites <= '9007199254740991'::bigint);

alter table public.marketplace_favorite_notification_events
  add constraint marketplace_favorite_notification_events_check check (favorites > previous_favorites and favorites <= '9007199254740991'::bigint);

alter table public.marketplace_favorite_notification_events
  add constraint marketplace_favorite_notification_events_observed_at_check check (isfinite(observed_at));

alter table public.marketplace_favorite_notification_events
  add constraint marketplace_favorite_notification_events_pkey primary key (id);

alter table public.marketplace_favorite_notification_events
  add constraint marketplace_favorite_notification_events_setting_version_check check (setting_version > 0);

grant select on public.marketplace_favorite_notification_events to authenticated;

grant all on public.marketplace_favorite_notification_events to service_role;

create index marketplace_favorite_notification_events_summary on public.marketplace_favorite_notification_events (workspace_id, connection_id, notification_id, id);

create trigger marketplace_preserve_favorite_events_scope
  before update on public.marketplace_favorite_notification_events
  for each row
  execute function public.marketplace_preserve_favorite_notification_scope();

create policy "Administrators read favorite events" on public.marketplace_favorite_notification_events
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Worker deletes favorite events" on public.marketplace_favorite_notification_events
  for delete
  to service_role
  using (true);

create policy "Worker inserts favorite events" on public.marketplace_favorite_notification_events
  for insert
  to service_role
  with check (true);

create policy "Worker reads favorite events" on public.marketplace_favorite_notification_events
  for select
  to service_role
  using (true);

create policy "Worker updates favorite events" on public.marketplace_favorite_notification_events
  for update
  to service_role
  using (true)
  with check (true);

create table public.marketplace_favorite_notification_settings (
  id               bigint  generated always as identity not null,
  workspace_id     uuid    not null,
  connection_id    uuid    not null,
  enabled          boolean default true not null,
  version          bigint  default 1 not null,
  baseline_pending boolean default true not null
);

comment on table public.marketplace_favorite_notification_settings is 'Kontoweise In-App-Favoritenmeldungen ohne Ton; erste Beobachtung nach Aktivierung setzt nur die Basis.';

alter table public.marketplace_favorite_notification_settings
  enable row level security;

alter table public.marketplace_favorite_notification_settings
  add constraint marketplace_favorite_notificati_workspace_id_connection_id_fkey foreign key (workspace_id, connection_id)
    references public.marketplace_connections(workspace_id, id) on delete cascade;

alter table public.marketplace_favorite_notification_settings
  add constraint marketplace_favorite_notificatio_workspace_id_connection_id_key unique (workspace_id, connection_id);

alter table public.marketplace_favorite_notification_settings
  add constraint marketplace_favorite_notification_settings_pkey primary key (id);

alter table public.marketplace_favorite_notification_settings
  add constraint marketplace_favorite_notification_settings_version_check check (version > 0);

grant select on public.marketplace_favorite_notification_settings to authenticated;

grant all on public.marketplace_favorite_notification_settings to service_role;

create trigger marketplace_preserve_favorite_settings_scope
  before update on public.marketplace_favorite_notification_settings
  for each row
  execute function public.marketplace_preserve_favorite_notification_scope();

create policy "Administrators read favorite settings" on public.marketplace_favorite_notification_settings
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Worker deletes favorite settings" on public.marketplace_favorite_notification_settings
  for delete
  to service_role
  using (true);

create policy "Worker inserts favorite settings" on public.marketplace_favorite_notification_settings
  for insert
  to service_role
  with check (true);

create policy "Worker reads favorite settings" on public.marketplace_favorite_notification_settings
  for select
  to service_role
  using (true);

create policy "Worker updates favorite settings" on public.marketplace_favorite_notification_settings
  for update
  to service_role
  using (true)
  with check (true);

create table public.marketplace_favorite_notifications (
  id            bigint                   generated always as identity not null,
  workspace_id  uuid                     not null,
  connection_id uuid                     not null,
  observed_at   timestamp with time zone not null,
  read          boolean                  default false not null
);

comment on table public.marketplace_favorite_notifications is 'Eine dauerhafte Glockenmeldung pro Konto und übernommenem Beobachtungsbatch; Lesestatus gilt workspaceweit.';

alter table public.marketplace_favorite_notifications
  enable row level security;

alter table public.marketplace_favorite_notifications
  add constraint marketplace_favorite_notifica_workspace_id_connection_id_id_key unique (workspace_id, connection_id, id);

alter table public.marketplace_favorite_notification_events
  add constraint marketplace_favorite_notifica_workspace_id_connection_id_n_fkey foreign key (workspace_id, connection_id, notification_id)
    references public.marketplace_favorite_notifications(workspace_id, connection_id, id) on delete cascade;

alter table public.marketplace_favorite_notifications
  add constraint marketplace_favorite_notifica_workspace_id_connection_id_ob_key unique (workspace_id, connection_id, observed_at);

alter table public.marketplace_favorite_notifications
  add constraint marketplace_favorite_notificat_workspace_id_connection_id_fkey1 foreign key (workspace_id, connection_id)
    references public.marketplace_connections(workspace_id, id) on delete cascade;

alter table public.marketplace_favorite_notifications
  add constraint marketplace_favorite_notifications_observed_at_check check (isfinite(observed_at));

alter table public.marketplace_favorite_notifications
  add constraint marketplace_favorite_notifications_pkey primary key (id);

grant select on public.marketplace_favorite_notifications to authenticated;

grant all on public.marketplace_favorite_notifications to service_role;

create index marketplace_favorite_notifications_unread on public.marketplace_favorite_notifications (workspace_id)
  where not read;

create index marketplace_favorite_notifications_feed on public.marketplace_favorite_notifications (workspace_id, observed_at desc, id desc);

create trigger marketplace_preserve_favorite_notifications_scope
  before update on public.marketplace_favorite_notifications
  for each row
  execute function public.marketplace_preserve_favorite_notification_scope();

create policy "Administrators read favorite notifications" on public.marketplace_favorite_notifications
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Worker deletes favorite notifications" on public.marketplace_favorite_notifications
  for delete
  to service_role
  using (true);

create policy "Worker inserts favorite notifications" on public.marketplace_favorite_notifications
  for insert
  to service_role
  with check (true);

create policy "Worker reads favorite notifications" on public.marketplace_favorite_notifications
  for select
  to service_role
  using (true);

create policy "Worker updates favorite notifications" on public.marketplace_favorite_notifications
  for update
  to service_role
  using (true)
  with check (true);

-- Erzeugte Ergänzungen: Rollenrechte aus dem älteren Diff und privater Kanal aus pg_dump.
revoke all on function public.marketplace_finalize_favorite_import(uuid, uuid, timestamp with time zone, boolean) from anon;
revoke all on function public.marketplace_finalize_favorite_import(uuid, uuid, timestamp with time zone, boolean) from authenticated;
revoke all on function public.marketplace_known_favorite_count(jsonb) from anon;
revoke all on function public.marketplace_known_favorite_count(jsonb) from authenticated;
revoke all on function public.marketplace_mark_favorite_notifications(uuid, text, boolean) from anon;
revoke all on function public.marketplace_prepare_favorite_import(uuid, uuid, timestamp with time zone) from anon;
revoke all on function public.marketplace_prepare_favorite_import(uuid, uuid, timestamp with time zone) from authenticated;
revoke all on function public.marketplace_preserve_favorite_notification_scope() from anon;
revoke all on function public.marketplace_preserve_favorite_notification_scope() from authenticated;
revoke all on function public.marketplace_read_favorite_notification_settings(uuid, uuid) from anon;
revoke all on function public.marketplace_read_favorite_notifications(uuid) from anon;
revoke all on function public.marketplace_record_favorite_notification_event() from anon;
revoke all on function public.marketplace_record_favorite_notification_event() from authenticated;
revoke all on function public.marketplace_set_favorite_notification_settings(uuid, uuid, boolean, bigint) from anon;
revoke all on function public.marketplace_stamp_favorite_notification_version() from anon;
revoke all on function public.marketplace_stamp_favorite_notification_version() from authenticated;
revoke all on public.marketplace_favorite_notification_events from anon;
revoke delete, insert, maintain, references, trigger, truncate, update on public.marketplace_favorite_notification_events from authenticated;
revoke all on public.marketplace_favorite_notification_settings from anon;
revoke delete, insert, maintain, references, trigger, truncate, update on public.marketplace_favorite_notification_settings from authenticated;
revoke all on public.marketplace_favorite_notifications from anon;
revoke delete, insert, maintain, references, trigger, truncate, update on public.marketplace_favorite_notifications from authenticated;
revoke all on sequence public.marketplace_favorite_notification_settings_id_seq from public, anon, authenticated;
revoke all on sequence public.marketplace_favorite_notifications_id_seq from public, anon, authenticated;
revoke all on sequence public.marketplace_favorite_notification_events_id_seq from public, anon, authenticated;
grant all on sequence public.marketplace_favorite_notification_events_id_seq to service_role;
grant all on sequence public.marketplace_favorite_notification_settings_id_seq to service_role;
grant all on sequence public.marketplace_favorite_notifications_id_seq to service_role;
create policy "Administrators receive favorite notifications" on realtime.messages for select to authenticated using (((extension = 'broadcast'::text) and (topic = ( select realtime.topic() as topic)) and (exists ( select 1
   from public.workspaces w
  where ((messages.topic = (('workspace:'::text || (w.id)::text) || ':marketplace_notifications'::text)) and public.marketplace_can_manage(w.id))))));

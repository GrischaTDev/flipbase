-- Zweck: Vinted-Verkäufe, Paketstornierungen und belegte Wiederaufnahme erfassen; vorhandene Altersanker wieder nutzen.
-- Betroffen: public.marketplace_account_entries, Leseseiten, Verkaufsbelegtrigger und RLS-geschützte Kontosicht.
-- Automatisch aus dem geprüften Basis-/Zielkatalog mit migra erzeugt; Sichtoptionen, Rechte und Bestandsabgleich aus dem deklarativen Schema ergänzt.
create index marketplace_vinted_sale_items on public.marketplace_account_entries using gin (((body -> 'itemIds'::text))) where (kind = 'sale'::text);

set check_function_bodies = off;

create or replace function public.marketplace_preserve_vinted_sale()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare v_previous jsonb; v_account text; v_ids jsonb; v_state_at timestamptz; v_previous_at timestamptz;
begin
  if new.kind<>'sale' or not (new.body ? 'saleState') then return new; end if;
  select external_account_id into v_account from public.marketplace_connections
    where workspace_id=new.workspace_id and id=new.connection_id and marketplace='vinted';
  if not found then return new; end if;
  if jsonb_typeof(new.body->'saleState') is distinct from 'string'
    or new.body->>'saleState' not in ('sold','shipped','completed','cancelled','relisted')
    or new.body->>'sellerId' is distinct from v_account
    or jsonb_typeof(new.body->'itemIds') is distinct from 'array'
    or jsonb_array_length(new.body->'itemIds')>100
    or exists(select 1 from jsonb_array_elements(new.body->'itemIds') item where jsonb_typeof(item)<>'string' or item#>>'{}' !~ '^[1-9][0-9]{0,31}$')
    or not (new.body ? 'itemCount')
    or (case when new.body->'itemCount'='null'::jsonb then false
      when jsonb_typeof(new.body->'itemCount')='number' and pg_input_is_valid(new.body->>'itemCount','integer')
      then (new.body->>'itemCount')::integer not between 1 and 100 or (new.body->>'itemCount')::integer<jsonb_array_length(new.body->'itemIds')
      else true end)
    or jsonb_typeof(new.body->'externalConversationId') is distinct from 'string'
    or new.body->>'externalConversationId' !~ '^[1-9][0-9]{0,31}$'
  then raise exception 'Ungültiger Vinted-Verkaufsbeleg' using errcode='22023'; end if;
  if tg_op='UPDATE' then v_previous:=old.body;
  else select e.body into v_previous from public.marketplace_account_entries e
    where e.workspace_id=new.workspace_id and e.connection_id=new.connection_id and e.kind='sale' and e.external_id=new.external_id;
  end if;
  if v_previous->>'sellerId' is distinct from v_account then v_previous:=null; end if;
  if public.marketplace_publication_time_valid(new.body->>'saleStateAt',new.observed_at) then v_state_at:=(new.body->>'saleStateAt')::timestamptz; end if;
  if public.marketplace_publication_time_valid(v_previous->>'saleStateAt',new.observed_at) then v_previous_at:=(v_previous->>'saleStateAt')::timestamptz; end if;
  -- Ältere oder verkürzte Gesprächsausschnitte dürfen eine spätere Stornierung nicht zurücknehmen.
  if (v_previous->>'saleState'='relisted' and new.body->>'saleState'<>'relisted')
    or (v_previous->>'saleState'='cancelled' and new.body->>'saleState' not in ('cancelled','relisted'))
    or (v_previous_at is not null and (v_state_at is null or v_previous_at>v_state_at
    or (v_previous_at=v_state_at and v_previous->>'saleState' in ('cancelled','relisted') and new.body->>'saleState' not in ('cancelled','relisted'))))
  then new.body:=new.body||jsonb_build_object('saleState',v_previous->'saleState','saleStateAt',v_previous->'saleStateAt','status',v_previous->'status');
    new.sort_at:=v_previous_at;
  end if;
  if jsonb_typeof(v_previous->'itemIds')='array' then
    select coalesce(jsonb_agg(distinct item),'[]'::jsonb) into v_ids
      from jsonb_array_elements((new.body->'itemIds')||(v_previous->'itemIds')) item;
    new.body:=new.body||jsonb_build_object('itemIds',v_ids,'itemCount',nullif(greatest((new.body->>'itemCount')::integer,(v_previous->>'itemCount')::integer,jsonb_array_length(v_ids)),0));
  end if;
  if public.marketplace_publication_time_valid(v_previous->>'occurredAt',new.observed_at)
    and (not public.marketplace_publication_time_valid(new.body->>'occurredAt',new.observed_at) or (v_previous->>'occurredAt')::timestamptz<(new.body->>'occurredAt')::timestamptz)
  then new.body:=new.body||jsonb_build_object('occurredAt',v_previous->'occurredAt'); end if;
  if new.body->>'price' is null and jsonb_typeof(v_previous->'price')='number' then
    new.body:=new.body||jsonb_build_object('price',v_previous->'price','currency',v_previous->'currency');
  end if;
  return new;
end;
$function$
;

create or replace view "public"."marketplace_visible_account_entries" as  select id,
    workspace_id,
    connection_id,
    kind,
    external_id,
    parent_id,
    body,
    sort_at,
    observed_at,
    favorite_notification_version,
    conversation_read_version
   from marketplace_account_entries e
  where ((kind <> 'publication'::text) or coalesce(( select (((sale.body ->> 'saleState'::text) = 'relisted'::text) and ((sale.body ->> 'saleStateAt'::text) is not null) and (sale.sort_at > '1970-01-01 00:00:00+00'::timestamp with time zone) and (e.observed_at >= sale.sort_at) and (coalesce((e.body ->> 'publicationState'::text), 'unknown'::text) = any (array['active'::text, 'reserved'::text])))
           from (marketplace_account_entries sale
             join marketplace_connections c on (((c.workspace_id = sale.workspace_id) and (c.id = sale.connection_id) and (c.marketplace = 'vinted'::text))))
          where ((sale.workspace_id = e.workspace_id) and (sale.connection_id = e.connection_id) and (sale.kind = 'sale'::text) and ((sale.body ->> 'sellerId'::text) = c.external_account_id) and ((sale.body ->> 'saleState'::text) = any (array['sold'::text, 'shipped'::text, 'completed'::text, 'cancelled'::text, 'relisted'::text])) and ((sale.body -> 'itemIds'::text) ? e.external_id))
          order by (((sale.body ->> 'saleState'::text) <> 'relisted'::text) and (sale.sort_at <= '1970-01-01 00:00:00+00'::timestamp with time zone)) desc, sale.sort_at desc, sale.id desc
         limit 1), true));


create or replace function public.marketplace_apply_vinted_import(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid, p_user_id uuid, p_snapshot jsonb)
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
  if not found or v_connection.execution_mode <> 'cloud' or v_connection.status <> 'connected' then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
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
    and a.kind = 'sale' and a.body->>'saleState' is null and a.observed_at < v_observed_at and a.external_id in (select jsonb_array_elements_text(coalesce(p_snapshot->'rejectedSaleIds','[]')))
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
  if p_snapshot ? 'favoriteEvents' and public.marketplace_cloud_favorite_settings_valid(p_workspace_id,p_connection_id) then
    perform public.marketplace_record_favorite_events(p_workspace_id,p_connection_id,v_connection.external_account_id,'cloud',p_snapshot->'favoriteEvents');
  end if;
  if p_snapshot ? 'inboxEvents' then
    if (p_snapshot->'inboxEvents'->>'observedAt')::timestamptz is distinct from v_observed_at then raise exception 'Ungültiger Eingangsstand' using errcode='22023'; end if;
    perform public.marketplace_record_message_event_batch(p_workspace_id,p_connection_id,v_connection.external_account_id,p_snapshot->'inboxEvents');
  end if;
  return v_counts;
end;
$function$
;

create or replace function public.marketplace_preserve_publication_time()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_published_at timestamptz;
  v_previous jsonb:='{}'::jsonb;
  v_previous_observed_at timestamptz;
  v_draft_observed_at timestamptz;
  v_source jsonb;
  v_state text;
  v_created_at jsonb;
  v_age jsonb;
begin
  if new.kind<>'publication' or not exists(select 1 from public.marketplace_connections c
    where c.workspace_id=new.workspace_id and c.id=new.connection_id and c.marketplace='vinted') then return new; end if;
  if tg_op='UPDATE' and row(new.workspace_id,new.connection_id,new.kind,new.external_id)
    is not distinct from row(old.workspace_id,old.connection_id,old.kind,old.external_id) then
    -- Ein verspäteter Abruf darf weder Status noch Chronologie einer neueren Lesekopie ersetzen.
    if new.observed_at<old.observed_at then return old; end if;
    v_previous:=old.body;
    v_previous_observed_at:=old.observed_at;
  elsif tg_op='INSERT' then
    -- BEFORE INSERT läuft auch vor ON CONFLICT. Bekannte Entwürfe müssen schon hier erhalten bleiben,
    -- damit excluded.body aus einem alten Client nicht künstlich den expliziten Zustand unknown erhält.
    select e.body,e.observed_at into v_previous,v_previous_observed_at from public.marketplace_account_entries e
      where e.workspace_id=new.workspace_id and e.connection_id=new.connection_id
        and e.kind='publication' and e.external_id=new.external_id;
    v_previous:=coalesce(v_previous,'{}'::jsonb);
  end if;
  v_state:=case when new.body->>'publicationState' in ('active','reserved','draft','hidden','ended','unknown')
    then new.body->>'publicationState'
    when v_previous->>'publicationState' in ('active','reserved','draft','hidden','ended','unknown')
    then v_previous->>'publicationState' else 'unknown' end;
  -- Nur die Datenbank schreibt diesen Quellenanker. Er bleibt auch nach draft → active erhalten,
  -- damit ein späterer Folgeimport keine Veröffentlichung vor dem letzten Entwurf wiederbelebt.
  if public.marketplace_publication_time_valid(v_previous->>'publicationDraftObservedAt',new.observed_at) then
    v_draft_observed_at:=(v_previous->>'publicationDraftObservedAt')::timestamptz;
  end if;
  if v_previous->>'publicationState'='draft' then
    v_draft_observed_at:=greatest(v_draft_observed_at,least(v_previous_observed_at,statement_timestamp()));
  end if;
  if v_state='draft' then
    v_draft_observed_at:=greatest(v_draft_observed_at,least(new.observed_at,statement_timestamp()));
  end if;
  v_published_at:=public.marketplace_confirmed_publication_time(new.workspace_id,new.connection_id,new.external_id);
  if v_published_at<=v_draft_observed_at then v_published_at:=null; end if;

  if public.marketplace_publication_time_valid(new.body->>'createdAt',new.observed_at) then
    v_created_at:=new.body->'createdAt';
  elsif public.marketplace_publication_time_valid(v_previous->>'createdAt',new.observed_at) then
    v_created_at:=v_previous->'createdAt';
  end if;
  -- Vor dieser Trennung enthielt occurredAt das Vinted-Feld created_at. Ohne identischen eigenen
  -- Veröffentlichungsbeleg wird diese alte Quellzeit konservativ als Erstellung erhalten.
  -- Ein moderner Import mit explizitem createdAt wird niemals auf diese Weise umgedeutet.
  for v_source in select value from jsonb_array_elements(jsonb_build_array(new.body,v_previous)) loop
    if v_created_at is null and not v_source ? 'createdAt'
      and public.marketplace_publication_time_valid(v_source->>'occurredAt',new.observed_at) then
      if not exists(select 1 from public.marketplace_listing_jobs j
        join public.marketplace_connections c on c.workspace_id=j.workspace_id and c.id=j.connection_id
          and c.marketplace='vinted' and c.external_account_id=j.external_account_id
        where j.workspace_id=new.workspace_id and j.connection_id=new.connection_id and j.external_id=new.external_id
          and j.state='confirmed' and j.action='publish' and j.provider_state='active'
          and date_trunc('milliseconds',j.verified_at)=date_trunc('milliseconds',(v_source->>'occurredAt')::timestamptz)) then
        v_created_at:=v_source->'occurredAt';
      end if;
    end if;
  end loop;

  v_age:=case when jsonb_typeof(new.body->'publicationAge')='object' then new.body->'publicationAge' end;
  if v_age is null and coalesce(v_previous->>'publicationState','unknown') not in ('draft','hidden')
    and jsonb_typeof(v_previous->'publicationAge')='object' then v_age:=v_previous->'publicationAge'; end if;
  -- Aktuelle Quellenzustände gewinnen immer vor einem historischen Veröffentlichungsauftrag.
  if v_state not in ('active','reserved') then v_published_at:=null; end if;
  if v_state in ('draft','hidden') or v_published_at is not null then v_age:=null; end if;
  new.body:=(new.body-'publicationDraftObservedAt')||jsonb_build_object(
    'publicationState',v_state,'createdAt',v_created_at,
    'occurredAt',case when v_published_at is not null then to_char(v_published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'publicationAge',v_age);
  if v_draft_observed_at is not null then
    new.body:=new.body||jsonb_build_object('publicationDraftObservedAt',to_char(v_draft_observed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  end if;
  -- Die vorhandene globale Cursorabfrage verwendet sort_at und id. Abruf- oder Updatezeiten
  -- sind keine Artikelchronologie; die feste Epoche legt unbekannte Artikel stabil ans Ende.
  new.sort_at:=coalesce(v_published_at,
    case when v_state in ('active','reserved','ended','unknown') then public.marketplace_publication_age_sort_at(v_age,new.observed_at) end,
    (v_created_at#>>'{}')::timestamptz,
    '1970-01-01T00:00:00Z'::timestamptz);
  return new;
end;
$function$
;

create or replace function public.marketplace_read_page(p_workspace_id uuid, p_connection_id uuid, p_kind text, p_cursor text default null::text, p_parent_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_cursor public.marketplace_account_entries; v_items jsonb; v_total bigint; v_next text;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists (select 1 from public.marketplace_connections c where c.workspace_id = p_workspace_id and c.id = p_connection_id and c.marketplace = 'vinted') then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('publication', 'conversation', 'message', 'sale', 'activity') or ((p_kind = 'message') <> (p_parent_id is not null)) then raise exception 'Ungültige Seitenart' using errcode = '22023'; end if;
  if p_kind = 'message' and not exists (select 1 from public.marketplace_visible_account_entries e where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.id = p_parent_id and e.kind = 'conversation') then raise exception 'Gespräch nicht verfügbar' using errcode = '42501'; end if;
  if p_cursor is not null then
    select * into v_cursor from public.marketplace_visible_account_entries e where e.id::text = p_cursor and e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id;
    if not found then raise exception 'Ungültiger Seitencursor' using errcode = '22023'; end if;
  end if;
  select count(*) into v_total from public.marketplace_visible_account_entries e where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id;
  with candidates as (
    select e.*, row_number() over (order by e.sort_at desc, e.id desc) as position,
      case when p_kind='conversation' then public.marketplace_conversation_read_version(e.workspace_id,e.connection_id,e.id) end as current_read_version
    from public.marketplace_visible_account_entries e
    where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id
      and (p_cursor is null or (e.sort_at, e.id) < (v_cursor.sort_at, v_cursor.id))
    order by e.sort_at desc, e.id desc limit 51
  )
  select coalesce(jsonb_agg((e.body || jsonb_build_object('id', e.id, 'workspaceId', e.workspace_id, 'connectionId', e.connection_id)
    || case when p_kind='conversation' then jsonb_build_object('readVersion',e.current_read_version,
      'unread',case when e.body->>'unread'='true' and e.conversation_read_version=e.current_read_version then 'false'::jsonb else e.body->'unread' end)
      -- Der Artikelstreifen zeigt den gespeicherten Inseratspreis, keinen privaten Transaktionspreis.
      || coalesce((select jsonb_build_object('itemPrice',publication.body->'price','itemCurrency',publication.body->'currency')
        from public.marketplace_account_entries publication
        where publication.workspace_id=e.workspace_id and publication.connection_id=e.connection_id
          and publication.kind='publication' and publication.external_id=e.body->>'itemId'
          and e.body->>'isBundle' is distinct from 'true'
          and case when jsonb_typeof(publication.body->'price')='number' then (publication.body->>'price')::numeric>=0 else false end
          and publication.body->>'currency' ~ '^[A-Z]{3}$'),'{}'::jsonb) else '{}'::jsonb end
    || case when p_kind='sale' then jsonb_build_object('conversationId',(select conversation.id from public.marketplace_account_entries conversation where conversation.workspace_id=e.workspace_id and conversation.connection_id=e.connection_id and conversation.kind='conversation' and conversation.external_id=e.body->>'externalConversationId')) else '{}'::jsonb end
    || case when p_kind = 'message' then jsonb_build_object('conversationId', e.parent_id, 'externalId', e.external_id,
      -- Nur bestätigte Versandbelege zu diesem Konto und Gespräch kennzeichnen; Anbietertexte sind keine Herkunftsbelege.
      'isAutomated', coalesce(e.body->>'direction' = 'outbound', false) and (exists (
        select 1 from public.marketplace_favorite_message_events f
        join public.marketplace_account_entries conversation on conversation.id = e.parent_id
          and conversation.workspace_id = e.workspace_id and conversation.connection_id = e.connection_id and conversation.kind = 'conversation'
        join public.marketplace_connections connection on connection.workspace_id=f.workspace_id and connection.id=f.connection_id
        where f.workspace_id = e.workspace_id and f.connection_id = e.connection_id and f.state = 'sent'
          and (f.external_account_id is null or f.external_account_id=connection.external_account_id)
          and (
            (f.external_message_id=e.external_id and coalesce(e.body->>'messageType','') not in ('offer_message','offer_request_message'))
            or (f.offer_state='sent' and f.external_offer_id=e.external_id
              and e.body->>'messageType' in ('offer_message','offer_request_message')
              and f.external_conversation_id=conversation.external_id)
          )
          and (f.external_conversation_id is null or f.external_conversation_id = conversation.external_id)
      ) or exists (
        select 1 from public.marketplace_negotiation_jobs job
        join public.marketplace_connections connection on connection.workspace_id=job.workspace_id and connection.id=job.connection_id
          and connection.external_account_id=job.external_account_id
        join public.marketplace_account_entries conversation on conversation.id=e.parent_id
          and conversation.workspace_id=e.workspace_id and conversation.connection_id=e.connection_id and conversation.kind='conversation'
        where job.workspace_id=e.workspace_id and job.connection_id=e.connection_id and job.conversation_id=e.parent_id
          and job.automated and job.state='sent' and (
            (job.action='message' and job.command->>'kind'='message'
              and coalesce(e.body->>'messageType','') not in ('offer_message','offer_request_message'))
            or (job.action='counter' and job.command->>'kind'='offer'
              and e.body->>'messageType' in ('offer_message','offer_request_message'))
          )
          and job.external_id=e.external_id and job.command->>'externalConversationId'=conversation.external_id
      ))) else '{}'::jsonb end) order by e.position) filter (where e.position <= 50), '[]'::jsonb),
    case when count(*) > 50 then max(e.id::text) filter (where e.position = 50) else null end
    into v_items, v_next from candidates e;
  return jsonb_build_object('items', v_items, 'total', v_total, 'nextCursor', v_next);
end;
$function$
;

create trigger marketplace_preserve_vinted_sale before insert or update on public.marketplace_account_entries for each row execute function marketplace_preserve_vinted_sale();


-- Deklarative Sichtoptionen und Rechte vollständig übernehmen.
create or replace view public.marketplace_visible_account_entries with (security_invoker=true) as
select e.* from public.marketplace_account_entries e
where e.kind<>'publication' or coalesce((
  select sale.body->>'saleState'='relisted'
    and sale.body->>'saleStateAt' is not null and sale.sort_at>'1970-01-01T00:00:00Z'::timestamptz
    and e.observed_at>=sale.sort_at
    and coalesce(e.body->>'publicationState','unknown') in ('active','reserved')
  from public.marketplace_account_entries sale
  join public.marketplace_connections c on c.workspace_id=sale.workspace_id and c.id=sale.connection_id and c.marketplace='vinted'
  where sale.workspace_id=e.workspace_id and sale.connection_id=e.connection_id and sale.kind='sale'
    and sale.body->>'sellerId'=c.external_account_id
    and sale.body->>'saleState' in ('sold','shipped','completed','cancelled','relisted')
    and (sale.body->'itemIds') ? e.external_id
  -- Ohne Quellzeit ist eine andere Transaktion zeitlich nicht als älter belegt.
  order by (sale.body->>'saleState'<>'relisted'
    and sale.sort_at<='1970-01-01T00:00:00Z'::timestamptz) desc,
    sale.sort_at desc,sale.id desc limit 1
),true);
comment on view public.marketplace_visible_account_entries is 'RLS-geschützte Kontolesekopie ohne verkaufte oder noch nicht wieder eingestellte stornierte Artikel im Kleiderschrank; Verkaufshistorie bleibt erhalten.';
revoke all on public.marketplace_visible_account_entries from public,anon,authenticated;
grant select on public.marketplace_visible_account_entries to authenticated,service_role;
revoke all on function public.marketplace_preserve_vinted_sale() from public,anon,authenticated;
grant execute on function public.marketplace_preserve_vinted_sale() to service_role;
revoke all on public.marketplace_visible_account_entries from public,anon,authenticated;
grant select on public.marketplace_visible_account_entries to authenticated,service_role;

-- Bestandsabgleich: vorhandene Altersanker durch den normalisierenden Zeittrigger neu einordnen.
-- Es werden keine Inserate oder Verkaufsvorgänge gelöscht oder beim Anbieter verändert.
update public.marketplace_account_entries e set body=e.body
where e.kind='publication' and e.body->>'publicationState' in ('active','reserved','ended','unknown') and jsonb_typeof(e.body->'publicationAge')='object'
  and exists(select 1 from public.marketplace_connections c where c.workspace_id=e.workspace_id and c.id=e.connection_id and c.marketplace='vinted');

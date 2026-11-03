-- Zweck: Kleiderschrank-Artikel beim Relisting erhalten, schützen und atomar neu verknüpfen.
-- Betroffen: marketplace_listing_jobs, Artikelimport, Artikelzuordnung und Inseratstatistik.
-- Automatisch aus CLI-Diff und unveränderten S0/S1-Katalogobjekten erzeugt; Roh-SHA256: c9b336947e2441e40bedeab90332f238a5904bb309ad8779d176eabc27b119fa.
alter table "public"."marketplace_listing_jobs" drop constraint "marketplace_listing_jobs_editing_previous_state_check";

alter table "public"."marketplace_listing_jobs" add column "relist_entry_id" uuid;

create index marketplace_listing_jobs_relist_entry on public.marketplace_listing_jobs using btree (relist_entry_id) where (relist_entry_id is not null);

alter table "public"."marketplace_listing_jobs" add constraint "marketplace_listing_jobs_relist_entry_check" check (((relist_entry_id is null) or (snapshot ? 'relistExternalId'::text))) not valid;

alter table "public"."marketplace_listing_jobs" validate constraint "marketplace_listing_jobs_relist_entry_check";

alter table "public"."marketplace_listing_jobs" add constraint "marketplace_listing_jobs_workspace_id_connection_id_relist_fkey" foreign key (workspace_id, connection_id, relist_entry_id) references public.marketplace_account_entries(workspace_id, connection_id, id) on delete set null (relist_entry_id) not valid;

alter table "public"."marketplace_listing_jobs" validate constraint "marketplace_listing_jobs_workspace_id_connection_id_relist_fkey";

alter table "public"."marketplace_listing_jobs" add constraint "marketplace_listing_jobs_editing_previous_state_check" check ((editing_previous_state = any (array['queued'::text, 'paused'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."marketplace_listing_jobs" validate constraint "marketplace_listing_jobs_editing_previous_state_check";

set check_function_bodies = off;

create or replace function public.marketplace_accept_relisting_import(p_workspace_id uuid, p_connection_id uuid, p_external_id text, p_observed_at timestamp with time zone)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare v_job public.marketplace_listing_jobs; v_entry_id uuid;
begin
  for v_job in select job.* from public.marketplace_listing_jobs job
    join public.marketplace_connections account on account.workspace_id=job.workspace_id and account.id=job.connection_id and account.external_account_id=job.external_account_id
    where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.external_id=p_external_id
      and job.state='confirmed' and job.snapshot ? 'relistExternalId' and job.relist_imported_at is null and p_observed_at>job.finished_at
      and public.marketplace_relisting_job_is_latest(job) for update of job loop
    v_entry_id:=public.marketplace_relink_relisting_entry(v_job);
    if v_entry_id is not null then
      update public.marketplace_listing_jobs set relist_imported_at=p_observed_at where id=v_job.id;
    end if;
  end loop;
end;
$function$;

create or replace function public.marketplace_bind_relisting_entry(p_job public.marketplace_listing_jobs)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare v_entry_id uuid;
begin
  if not (p_job.snapshot ? 'relistExternalId') or p_job.connection_id is null
    or not exists(select 1 from public.marketplace_connections account where account.workspace_id=p_job.workspace_id and account.id=p_job.connection_id
      and account.marketplace='vinted' and account.external_account_id=p_job.external_account_id) then return null; end if;
  select id into v_entry_id from public.marketplace_account_entries
    where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and kind='publication'
      and (external_id=p_job.snapshot->>'relistExternalId' or (p_job.state='confirmed' and external_id=p_job.external_id))
      and (p_job.relist_entry_id is null or id=p_job.relist_entry_id)
    order by (external_id=p_job.snapshot->>'relistExternalId') desc limit 1 for update;
  if v_entry_id is not null and p_job.relist_entry_id is null then
    update public.marketplace_listing_jobs set relist_entry_id=v_entry_id where id=p_job.id and relist_entry_id is null;
  end if;
  return v_entry_id;
end;
$function$;

create or replace function public.marketplace_relink_relisting_entry(p_job public.marketplace_listing_jobs)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare v_source public.marketplace_account_entries; v_target public.marketplace_account_entries; v_body jsonb; v_entry_id uuid;
begin
  if p_job.state<>'confirmed' or p_job.action<>'publish' or not (p_job.snapshot ? 'relistExternalId') or p_job.connection_id is null
    or not public.marketplace_relisting_job_is_latest(p_job)
    or not exists(select 1 from public.marketplace_connections account where account.workspace_id=p_job.workspace_id and account.id=p_job.connection_id
      and account.marketplace='vinted' and account.external_account_id=p_job.external_account_id) then return p_job.relist_entry_id; end if;
  if p_job.external_id=p_job.snapshot->>'relistExternalId' then raise exception 'Das neue Inserat verwendet die alte Anbieterkennung.' using errcode='22023'; end if;
  v_entry_id:=public.marketplace_bind_relisting_entry(p_job);
  select * into v_source from public.marketplace_account_entries where id=v_entry_id for update;
  select * into v_target from public.marketplace_account_entries where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id
    and kind='publication' and external_id=p_job.external_id for update;
  if v_target.id is not null and (v_source.id is distinct from v_target.id or p_job.relist_entry_id is null) and (
    exists(select 1 from public.marketplace_listing_jobs other where other.id<>p_job.id and other.relist_entry_id=v_target.id)
    or exists(select 1 from public.marketplace_account_entries child where child.parent_id=v_target.id)
  ) then raise exception 'Die neue Anbieterkennung gehört bereits zu einer anderen Artikelzuordnung.' using errcode='23505'; end if;
  if v_source.id=v_target.id then return v_source.id; end if;
  v_body:=coalesce(v_target.body,jsonb_build_object(
    'title',p_job.snapshot->'content'->>'title','text',p_job.snapshot->'content'->>'description','textState','loaded',
    'price',(p_job.snapshot->'content'->>'priceCents')::numeric/100,'currency',p_job.snapshot->'content'->>'currency',
    'brand',p_job.snapshot->'content'->>'brandLabel','size',p_job.snapshot->'content'->>'sizeLabel',
    'publicationState',case when p_job.provider_state='active' then 'active' else 'unknown' end,'status',p_job.provider_state,
    'createdAt',null,'occurredAt',null,'publicationAge',null,
    'imageUrl',v_source.body->'imageUrl','imageUrls',coalesce(v_source.body->'imageUrls','[]'::jsonb),
    'metrics',jsonb_build_object('views',null,'favorites',null,'observedAt',p_job.finished_at)));
  -- Ein späterer Publishbeleg überstimmt den vorher gelesenen Anbieterentwurf.
  -- Kennzahlen und Fotos bleiben aus der echten neuen Anzeige; die bestätigten Kernwerte gewinnen.
  if v_target.observed_at<=p_job.verified_at then
    v_body:=v_body||jsonb_build_object('title',p_job.snapshot->'content'->>'title','text',p_job.snapshot->'content'->>'description','textState','loaded',
      'price',(p_job.snapshot->'content'->>'priceCents')::numeric/100,'currency',p_job.snapshot->'content'->>'currency',
      'brand',p_job.snapshot->'content'->>'brandLabel','size',p_job.snapshot->'content'->>'sizeLabel',
      'publicationState',case when p_job.provider_state='active' then 'active' else 'unknown' end,
      'status',p_job.provider_state,'publicationAge',null,'occurredAt',null);
  end if;
  if v_body->>'textState' is distinct from 'loaded' then
    v_body:=v_body||jsonb_build_object('text',p_job.snapshot->'content'->>'description','textState','loaded');
  end if;
  if v_source.id is null then
    -- Ein früher bereits entfernter Altcache hat keine rekonstruierbare UUID.
    -- Die belegte neue Anzeige wird nur in diesem Altfall zur dauerhaften Bindung.
    if v_target.id is null then
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
        values(p_job.workspace_id,p_job.connection_id,'publication',p_job.external_id,v_body,p_job.verified_at,p_job.finished_at) returning id into v_entry_id;
    else v_entry_id:=v_target.id; end if;
  else
    if v_target.id is not null then
      update public.marketplace_listing_metric_observations set entry_id=v_source.id
        where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and entry_id=v_target.id;
      update public.marketplace_favorite_notification_events set entry_id=v_source.id
        where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and entry_id=v_target.id and external_listing_id=p_job.external_id;
      delete from public.marketplace_account_entries where id=v_target.id;
    end if;
    update public.marketplace_listing_statistic_items set removed_at=coalesce(removed_at,p_job.finished_at)
      where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and external_id=p_job.snapshot->>'relistExternalId';
    update public.marketplace_account_entries set external_id=p_job.external_id,body=v_body,observed_at=greatest(p_job.finished_at,v_target.observed_at),
      favorite_notification_version=v_target.favorite_notification_version where id=v_source.id returning id into v_entry_id;
  end if;
  update public.marketplace_listing_jobs set relist_entry_id=v_entry_id where id=p_job.id;
  return v_entry_id;
end;
$function$;

create or replace function public.marketplace_relisting_import_allowed(p_workspace_id uuid, p_connection_id uuid, p_external_id text, p_pruning boolean default false)
 returns boolean
 language plpgsql
 stable
 set search_path to ''
as $function$
begin
  return not exists(
    select 1 from public.marketplace_listing_jobs job
    join public.marketplace_connections account on account.workspace_id=job.workspace_id and account.id=job.connection_id
      and account.marketplace='vinted' and account.external_account_id=job.external_account_id
    join public.marketplace_listing_drafts draft on draft.workspace_id=job.workspace_id and draft.id=job.draft_id
    where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.snapshot ? 'relistExternalId'
      and ((job.snapshot->>'relistExternalId'=p_external_id and (job.state='confirmed' or (
        (job.state in ('queued','paused','claimed','writing','outcome_unknown','failed') or (job.state='cancelled' and draft.relist_deleted_at is not null))
        and public.marketplace_relisting_job_is_latest(job))))
        or (p_pruning and job.state='confirmed' and job.external_id=p_external_id and job.relist_imported_at is null and public.marketplace_relisting_job_is_latest(job)))
  );
end;
$function$;

create or replace function public.marketplace_relisting_job_is_latest(p_job public.marketplace_listing_jobs)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select not exists(select 1 from public.marketplace_listing_jobs newer where newer.workspace_id=p_job.workspace_id and newer.connection_id=p_job.connection_id
    and newer.external_account_id=p_job.external_account_id and newer.snapshot ? 'relistExternalId' and newer.id>p_job.id
    and ((p_job.relist_entry_id is not null and newer.relist_entry_id=p_job.relist_entry_id)
      or newer.snapshot->>'relistExternalId'=p_job.snapshot->>'relistExternalId'
      or (p_job.state='confirmed' and (p_job.relist_entry_id is null or newer.relist_entry_id is null) and newer.snapshot->>'relistExternalId'=p_job.external_id)));
$function$;

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
  if not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
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
    if v_kind='publication' and not public.marketplace_relisting_import_allowed(p_workspace_id,p_connection_id,v_entry->>'externalId') then continue; end if;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_kind,v_entry->>'externalId',v_parent_id,v_body,(v_entry->>'sortAt')::timestamptz,v_observed_at)
      on conflict (workspace_id,connection_id,kind,external_id) do update
        set parent_id = excluded.parent_id,body = excluded.body,sort_at = excluded.sort_at,observed_at = excluded.observed_at
        where public.marketplace_account_entries.observed_at <= excluded.observed_at;
    if found then
      v_counts := jsonb_set(v_counts,array[v_kind],to_jsonb((v_counts->>v_kind)::int + 1));
      if v_kind='publication' then perform public.marketplace_accept_relisting_import(p_workspace_id,p_connection_id,v_entry->>'externalId',v_observed_at); end if;
    end if;
  end loop;

  -- Nur nachweislich vollständige Listen dürfen fehlende alte Einträge entfernen.
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.observed_at < v_observed_at and a.kind in ('publication','conversation')
    and (a.kind<>'publication' or public.marketplace_relisting_import_allowed(p_workspace_id,p_connection_id,a.external_id,true))
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
$function$;

create or replace function public.marketplace_cloud_listing_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_job public.marketplace_listing_jobs; v_permission public.marketplace_listing_permissions; v_session public.marketplace_browser_sessions;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt.' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  perform public.marketplace_expire_cloud_listing_attempts();
  update public.marketplace_listing_jobs job set state='cancelled',error_code='authorization_revoked',lease_expires_at=null
    where execution_mode='cloud' and state in ('queued','paused','claimed') and not (job.state='paused' and job.error_code='editing') and not public.marketplace_listing_job_valid(job);
  update public.marketplace_listing_jobs job set state='paused',error_code='schedule_late'
    where execution_mode='cloud' and state='queued' and public.marketplace_listing_job_timing(coalesce(job.relist_publish_at,job.scheduled_at),job.late_policy,clock_timestamp())='paused';
  if exists(select 1 from public.marketplace_browser_sessions where state in ('active','stopping')) then return null; end if;
  select * into v_job from public.marketplace_listing_jobs job where execution_mode='cloud' and state='queued' and public.marketplace_listing_job_valid(job)
    and ((job.snapshot ? 'relistExternalId' and job.relist_publish_at is null) or public.marketplace_listing_job_timing(coalesce(job.relist_publish_at,job.scheduled_at),job.late_policy,clock_timestamp())='due')
    order by scheduled_at nulls first,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_permission from public.marketplace_listing_permissions where id=v_job.permission_id for update;
  perform public.marketplace_bind_relisting_entry(v_job);
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_job.workspace_id,v_job.connection_id,v_job.requested_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_listing_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,absolute_expires_at=v_session.absolute_expires_at,
    cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id::text,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'userId',v_job.requested_by,
    'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_job.authorization_version,'externalAccountId',v_job.external_account_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'action',v_job.action,'snapshot',v_job.snapshot || case when v_job.snapshot ? 'relistExternalId' then jsonb_build_object('relistStage',case when v_job.relist_publish_at is null then 'delete' else 'publish' end) else '{}'::jsonb end);
end;
$function$;

create or replace function public.marketplace_cloud_listing_finish(p_workspace_id uuid, p_connection_id uuid, p_job_id text, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint, p_result jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  -- Späte Belege benötigen die ursprüngliche Kennung; neue Schreibaktionen bleiben gesperrt.
  select * into v_job from public.marketplace_listing_jobs where workspace_id=p_workspace_id and id=p_job_id::bigint and execution_mode='cloud'
    and (connection_id=p_connection_id or (connection_id is null and snapshot->>'connectionId'=p_connection_id::text))
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch for update;
  if not found then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  if p_result->>'outcome'='relisting_deleted' then
    if v_job.provider_result=p_result then return public.marketplace_listing_job_document(v_job); end if;
    if (select count(*) from jsonb_object_keys(p_result))<>4 or p_result->>'externalId' is distinct from v_job.snapshot->>'relistExternalId'
      or p_result->>'externalAccountId' is distinct from v_job.external_account_id or p_result->>'verifiedAt' is null
      or (p_result->>'verifiedAt')::timestamptz > clock_timestamp()+interval '1 minute' or (p_result->>'verifiedAt')::timestamptz < v_job.started_at-interval '1 minute'
      or v_job.started_at is null or v_job.state not in ('writing','outcome_unknown') or v_job.relist_publish_at is not null then
      raise exception 'Ungültiger Löschbeleg.' using errcode='22023';
    end if;
    -- Inhalt und Position der ursprünglichen Karte bleiben bis zur bestätigten Neuverknüpfung erhalten.
    perform public.marketplace_bind_relisting_entry(v_job);
    update public.marketplace_listing_drafts set relist_deleted_at=(p_result->>'verifiedAt')::timestamptz,relist_deleted_account_id=v_job.external_account_id where id=v_job.draft_id;
    update public.marketplace_listing_jobs set state='queued',error_code=null,started_at=null,lease_expires_at=null,
      relist_publish_at=coalesce(scheduled_at,clock_timestamp()+make_interval(secs=>relist_delay_seconds)),provider_result=p_result
      where id=v_job.id returning * into v_job;
    return public.marketplace_listing_job_document(v_job);
  end if;
  return public.marketplace_listing_finish_job(v_job,p_result);
end;
$function$;

create or replace function public.marketplace_edit_relisting_plan(p_job_id text, p_expected_version bigint, p_editing boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_job.workspace_id);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint for update;
  if v_job.version is distinct from p_expected_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
  if p_editing is null or not (v_job.snapshot ? 'relistExternalId') or v_job.state not in ('queued','paused','failed','cancelled')
    or (v_job.state='cancelled' and not exists(select 1 from public.marketplace_listing_drafts where id=v_job.draft_id and relist_deleted_at is not null))
    or (v_job.relist_publish_at is null and v_job.state not in ('failed','cancelled') and v_job.error_code is distinct from 'editing') then raise exception 'Die Veröffentlichung hat bereits begonnen.' using errcode='22023'; end if;
  if not p_editing and (v_job.error_code is distinct from 'editing' or (v_job.editing_previous_state='queued' and not public.marketplace_listing_job_valid(v_job))) then raise exception 'Die ursprüngliche Planung kann nicht fortgesetzt werden.' using errcode='22023'; end if;
  if p_editing then
    if v_job.state='paused' and v_job.error_code='editing' then return public.marketplace_listing_job_document(v_job); end if;
    update public.marketplace_listing_jobs set editing_previous_state=state,editing_previous_error_code=error_code,state='paused',error_code='editing' where id=v_job.id returning * into v_job;
  else
    -- Ältere unterbrochene Bearbeitungen ohne gesicherten Zustand bleiben angehalten.
    update public.marketplace_listing_jobs set state=coalesce(editing_previous_state,'paused'),error_code=editing_previous_error_code,
      editing_previous_state=null,editing_previous_error_code=null where id=v_job.id returning * into v_job;
  end if;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

create or replace function public.marketplace_enqueue_listing_internal(p_draft_id text, p_expected_revision bigint, p_action text, p_request_id uuid, p_ai_photo boolean, p_scheduled_at timestamp with time zone default null::timestamp with time zone, p_time_zone text default null::text, p_late_policy text default 'pause_after_30_minutes'::text, p_replaces_job_id bigint default null::bigint, p_replaces_version bigint default null::bigint, p_relist_delay_seconds integer default 0)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_draft public.marketplace_listing_drafts; v_permission public.marketplace_listing_permissions; v_job public.marketplace_listing_jobs; v_previous public.marketplace_listing_jobs; v_images jsonb; v_hash text; v_request jsonb; v_relist_entry_id uuid;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint and deleted_at is null;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  if p_expected_revision is null or p_expected_revision not between 1 and 9007199254740991 or p_request_id is null or p_action is null or p_action not in ('publish','vinted_draft') or p_ai_photo is null
    or p_late_policy is null or p_late_policy not in ('pause_after_30_minutes','publish_when_available')
    or (p_scheduled_at is null and p_time_zone is not null) or (p_scheduled_at is not null and (not isfinite(p_scheduled_at) or p_time_zone is null
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone))) then raise exception 'Ungültiger Inseratauftrag.' using errcode='22023'; end if;
  if p_relist_delay_seconds is null or p_relist_delay_seconds not in (0,60,120,180,300,600) or (p_relist_delay_seconds>0 and (v_draft.relist_external_id is null or p_scheduled_at is not null)) then raise exception 'Ungültige Relist-Verzögerung.' using errcode='22023'; end if;
  if (p_replaces_job_id is null)<>(p_replaces_version is null) or (p_replaces_job_id is not null and (p_replaces_job_id<=0 or p_replaces_version not between 1 and 9007199254740991 )) then
    raise exception 'Ungültiger Planungsersatz.' using errcode='22023';
  end if;
  -- Normale Auftragskennungen behalten ihren bisherigen Hash auch nach dieser Erweiterung.
  v_request:=jsonb_build_array(p_draft_id,p_expected_revision,p_action,p_ai_photo,
    to_char(p_scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),p_time_zone,p_late_policy);
  if p_replaces_job_id is not null then v_request:=v_request||jsonb_build_array(p_replaces_job_id::text,p_replaces_version); end if;
  if p_relist_delay_seconds>0 then v_request:=v_request||jsonb_build_array(p_relist_delay_seconds); end if;
  v_hash:=encode(extensions.digest(convert_to(v_request::text,'utf8'),'sha256'),'hex');
  select * into v_job from public.marketplace_listing_jobs where workspace_id=v_draft.workspace_id and requested_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if v_job.request_hash<>v_hash then raise exception 'Diese Auftragskennung wurde bereits verwendet.' using errcode='23505'; end if;
    return public.marketplace_listing_job_document(v_job);
  end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=v_draft.workspace_id and connection_id=v_draft.connection_id for share;
  if not public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())) then raise exception 'Inserataktionen sind für dieses Konto nicht freigegeben.' using errcode='42501'; end if;
  if p_scheduled_at is not null and p_scheduled_at<=clock_timestamp() then raise exception 'Der Veröffentlichungstermin muss in der Zukunft liegen.' using errcode='22023'; end if;
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  if v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.connection_id is distinct from v_permission.connection_id then raise exception 'Das Zielkonto wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.relist_external_id is not null and (p_action<>'publish' or v_permission.execution_mode<>'cloud'
    or (v_draft.relist_deleted_at is not null and v_draft.relist_deleted_account_id<>v_permission.external_account_id)
    or (v_draft.relist_deleted_at is null and not exists(select 1 from public.marketplace_account_entries e where e.workspace_id=v_draft.workspace_id and e.connection_id=v_draft.connection_id
      and e.kind='publication' and e.external_id=v_draft.relist_external_id and e.body->>'publicationState'='active'))) then
    raise exception 'Die Relist-Quelle ist nicht mehr verfügbar.' using errcode='22023';
  end if;
  if v_draft.relist_external_id is not null then
    select id into v_relist_entry_id from public.marketplace_account_entries where workspace_id=v_draft.workspace_id and connection_id=v_draft.connection_id
      and kind='publication' and external_id=v_draft.relist_external_id for update;
    -- Alte gelöschte Quellen ohne erhaltene Cachezeile bleiben wiederaufnehmbar; ihre frühere UUID wird nicht erfunden.
    if v_relist_entry_id is null and v_draft.relist_deleted_at is null then raise exception 'Die Relist-Quelle ist nicht mehr verfügbar.' using errcode='22023'; end if;
  end if;
  if p_replaces_job_id is not null then
    select * into v_previous from public.marketplace_listing_jobs where id=p_replaces_job_id and workspace_id=v_draft.workspace_id and draft_id=v_draft.id for update;
    if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
    if v_previous.version<>p_replaces_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
    if v_previous.state not in ('queued','paused') or (v_previous.scheduled_at is null and v_previous.relist_publish_at is null
      and not (v_previous.state='paused' and v_previous.error_code='editing' and v_previous.editing_previous_state in ('failed','cancelled'))) then raise exception 'Dieser Auftrag kann nicht mehr ersetzt werden.' using errcode='22023'; end if;
    if not public.marketplace_listing_permission_valid(v_previous.permission_id,v_previous.requested_by,v_previous.authorization_version)
      or v_previous.connection_id is distinct from v_draft.connection_id or v_previous.execution_mode<>v_permission.execution_mode or v_previous.external_account_id<>v_permission.external_account_id then
      raise exception 'Die bisherige Planung gehört nicht zur aktuellen Kontofreigabe.' using errcode='42501';
    end if;
    -- Bei jedem späteren Fehler wird auch dieser Abbruch vollständig zurückgerollt.
    update public.marketplace_listing_jobs set state='cancelled',error_code='planning_replaced' where id=v_previous.id;
  end if;
  if exists(select 1 from public.marketplace_listing_jobs where draft_id=v_draft.id and state in ('queued','paused','claimed','writing','outcome_unknown','confirmed')) then raise exception 'Für diesen Entwurf gibt es bereits einen offenen oder bestätigten Auftrag.' using errcode='23505'; end if;
  if v_draft.inventory_item_id is not null then
    perform 1 from public.inventory_items where id=v_draft.inventory_item_id and workspace_id=v_draft.workspace_id and archived_at is null and status in ('ready','listed') for share;
    if not found or not exists(select 1 from public.inventory_item_sale_states where inventory_item_id=v_draft.inventory_item_id and workspace_id=v_draft.workspace_id and sale_state='no_active_sale') then raise exception 'Dieser Artikel kann momentan nicht angeboten werden.' using errcode='22023'; end if;
  end if;
  if not public.marketplace_listing_photo_options_valid(v_draft.photo_options,v_draft.image_ids) then raise exception 'Die Bildbearbeitung passt nicht mehr zur Fotoauswahl.' using errcode='22023'; end if;
  if not public.marketplace_listing_content_valid(v_draft.content) or coalesce(length(btrim(v_draft.content->>'title')),0)=0 or coalesce(length(btrim(v_draft.content->>'description')),0)=0
    or coalesce(v_draft.content->>'currency','')<>'EUR' or coalesce((v_draft.content->>'priceCents')::bigint,0)<=0 or coalesce((v_draft.content->>'categoryId')::bigint,0)<=0
    or coalesce((v_draft.content->>'conditionId')::bigint,0)<=0 or coalesce((v_draft.content->>'packageSizeId')::bigint,0)<=0 or cardinality(v_draft.image_ids) not between 1 and 20 then raise exception 'Bitte Angaben und Fotos vor der Anbieteraktion vervollständigen.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('id',image.id::text,'storagePath',image.storage_path,'fileName',image.file_name,'mimeType',image.mime_type,'byteSize',image.byte_size) order by chosen.position) into v_images
    from unnest(v_draft.image_ids) with ordinality chosen(id,position) join public.marketplace_listing_images image on image.id=chosen.id and image.workspace_id=v_draft.workspace_id and image.draft_id=v_draft.id and image.state='ready'
    where exists(select 1 from storage.objects object where object.bucket_id='marketplace-listing-media' and object.name=image.storage_path and object.metadata->>'size'=image.byte_size::text and object.metadata->>'mimetype'=image.mime_type);
  if coalesce(jsonb_array_length(v_images),0)<>cardinality(v_draft.image_ids) then raise exception 'Die Originalfotos sind noch nicht vollständig gespeichert.' using errcode='22023'; end if;
  insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,permission_id,requested_by,request_id,request_hash,draft_revision,authorization_version,
    external_account_id,execution_mode,action,snapshot,scheduled_at,time_zone,late_policy,replaces_job_id,relist_delay_seconds,relist_publish_at,relist_entry_id)
    values(v_draft.workspace_id,v_draft.connection_id,v_draft.id,v_permission.id,(select auth.uid()),p_request_id,v_hash,v_draft.revision,v_permission.authorization_version,
      v_permission.external_account_id,v_permission.execution_mode,p_action,jsonb_build_object('content',v_draft.content-'aiPhoto','images',v_images,'aiPhoto',p_ai_photo,'bump',false,
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id,'photoOptions',v_draft.photo_options)
      || case when v_draft.relist_external_id is null then '{}'::jsonb else jsonb_build_object('relistExternalId',v_draft.relist_external_id) end,
      p_scheduled_at,p_time_zone,p_late_policy,p_replaces_job_id,p_relist_delay_seconds,case when v_draft.relist_deleted_at is not null then coalesce(p_scheduled_at,clock_timestamp()+make_interval(secs=>p_relist_delay_seconds)) else null end,v_relist_entry_id) returning * into v_job;
  if v_draft.relist_external_id is not null then perform public.marketplace_remember_listing_photo_source(v_job,v_draft.relist_external_id); end if;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

create or replace function public.marketplace_ingest_local_extension(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_snapshot jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_observed timestamptz; v_entry jsonb; v_count integer:=0; v_complete boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or (v_connection.external_account_id is not null and v_connection.external_account_id<>v_grant.external_account_id) then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  if p_snapshot is null then
    update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
    return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',v_grant.messages_read,'messagesSend',v_grant.messages_send,'inboxSyncedAt',(
      select max(last_success_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('conversations','messages')));
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>524288
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object' or p_snapshot->'identity'->>'id' is distinct from v_grant.external_account_id then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array' or jsonb_array_length(p_snapshot->'entries')>501
    or jsonb_typeof(p_snapshot->'publicationsComplete') is distinct from 'boolean' or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or jsonb_typeof(p_snapshot->'identity'->'username') is distinct from 'string' or char_length(p_snapshot->'identity'->>'username') not between 1 and 120 then raise exception 'Ungültiger lokaler Import' using errcode='22023'; end if;
  begin v_observed:=(p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Abrufzeit' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('profile','publications')),'-infinity') then raise exception 'Veralteter Import' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind'='profile')<>1
    or exists(select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Ungültige Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or v_entry->>'kind' is null or v_entry->>'kind' not in ('profile','publication')
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^[1-9][0-9]{0,31}$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='profile' then array['username','displayName','location','bio','bioState','imageUrl','feedbackCount','feedbackReputation','positiveFeedbackCount','neutralFeedbackCount','negativeFeedbackCount','itemCount','observedAt'] else array['title','text','textState','occurredAt','createdAt','publicationState','publicationAge','price','currency','status','imageUrl','imageUrls','metrics','promoted','brand','size','priceLabel','isClosed','isReserved'] end))
      or (v_entry->>'kind'='profile' and (v_entry->>'externalId'<>v_grant.external_account_id or v_entry->'body'->>'username' is distinct from p_snapshot->'identity'->>'username')) then raise exception 'Ungültiger Kontoeintrag' using errcode='22023'; end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end;
    if v_entry->>'kind'='publication' then
      if (v_entry->'body' ? 'publicationState' and (
          jsonb_typeof(v_entry->'body'->'publicationState') is distinct from 'string'
          or v_entry->'body'->>'publicationState' not in ('active','reserved','draft','hidden','ended','unknown')))
        or (coalesce(v_entry->'body'->'createdAt','null'::jsonb)<>'null'::jsonb and (
          jsonb_typeof(v_entry->'body'->'createdAt') is distinct from 'string'
          or not public.marketplace_publication_time_valid(v_entry->'body'->>'createdAt',v_observed)))
        or (coalesce(v_entry->'body'->'occurredAt','null'::jsonb)<>'null'::jsonb and (
          jsonb_typeof(v_entry->'body'->'occurredAt') is distinct from 'string'
          or not public.marketplace_publication_time_valid(v_entry->'body'->>'occurredAt',v_observed)))
        or (coalesce(v_entry->'body'->'publicationAge','null'::jsonb)<>'null'::jsonb
          and public.marketplace_publication_age_sort_at(v_entry->'body'->'publicationAge',v_observed) is null)
      then raise exception 'Ungültige Inseratquelle' using errcode='22023'; end if;
    end if;
    if v_entry->>'kind'='publication' and not public.marketplace_relisting_import_allowed(p_workspace_id,p_connection_id,v_entry->>'externalId') then continue; end if;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_entry->>'kind',v_entry->>'externalId',v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
      on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    if v_entry->>'kind'='publication' then
      v_count:=v_count+1;
      perform public.marketplace_accept_relisting_import(p_workspace_id,p_connection_id,v_entry->>'externalId',v_observed);
    end if;
  end loop;
  v_complete:=(p_snapshot->>'publicationsComplete')::boolean;
  -- Auch vollständige lokale Lesekopien löschen niemals Anzeigen oder interpretieren fehlende Datensätze als Verkauf.
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
    values(p_workspace_id,p_connection_id,'profile','complete',v_observed,v_observed,v_observed),
      (p_workspace_id,p_connection_id,'publications',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,
      last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  update public.marketplace_connections set external_account_id=v_grant.external_account_id,status='connected',capabilities=capabilities || '{"profile.read":"verified","listings.read":"verified"}'::jsonb,last_synced_at=greatest(last_synced_at,v_observed),updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  -- Der bestehende Connection-Trigger sendet account_imported mit last_synced_at.
  return jsonb_build_object('ok',true,'counts',jsonb_build_object('profile',1,'publication',v_count),'observedAt',v_observed);
end;
$function$;

create or replace function public.marketplace_list_listing_drafts(p_workspace_id uuid, p_query text default ''::text, p_cursor jsonb default null::jsonb, p_limit integer default 50)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_rows jsonb; v_last jsonb; v_cursor_id bigint; v_cursor_at timestamptz; v_more boolean;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode='42501'; end if;
  if p_query is null or length(p_query)>160 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Ungültige Entwurfssuche.' using errcode='22023'; end if;
  if p_cursor is not null and p_cursor<>'null'::jsonb then
    if jsonb_typeof(p_cursor)<>'object' or jsonb_typeof(p_cursor->'id') is distinct from 'string'
      or coalesce(p_cursor->>'id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    v_cursor_id:=(p_cursor->>'id')::bigint;
    if p_cursor ? 'createdAt' then
      if jsonb_typeof(p_cursor->'createdAt') is distinct from 'string'
        or coalesce(p_cursor->>'createdAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
      v_cursor_at:=(p_cursor->>'createdAt')::timestamptz;
    else
      -- Bereits geöffnete ältere Clients senden nur updatedAt. Ihr Datum bestimmt niemals die Sortierung.
      -- Auch gelöschte Arbeitskopien bleiben als eindeutig zugeordnete Cursor-Anker erhalten.
      if jsonb_typeof(p_cursor->'updatedAt') is distinct from 'string'
        or coalesce(p_cursor->>'updatedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
      perform (p_cursor->>'updatedAt')::timestamptz;
      select created_at into v_cursor_at from public.marketplace_listing_drafts where workspace_id=p_workspace_id and id=v_cursor_id;
      if not found then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    end if;
  end if;
  select coalesce(jsonb_agg(public.marketplace_listing_draft_document(d) order by d.created_at desc,d.id desc),'[]'::jsonb) into v_rows from (
    select * from public.marketplace_listing_drafts where workspace_id=p_workspace_id and deleted_at is null and relist_external_id is null
      and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(content->>'title'))>0)
      and (v_cursor_id is null or (created_at,id)<(v_cursor_at,v_cursor_id))
    order by created_at desc,id desc limit p_limit+1
  ) d;
  v_more:=jsonb_array_length(v_rows)>p_limit;
  if v_more then
    v_last:=v_rows->(p_limit-1);
    select jsonb_agg(value order by position) into v_rows from jsonb_array_elements(v_rows) with ordinality page(value,position) where position<=p_limit;
  end if;
  return jsonb_build_object('items',v_rows,'nextCursor',case when v_more then jsonb_build_object('id',v_last->>'id','createdAt',v_last->>'createdAt','updatedAt',v_last->>'updatedAt') else null end);
end;
$function$;

create or replace function public.marketplace_listing_finish_job(p_job public.marketplace_listing_jobs, p_result jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_outcome text; v_external_id text; v_provider_state text; v_verified_at timestamptz; v_error text; v_job public.marketplace_listing_jobs;
begin
  if p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'Ungültiges Inseratergebnis.' using errcode='22023'; end if;
  v_outcome:=p_result->>'outcome';
  if v_outcome='confirmed' then
    if (select count(*) from jsonb_object_keys(p_result))<>6 or p_result->>'action' is distinct from p_job.action or p_result->>'externalAccountId' is distinct from p_job.external_account_id or jsonb_typeof(p_result->'externalAccountId') is distinct from 'string'
      or jsonb_typeof(p_result->'externalId') is distinct from 'string' or coalesce(p_result->>'externalId','') !~ '^[1-9][0-9]{0,31}$'
      or (p_job.action='vinted_draft' and p_result->>'providerState' is distinct from 'draft')
      or (p_job.action='publish' and coalesce(p_result->>'providerState','') not in ('active','processing'))
      or coalesce(p_result->>'verifiedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then raise exception 'Ungültige Anbieterbestätigung.' using errcode='22023'; end if;
    begin v_verified_at:=(p_result->>'verifiedAt')::timestamptz; exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Bestätigungszeit.' using errcode='22023'; end;
    if to_char(v_verified_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') is distinct from p_result->>'verifiedAt'
      or v_verified_at>clock_timestamp()+interval '5 minutes' or (p_job.started_at is not null and v_verified_at<p_job.started_at-interval '5 minutes') then raise exception 'Bestätigungszeit gehört nicht zum Versuch.' using errcode='22023'; end if;
    v_external_id:=p_result->>'externalId'; v_provider_state:=p_result->>'providerState';
  elsif v_outcome in ('failed','outcome_unknown') then
    if (select count(*) from jsonb_object_keys(p_result))<>2 or jsonb_typeof(p_result->'errorCode') is distinct from 'string' or coalesce(p_result->>'errorCode','') !~ '^[a-z_]{1,80}$' then raise exception 'Ungültiges Inseratergebnis.' using errcode='22023'; end if;
    v_error:=p_result->>'errorCode';
  else raise exception 'Ungültiges Inseratergebnis.' using errcode='22023'; end if;
  if p_job.provider_result=p_result then return public.marketplace_listing_job_document(p_job); end if;
  if p_job.state='cancelled' and v_outcome='failed' and p_job.started_at is null then return public.marketplace_listing_job_document(p_job); end if;
  if p_job.state in ('confirmed','failed','cancelled') then raise exception 'Inseratergebnis bereits erfasst.' using errcode='23505'; end if;
  if v_outcome='confirmed' and (p_job.started_at is null or p_job.state not in ('writing','outcome_unknown')) then raise exception 'Inseratversuch wurde nicht begonnen.' using errcode='42501'; end if;
  if v_outcome<>'confirmed' and p_job.state not in ('claimed','writing','outcome_unknown') then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  update public.marketplace_listing_jobs set state=v_outcome,external_id=v_external_id,provider_state=v_provider_state,verified_at=v_verified_at,error_code=v_error,
    provider_result=p_result,finished_at=clock_timestamp(),lease_expires_at=null where id=p_job.id returning * into v_job;
  if v_outcome='confirmed' and v_job.snapshot ? 'relistExternalId' then
    perform public.marketplace_relink_relisting_entry(v_job);
    select * into v_job from public.marketplace_listing_jobs where id=v_job.id;
  end if;
  if v_outcome='confirmed' and v_job.action='publish' then perform public.marketplace_remember_listing_photo_source(v_job,v_external_id); end if;
  if v_outcome='confirmed' then perform public.marketplace_request_relisting_import(v_job); end if;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

create or replace function public.marketplace_listing_job_document(p_job public.marketplace_listing_jobs)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object('id',p_job.id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id,'draftId',p_job.draft_id::text,
    'draftRevision',p_job.draft_revision,'executionMode',p_job.execution_mode,'externalAccountId',p_job.external_account_id,'action',p_job.action,
    'state',p_job.state,'version',p_job.version,'scheduledAt',coalesce(p_job.relist_publish_at,p_job.scheduled_at),'timeZone',case when coalesce(p_job.relist_publish_at,p_job.scheduled_at) is not null then coalesce(p_job.time_zone,'Europe/Berlin') else null end,'latePolicy',p_job.late_policy,
    'errorCode',p_job.error_code,'externalId',p_job.external_id,'providerState',p_job.provider_state,'verifiedAt',p_job.verified_at,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at,'replacesJobId',p_job.replaces_job_id::text,
    'relistEntryId',p_job.relist_entry_id,'relistDeletedAt',(select relist_deleted_at from public.marketplace_listing_drafts where id=p_job.draft_id),'relistDelaySeconds',p_job.relist_delay_seconds,'relistExternalId',p_job.snapshot->>'relistExternalId','itemTitle',p_job.snapshot->'content'->>'title');
$function$;

create or replace function public.marketplace_read_listing_metric_changes(p_workspace_id uuid, p_connection_id uuid, p_period_minutes integer default 5)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare v_items jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted') then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  if p_period_minutes is null or p_period_minutes not in (5,60,1440,10080) then
    raise exception 'Ungültiger Statistikzeitraum' using errcode = '22023';
  end if;
  with comparisons as (
    select e.id, e.observed_at, latest.views, latest.favorites,
      baseline.observed_at as baseline_at, baseline.views as previous_views, baseline.favorites as previous_favorites
    from public.marketplace_account_entries e
    left join public.marketplace_listing_statistic_items item on item.workspace_id=e.workspace_id and item.connection_id=e.connection_id and item.external_id=e.external_id
    left join public.marketplace_listing_metric_observations latest on latest.entry_id=e.id and latest.observed_at=e.observed_at
      and latest.statistic_item_id=item.id
      and latest.workspace_id=p_workspace_id and latest.connection_id=p_connection_id
    left join lateral (
      select o.* from public.marketplace_listing_metric_observations o
      where o.workspace_id=p_workspace_id and o.connection_id=p_connection_id and o.entry_id=e.id
        and o.statistic_item_id=item.id
        and o.observed_at < e.observed_at
        -- Standard vergleicht zwei aufeinanderfolgende Abrufe, auch bei verzögertem Zeitplan.
        and (p_period_minutes=5 or o.observed_at <= e.observed_at - make_interval(mins=>p_period_minutes))
      order by o.observed_at desc limit 1
    ) baseline on true
    where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id and e.kind='publication'
      and e.body->>'publicationState' is distinct from 'draft'
  )
  select coalesce(jsonb_agg(jsonb_build_object('entryId',id,'observedAt',observed_at,'baselineAt',baseline_at,
    'views',case when views is not null and previous_views is not null then greatest(0,views-previous_views) end,
    'favorites',case when favorites is not null and previous_favorites is not null then greatest(0,favorites-previous_favorites) end) order by id),'[]'::jsonb)
    into v_items from comparisons;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'periodMinutes',p_period_minutes,'items',v_items);
end;
$function$;

create or replace function public.marketplace_read_relisting_plans(p_workspace_id uuid, p_connection_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_items jsonb; v_account text; v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  select external_account_id into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id;
  if not found then raise exception 'Kein Zugriff auf dieses Marktplatzkonto.' using errcode='42501'; end if;
  for v_job in select * from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=v_account
      and snapshot ? 'relistExternalId' and relist_entry_id is null and public.marketplace_relisting_job_is_latest(marketplace_listing_jobs) loop
    perform public.marketplace_bind_relisting_entry(v_job);
  end loop;
  for v_job in select * from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=v_account
      and state='confirmed' and snapshot ? 'relistExternalId' and relist_imported_at is null and public.marketplace_relisting_job_is_latest(marketplace_listing_jobs) loop
    perform public.marketplace_relink_relisting_entry(v_job);
  end loop;
  update public.marketplace_listing_jobs job set relist_imported_at=clock_timestamp()
    where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.external_account_id=v_account
      and job.state='confirmed' and job.snapshot ? 'relistExternalId' and job.relist_imported_at is null
      and exists(select 1 from public.marketplace_account_entries entry where entry.workspace_id=p_workspace_id and entry.connection_id=p_connection_id and entry.kind='publication' and entry.external_id=job.external_id and entry.observed_at>job.finished_at)
      and not exists(select 1 from public.marketplace_account_entries entry where entry.workspace_id=p_workspace_id and entry.connection_id=p_connection_id and entry.kind='publication' and entry.external_id=job.snapshot->>'relistExternalId');
  for v_job in select * from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=v_account
      and state='confirmed' and snapshot ? 'relistExternalId' and relist_imported_at is null and public.marketplace_relisting_job_is_latest(marketplace_listing_jobs) loop
    perform public.marketplace_request_relisting_import(v_job);
  end loop;
  select coalesce(jsonb_agg(public.marketplace_listing_job_document(job)||jsonb_build_object('job',public.marketplace_listing_job_document(job),'draft',public.marketplace_listing_job_draft_document(job)) order by job.created_at desc),'[]'::jsonb) into v_items
    from public.marketplace_listing_jobs job where workspace_id=p_workspace_id and connection_id=p_connection_id and snapshot ? 'relistExternalId'
    and external_account_id=v_account and (state in ('queued','paused','claimed','writing','outcome_unknown','failed') or (state='confirmed' and relist_imported_at is null)
      or (state='cancelled' and exists(select 1 from public.marketplace_listing_drafts where id=job.draft_id and relist_deleted_at is not null)))
    and public.marketplace_relisting_job_is_latest(job);
  return jsonb_build_object('items',v_items);
end;
$function$;

create or replace function public.marketplace_record_favorite_notification_event()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare v_context jsonb; v_setting public.marketplace_favorite_notification_settings;
  v_previous bigint; v_favorites bigint; v_notification_id bigint;
begin
  v_context := nullif(current_setting('flipbase.favorite_notification_import',true),'')::jsonb;
  if old.kind <> 'publication' or new.kind <> 'publication' or new.observed_at <= old.observed_at
    or new.workspace_id is distinct from old.workspace_id or new.connection_id is distinct from old.connection_id or new.external_id is distinct from old.external_id
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
  if v_notification_id is not null then
    perform set_config('flipbase.favorite_notification_import',(v_context||jsonb_build_object('notificationId',v_notification_id))::text,true);
  else
    select id into v_notification_id from public.marketplace_favorite_notifications
      where workspace_id = new.workspace_id and connection_id = new.connection_id and observed_at = new.observed_at;
  end if;
  insert into public.marketplace_favorite_notification_events(workspace_id,connection_id,notification_id,entry_id,external_listing_id,title,previous_favorites,favorites,observed_at,setting_version)
    values(new.workspace_id,new.connection_id,v_notification_id,new.id,new.external_id,coalesce(new.body->>'title','Inserat'),v_previous,v_favorites,new.observed_at,v_setting.version)
    on conflict (workspace_id,connection_id,external_listing_id,observed_at) do nothing;
  return new;
end;
$function$;

create or replace function public.marketplace_record_listing_metrics()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_item_id bigint;
  v_title text := nullif(btrim(new.body->>'title'),'');
  v_image_url text := nullif(new.body->>'imageUrl','');
  v_price numeric := case when jsonb_typeof(new.body->'price') = 'number' then (new.body->>'price')::numeric end;
  v_currency text := nullif(new.body->>'currency','');
  v_first_seen_at timestamptz := new.observed_at;
begin
  if new.kind <> 'publication' or new.body->>'publicationState'='draft' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.external_id=new.external_id and new.observed_at <= old.observed_at then return new; end if;
    if old.external_id=new.external_id and old.body->>'publicationState' is distinct from 'draft' then v_first_seen_at := old.observed_at; end if;
  end if;
  -- Fehlende Angaben eines Abrufs überschreiben keine bekannten Stammdaten.
  insert into public.marketplace_listing_statistic_items as i(workspace_id,connection_id,external_id,title,image_url,price,currency,first_seen_at,last_seen_at)
    values(new.workspace_id,new.connection_id,new.external_id,coalesce(v_title,'Inserat'),v_image_url,v_price,v_currency,v_first_seen_at,new.observed_at)
    on conflict (workspace_id,connection_id,external_id) do update set
      title = coalesce(v_title,i.title),
      image_url = coalesce(v_image_url,i.image_url),
      price = coalesce(v_price,i.price),
      currency = coalesce(v_currency,i.currency),
      first_seen_at = least(i.first_seen_at,excluded.first_seen_at),
      last_seen_at = greatest(i.last_seen_at,excluded.last_seen_at),
      removed_at = null
    returning i.id into v_item_id;
  if tg_op = 'UPDATE' and old.external_id=new.external_id and old.body->>'publicationState' is distinct from 'draft' then
    -- Beim ersten neuen Abruf bleibt auch die bereits gespeicherte Ausgangsbasis erhalten.
    insert into public.marketplace_listing_metric_observations(workspace_id,connection_id,entry_id,observed_at,views,favorites,statistic_item_id)
      values(old.workspace_id,old.connection_id,old.id,old.observed_at,public.marketplace_known_metric_count(old.body,'views'),public.marketplace_known_metric_count(old.body,'favorites'),v_item_id)
      on conflict (statistic_item_id,observed_at) do nothing;
  end if;
  -- Unveränderte Werte ebenfalls erfassen: der nächste Abruf muss null Zuwachs zeigen.
  insert into public.marketplace_listing_metric_observations(workspace_id,connection_id,entry_id,observed_at,views,favorites,statistic_item_id)
    values(new.workspace_id,new.connection_id,new.id,new.observed_at,public.marketplace_known_metric_count(new.body,'views'),public.marketplace_known_metric_count(new.body,'favorites'),v_item_id)
    on conflict (statistic_item_id,observed_at) do nothing;
  return new;
end;
$function$;

create or replace function public.marketplace_request_relisting_import(p_job public.marketplace_listing_jobs)
 returns void
 language plpgsql
 set search_path to ''
as $function$
begin
  if p_job.state<>'confirmed' or p_job.action<>'publish' or p_job.execution_mode<>'cloud' or not (p_job.snapshot ? 'relistExternalId')
    or not public.marketplace_relisting_job_is_latest(p_job)
    or p_job.relist_imported_at is not null or not public.marketplace_sync_authorization_valid(p_job.workspace_id,p_job.requested_by)
    or not exists(select 1 from public.marketplace_connections where id=p_job.connection_id and workspace_id=p_job.workspace_id
      and external_account_id=p_job.external_account_id and execution_mode='cloud' and status='connected') then return; end if;
  if exists(select 1 from public.marketplace_operations where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id
    and created_at>=p_job.finished_at and (state in ('queued','running') or finished_at>clock_timestamp()-interval '1 minute')) then return; end if;
  insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,created_at)
    values(p_job.workspace_id,p_job.connection_id,p_job.requested_by,'manual_read',1,clock_timestamp())
    on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
end;
$function$;

-- Explizite Rechte ausschließlich der neuen Relisting-Helfer aus dem deklarativen Schema.
revoke all on function public.marketplace_relisting_import_allowed(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.marketplace_relisting_import_allowed(uuid,uuid,text,boolean) to service_role;
revoke all on function public.marketplace_relisting_job_is_latest(public.marketplace_listing_jobs) from public,anon,authenticated;
grant execute on function public.marketplace_relisting_job_is_latest(public.marketplace_listing_jobs) to service_role;
revoke all on function public.marketplace_bind_relisting_entry(public.marketplace_listing_jobs) from public,anon,authenticated;
grant execute on function public.marketplace_bind_relisting_entry(public.marketplace_listing_jobs) to service_role;
revoke all on function public.marketplace_relink_relisting_entry(public.marketplace_listing_jobs) from public,anon,authenticated;
grant execute on function public.marketplace_relink_relisting_entry(public.marketplace_listing_jobs) to service_role;
revoke all on function public.marketplace_accept_relisting_import(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.marketplace_accept_relisting_import(uuid,uuid,text,timestamptz) to service_role;

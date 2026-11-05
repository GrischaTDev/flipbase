-- Erstellungskennungen ungeklärter Relistings behalten und mit echten Kontoimporten verknüpfen.
-- Betroffen: marketplace_listing_jobs, marketplace_account_entries und vorhandene Relisting-Funktionen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create or replace function public.marketplace_accept_relisting_import (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_external_id   text,
  p_observed_at   timestamp with time zone
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
declare v_job public.marketplace_listing_jobs; v_entry public.marketplace_account_entries; v_entry_id uuid;
begin
  select * into v_entry from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id
    and kind='publication' and external_id=p_external_id and observed_at=p_observed_at;
  if not found or p_observed_at>clock_timestamp()+interval '5 minutes' then return; end if;
  for v_job in select job.* from public.marketplace_listing_jobs job
    join public.marketplace_connections account on account.workspace_id=job.workspace_id and account.id=job.connection_id and account.external_account_id=job.external_account_id
    where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.external_id=p_external_id
      and job.state in ('confirmed','outcome_unknown') and job.snapshot ? 'relistExternalId' and job.relist_imported_at is null and p_observed_at>job.finished_at
      and public.marketplace_relisting_job_is_latest(job) for update of job loop
    if v_job.state='outcome_unknown' then
      if v_job.provider_result->>'externalId' is distinct from p_external_id
        or v_job.provider_result->>'externalAccountId' is distinct from v_job.external_account_id
        or not exists(select 1 from public.marketplace_listing_drafts draft where draft.id=v_job.draft_id and draft.workspace_id=v_job.workspace_id
          and draft.relist_deleted_at is not null and draft.relist_deleted_account_id=v_job.external_account_id) then continue; end if;
      -- Die neue Kennung stammt aus der echten Erstellungsantwort, der Aktivbeleg aus dem eigenen Konto.
      -- Inhalts- oder Fotowidersprüche bleiben ungeklärt; sie erzeugen trotzdem keine zweite Karte.
      if v_entry.body->>'publicationState'='active' and v_job.error_code in (
        'provider_unconfirmed_save_navigation','provider_unconfirmed_saved_navigation','provider_unconfirmed_saved_form',
        'provider_unconfirmed_active_navigation','provider_unconfirmed_active_filter','provider_unconfirmed_active_loading','provider_unconfirmed_active_evidence') then
        perform public.marketplace_listing_finish_job(v_job,jsonb_build_object('outcome','confirmed','action','publish','externalId',p_external_id,
          'externalAccountId',v_job.external_account_id,'providerState','active','verifiedAt',to_char(p_observed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
        select * into v_job from public.marketplace_listing_jobs where id=v_job.id;
      end if;
    end if;
    v_entry_id:=public.marketplace_relink_relisting_entry(v_job);
    if v_entry_id is not null and (v_job.state='confirmed' or v_entry.body->>'publicationState'='active') then
      update public.marketplace_listing_jobs set relist_imported_at=p_observed_at where id=v_job.id;
    end if;
  end loop;
end;
$function$;

create or replace function public.marketplace_bind_relisting_entry (
  p_job public.marketplace_listing_jobs
)
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
      and (external_id=p_job.snapshot->>'relistExternalId' or (p_job.state in ('confirmed','outcome_unknown') and external_id=p_job.external_id))
      and (p_job.relist_entry_id is null or id=p_job.relist_entry_id)
    order by (external_id=p_job.snapshot->>'relistExternalId') desc limit 1 for update;
  if v_entry_id is not null and p_job.relist_entry_id is null then
    update public.marketplace_listing_jobs set relist_entry_id=v_entry_id where id=p_job.id and relist_entry_id is null;
  end if;
  return v_entry_id;
end;
$function$;

create or replace function public.marketplace_listing_finish_job (
  p_job    public.marketplace_listing_jobs,
  p_result jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_outcome text; v_external_id text; v_provider_state text; v_verified_at timestamptz; v_error text; v_job public.marketplace_listing_jobs; v_result jsonb:=p_result;
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
    if (select count(*) from jsonb_object_keys(p_result)) not in (2,4) or jsonb_typeof(p_result->'errorCode') is distinct from 'string' or coalesce(p_result->>'errorCode','') !~ '^[a-z_]{1,80}$' then raise exception 'Ungültiges Inseratergebnis.' using errcode='22023'; end if;
    v_error:=p_result->>'errorCode';
    if (select count(*) from jsonb_object_keys(p_result))=4 then
      if v_outcome<>'outcome_unknown' or p_job.action<>'publish' or p_job.started_at is null or p_job.state not in ('writing','outcome_unknown')
        or jsonb_typeof(p_result->'externalId') is distinct from 'string' or coalesce(p_result->>'externalId','') !~ '^[1-9][0-9]{0,31}$'
        or jsonb_typeof(p_result->'externalAccountId') is distinct from 'string' or p_result->>'externalAccountId' is distinct from p_job.external_account_id
        then raise exception 'Ungültiger Erstellungsbeleg.' using errcode='22023'; end if;
      v_external_id:=p_result->>'externalId';
    elsif v_outcome='outcome_unknown' and p_job.external_id is not null then
      v_external_id:=p_job.external_id;
      v_result:=p_result||jsonb_build_object('externalId',v_external_id,'externalAccountId',p_job.external_account_id);
    end if;
  else raise exception 'Ungültiges Inseratergebnis.' using errcode='22023'; end if;
  if v_external_id=p_job.snapshot->>'relistExternalId' then raise exception 'Das neue Inserat verwendet die alte Anbieterkennung.' using errcode='22023'; end if;
  if p_job.external_id is not null and v_external_id is distinct from p_job.external_id then raise exception 'Erstellungsbeleg darf nicht ersetzt werden.' using errcode='23505'; end if;
  if p_job.provider_result=v_result then return public.marketplace_listing_job_document(p_job); end if;
  if p_job.state='cancelled' and v_outcome='failed' and p_job.started_at is null then return public.marketplace_listing_job_document(p_job); end if;
  if p_job.state in ('confirmed','failed','cancelled') then raise exception 'Inseratergebnis bereits erfasst.' using errcode='23505'; end if;
  if v_outcome='confirmed' and (p_job.started_at is null or p_job.state not in ('writing','outcome_unknown')) then raise exception 'Inseratversuch wurde nicht begonnen.' using errcode='42501'; end if;
  if v_outcome<>'confirmed' and p_job.state not in ('claimed','writing','outcome_unknown') then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  update public.marketplace_listing_jobs set state=v_outcome,external_id=v_external_id,provider_state=v_provider_state,verified_at=v_verified_at,error_code=v_error,
    provider_result=v_result,finished_at=clock_timestamp(),lease_expires_at=null where id=p_job.id returning * into v_job;
  if v_external_id is not null and v_job.snapshot ? 'relistExternalId' then
    perform public.marketplace_relink_relisting_entry(v_job);
    select * into v_job from public.marketplace_listing_jobs where id=v_job.id;
  end if;
  if v_outcome='confirmed' and v_job.action='publish' then perform public.marketplace_remember_listing_photo_source(v_job,v_external_id); end if;
  if v_external_id is not null then perform public.marketplace_request_relisting_import(v_job); end if;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

create or replace function public.marketplace_read_relisting_plans (
  p_workspace_id  uuid,
  p_connection_id uuid
)
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
      and state in ('confirmed','outcome_unknown') and external_id is not null and snapshot ? 'relistExternalId' and relist_imported_at is null and public.marketplace_relisting_job_is_latest(marketplace_listing_jobs) loop
    perform public.marketplace_relink_relisting_entry(v_job);
  end loop;
  update public.marketplace_listing_jobs job set relist_imported_at=clock_timestamp()
    where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.external_account_id=v_account
      and job.state='confirmed' and job.snapshot ? 'relistExternalId' and job.relist_imported_at is null
      and exists(select 1 from public.marketplace_account_entries entry where entry.workspace_id=p_workspace_id and entry.connection_id=p_connection_id and entry.kind='publication' and entry.external_id=job.external_id and entry.observed_at>job.finished_at)
      and not exists(select 1 from public.marketplace_account_entries entry where entry.workspace_id=p_workspace_id and entry.connection_id=p_connection_id and entry.kind='publication' and entry.external_id=job.snapshot->>'relistExternalId');
  for v_job in select * from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=v_account
      and state in ('confirmed','outcome_unknown') and external_id is not null and snapshot ? 'relistExternalId' and relist_imported_at is null and public.marketplace_relisting_job_is_latest(marketplace_listing_jobs) loop
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

create or replace function public.marketplace_relink_relisting_entry (
  p_job public.marketplace_listing_jobs
)
  returns uuid
  language plpgsql
  set search_path to ''
  as $function$
declare v_source public.marketplace_account_entries; v_target public.marketplace_account_entries; v_body jsonb; v_entry_id uuid;
begin
  if p_job.state not in ('confirmed','outcome_unknown') or p_job.external_id is null
    or (p_job.state='outcome_unknown' and (p_job.provider_result->>'externalId' is distinct from p_job.external_id
      or p_job.provider_result->>'externalAccountId' is distinct from p_job.external_account_id
      or not exists(select 1 from public.marketplace_listing_drafts draft where draft.id=p_job.draft_id and draft.workspace_id=p_job.workspace_id
        and draft.relist_deleted_at is not null and draft.relist_deleted_account_id=p_job.external_account_id)))
    or p_job.action<>'publish' or not (p_job.snapshot ? 'relistExternalId') or p_job.connection_id is null
    or not public.marketplace_relisting_job_is_latest(p_job)
    or not exists(select 1 from public.marketplace_connections account where account.workspace_id=p_job.workspace_id and account.id=p_job.connection_id
      and account.marketplace='vinted' and account.external_account_id=p_job.external_account_id) then return p_job.relist_entry_id; end if;
  if p_job.external_id=p_job.snapshot->>'relistExternalId' then raise exception 'Das neue Inserat verwendet die alte Anbieterkennung.' using errcode='22023'; end if;
  v_entry_id:=public.marketplace_bind_relisting_entry(p_job);
  select * into v_source from public.marketplace_account_entries where id=v_entry_id for update;
  select * into v_target from public.marketplace_account_entries where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id
    and kind='publication' and external_id=p_job.external_id for update;
  -- Ein Erstellungsbeleg allein erzeugt keine synthetische aktive Anzeige.
  if p_job.state='outcome_unknown' and (v_target.id is null or v_target.observed_at<p_job.started_at) then return v_entry_id; end if;
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
  -- Eine schon aktive Anzeige kann inzwischen manuell geändert worden sein.
  -- Nur ein älterer Anbieterentwurf erhält die bestätigten Kernwerte des Auftrags.
  if v_target.observed_at<=p_job.verified_at and v_target.body->>'publicationState'='draft' then
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

create or replace function public.marketplace_relisting_import_allowed (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_external_id   text,
  p_pruning       boolean default false
)
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
        or (p_pruning and job.state in ('confirmed','outcome_unknown') and job.external_id=p_external_id and job.relist_imported_at is null and public.marketplace_relisting_job_is_latest(job)))
  );
end;
$function$;

create or replace function public.marketplace_relisting_job_is_latest (
  p_job public.marketplace_listing_jobs
)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
  select not exists(select 1 from public.marketplace_listing_jobs newer where newer.workspace_id=p_job.workspace_id and newer.connection_id=p_job.connection_id
    and newer.external_account_id=p_job.external_account_id and newer.snapshot ? 'relistExternalId' and newer.id>p_job.id
    and ((p_job.relist_entry_id is not null and newer.relist_entry_id=p_job.relist_entry_id)
      or newer.snapshot->>'relistExternalId'=p_job.snapshot->>'relistExternalId'
      or (p_job.external_id is not null and (p_job.relist_entry_id is null or newer.relist_entry_id is null) and newer.snapshot->>'relistExternalId'=p_job.external_id)));
$function$;

create or replace function public.marketplace_request_relisting_import (
  p_job public.marketplace_listing_jobs
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
begin
  if p_job.state not in ('confirmed','outcome_unknown') or p_job.external_id is null
    or (p_job.state='outcome_unknown' and (p_job.provider_result->>'externalId' is distinct from p_job.external_id
      or p_job.provider_result->>'externalAccountId' is distinct from p_job.external_account_id))
    or p_job.action<>'publish' or p_job.execution_mode<>'cloud' or not (p_job.snapshot ? 'relistExternalId')
    or not public.marketplace_relisting_job_is_latest(p_job)
    or p_job.relist_imported_at is not null or not public.marketplace_workspace_authorization_valid(p_job.workspace_id,p_job.requested_by)
    or not exists(select 1 from public.marketplace_connections where id=p_job.connection_id and workspace_id=p_job.workspace_id
      and external_account_id=p_job.external_account_id and execution_mode='cloud' and status='connected') then return; end if;
  if exists(select 1 from public.marketplace_operations where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id
    and created_at>=p_job.finished_at and (state in ('queued','running') or finished_at>clock_timestamp()-interval '1 minute')) then return; end if;
  insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,created_at)
    values(p_job.workspace_id,p_job.connection_id,p_job.requested_by,'manual_read',1,clock_timestamp())
    on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
end;
$function$;

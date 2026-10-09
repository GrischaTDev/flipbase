-- Zweck: eigene Inseratfreigaben und unveränderliche, revisionsgebundene Aufträge speichern.
-- Betroffen: public.marketplace_listing_permissions und marketplace_listing_jobs sowie deren kontrollierte RPCs.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_approve_listings (
  p_workspace_id                 uuid,
  p_connection_id                uuid,
  p_expected_external_account_id text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_profile public.marketplace_browser_profiles; v_generation bigint; v_permission public.marketplace_listing_permissions;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if not public.marketplace_local_extension_user_valid((select auth.uid())) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.status<>'connected' or p_expected_external_account_id is null or v_connection.external_account_id is distinct from p_expected_external_account_id then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
  if v_connection.execution_mode='local' then
    select grant_generation into v_generation from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id
      and approved_by=(select auth.uid()) and external_account_id=p_expected_external_account_id and revoked_at is null and expires_at>clock_timestamp() for share;
    if not found then raise exception 'Lokale Verbindung nicht freigegeben.' using errcode='42501'; end if;
  else
    select * into v_profile from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=p_connection_id for share;
    if not found or not public.marketplace_cloud_network_valid(p_workspace_id,p_connection_id) then raise exception 'Cloud-Verbindung nicht verfügbar.' using errcode='42501'; end if;
  end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())) then return public.marketplace_read_listing_permission(p_workspace_id,p_connection_id); end if;
  insert into public.marketplace_listing_permissions(workspace_id,connection_id,approved_by,external_account_id,execution_mode,local_grant_generation,browser_profile_id,provider_profile_id)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_expected_external_account_id,v_connection.execution_mode,v_generation,v_profile.id,v_profile.provider_profile_id)
    on conflict (workspace_id,connection_id) do update set approved_by=excluded.approved_by,external_account_id=excluded.external_account_id,execution_mode=excluded.execution_mode,
      local_grant_generation=excluded.local_grant_generation,browser_profile_id=excluded.browser_profile_id,provider_profile_id=excluded.provider_profile_id,
      authorization_version=public.marketplace_listing_permissions.authorization_version+1,revoked_at=null,updated_at=clock_timestamp();
  return public.marketplace_read_listing_permission(p_workspace_id,p_connection_id);
end;
$function$;

revoke all on function public.marketplace_approve_listings(uuid, uuid, text) from public;

grant all on function public.marketplace_approve_listings(uuid, uuid, text) to authenticated;

grant all on function public.marketplace_approve_listings(uuid, uuid, text) to service_role;

create function public.marketplace_cancel_listing_job (
  p_job_id           text,
  p_expected_version bigint
)
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
  if p_expected_version is null or v_job.version<>p_expected_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_job.state not in ('queued','paused') then raise exception 'Dieser Auftrag kann nicht mehr sicher abgebrochen werden.' using errcode='22023'; end if;
  update public.marketplace_listing_jobs set state='cancelled',version=version+1,updated_at=clock_timestamp() where id=v_job.id returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

revoke all on function public.marketplace_cancel_listing_job(text, bigint) from public;

grant all on function public.marketplace_cancel_listing_job(text, bigint) to authenticated;

grant all on function public.marketplace_cancel_listing_job(text, bigint) to service_role;

create function public.marketplace_enqueue_listing (
  p_draft_id          text,
  p_expected_revision bigint,
  p_action            text,
  p_request_id        uuid,
  p_ai_photo          boolean,
  p_scheduled_at      timestamp with time zone default null::timestamp with time zone,
  p_time_zone         text                     default null::text,
  p_late_policy       text                     default 'pause_after_30_minutes'::text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts; v_permission public.marketplace_listing_permissions; v_job public.marketplace_listing_jobs; v_images jsonb; v_hash text;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  if p_expected_revision is null or p_expected_revision not between 1 and 9007199254740991 or p_request_id is null or p_action is null or p_action not in ('publish','vinted_draft') or p_ai_photo is null
    or p_late_policy is null or p_late_policy not in ('pause_after_30_minutes','publish_when_available')
    or (p_scheduled_at is null and p_time_zone is not null) or (p_scheduled_at is not null and (not isfinite(p_scheduled_at) or p_time_zone is null
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone))) then raise exception 'Ungültiger Inseratauftrag.' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_draft_id,p_expected_revision,p_action,p_ai_photo,
    to_char(p_scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),p_time_zone,p_late_policy)::text,'utf8'),'sha256'),'hex');
  select * into v_job from public.marketplace_listing_jobs where workspace_id=v_draft.workspace_id and requested_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if v_job.request_hash<>v_hash then raise exception 'Diese Auftragskennung wurde bereits verwendet.' using errcode='23505'; end if;
    return public.marketplace_listing_job_document(v_job);
  end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=v_draft.workspace_id and connection_id=v_draft.connection_id for share;
  if not public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())) then raise exception 'Inserataktionen sind für dieses Konto nicht freigegeben.' using errcode='42501'; end if;
  if p_scheduled_at is not null and p_scheduled_at<=clock_timestamp() then raise exception 'Der Veröffentlichungstermin muss in der Zukunft liegen.' using errcode='22023'; end if;
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint for share;
  if v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.connection_id is distinct from v_permission.connection_id then raise exception 'Das Zielkonto wurde inzwischen geändert.' using errcode='40001'; end if;
  if exists(select 1 from public.marketplace_listing_jobs where draft_id=v_draft.id and state in ('queued','paused','claimed','writing','outcome_unknown','confirmed')) then raise exception 'Für diesen Entwurf gibt es bereits einen offenen oder bestätigten Auftrag.' using errcode='23505'; end if;
  if v_draft.inventory_item_id is not null then
    perform 1 from public.inventory_items where id=v_draft.inventory_item_id and workspace_id=v_draft.workspace_id and archived_at is null and status in ('ready','listed') for share;
    if not found or not exists(select 1 from public.inventory_item_sale_states where inventory_item_id=v_draft.inventory_item_id and workspace_id=v_draft.workspace_id and sale_state='no_active_sale') then raise exception 'Dieser Artikel kann momentan nicht angeboten werden.' using errcode='22023'; end if;
  end if;
  if not public.marketplace_listing_content_valid(v_draft.content) or coalesce(length(btrim(v_draft.content->>'title')),0)=0 or coalesce(length(btrim(v_draft.content->>'description')),0)=0
    or coalesce(v_draft.content->>'currency','')<>'EUR' or coalesce((v_draft.content->>'priceCents')::bigint,0)<=0 or coalesce((v_draft.content->>'categoryId')::bigint,0)<=0
    or coalesce((v_draft.content->>'conditionId')::bigint,0)<=0 or coalesce((v_draft.content->>'packageSizeId')::bigint,0)<=0 or cardinality(v_draft.image_ids) not between 1 and 20 then raise exception 'Bitte Angaben und Fotos vor der Anbieteraktion vervollständigen.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('id',image.id::text,'storagePath',image.storage_path,'fileName',image.file_name,'mimeType',image.mime_type,'byteSize',image.byte_size) order by chosen.position) into v_images
    from unnest(v_draft.image_ids) with ordinality chosen(id,position) join public.marketplace_listing_images image on image.id=chosen.id and image.workspace_id=v_draft.workspace_id and image.draft_id=v_draft.id and image.state='ready'
    where exists(select 1 from storage.objects object where object.bucket_id='marketplace-listing-media' and object.name=image.storage_path and object.metadata->>'size'=image.byte_size::text and object.metadata->>'mimetype'=image.mime_type);
  if coalesce(jsonb_array_length(v_images),0)<>cardinality(v_draft.image_ids) then raise exception 'Die Originalfotos sind noch nicht vollständig gespeichert.' using errcode='22023'; end if;
  insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,permission_id,requested_by,request_id,request_hash,draft_revision,authorization_version,
    external_account_id,execution_mode,action,snapshot,scheduled_at,time_zone,late_policy)
    values(v_draft.workspace_id,v_draft.connection_id,v_draft.id,v_permission.id,(select auth.uid()),p_request_id,v_hash,v_draft.revision,v_permission.authorization_version,
      v_permission.external_account_id,v_permission.execution_mode,p_action,jsonb_build_object('content',v_draft.content,'images',v_images,'aiPhoto',p_ai_photo,'bump',false,
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id),p_scheduled_at,p_time_zone,p_late_policy) returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

revoke all on function public.marketplace_enqueue_listing(text, bigint, text, uuid, boolean, timestamp with time zone, text, text) from public;

grant all on function public.marketplace_enqueue_listing(text, bigint, text, uuid, boolean, timestamp with time zone, text, text) to authenticated;

grant all on function public.marketplace_enqueue_listing(text, bigint, text, uuid, boolean, timestamp with time zone, text, text) to service_role;

create function public.marketplace_listing_job_timing (
  p_scheduled_at timestamp with time zone,
  p_late_policy  text,
  p_now          timestamp with time zone
)
  returns text
  language plpgsql
  immutable
  set search_path to ''
  as $function$
begin
  if p_now is null or not isfinite(p_now) or p_late_policy is null or p_late_policy not in ('pause_after_30_minutes','publish_when_available')
    or (p_scheduled_at is not null and not isfinite(p_scheduled_at)) then raise exception 'Ungültiger Veröffentlichungstermin.' using errcode='22023'; end if;
  if p_scheduled_at is null then return 'due'; end if;
  if p_scheduled_at>p_now then return 'not_due'; end if;
  if p_late_policy='pause_after_30_minutes' and p_now>p_scheduled_at+interval '30 minutes' then return 'paused'; end if;
  return 'due';
end;
$function$;

revoke all on function public.marketplace_listing_job_timing(timestamp with time zone, text, timestamp with time zone) from public;

grant all on function public.marketplace_listing_job_timing(timestamp with time zone, text, timestamp with time zone) to authenticated;

grant all on function public.marketplace_listing_job_timing(timestamp with time zone, text, timestamp with time zone) to service_role;

create function public.marketplace_listing_permission_valid (
  p_permission_id bigint,
  p_user_id       uuid,
  p_version       bigint default null::bigint
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
declare v_permission public.marketplace_listing_permissions; v_connection public.marketplace_connections;
begin
  select * into v_permission from public.marketplace_listing_permissions where id=p_permission_id and approved_by=p_user_id and revoked_at is null;
  if not found or (p_version is not null and v_permission.authorization_version<>p_version)
    or not public.marketplace_local_extension_user_valid(p_user_id)
    or not public.marketplace_sync_authorization_valid(v_permission.workspace_id,p_user_id) then return false; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=v_permission.workspace_id and id=v_permission.connection_id
    and marketplace='vinted' and status='connected' and execution_mode=v_permission.execution_mode and external_account_id=v_permission.external_account_id;
  if not found then return false; end if;
  if v_permission.execution_mode='local' then
    return exists(select 1 from public.marketplace_local_extension_grants where workspace_id=v_permission.workspace_id and connection_id=v_permission.connection_id
      and approved_by=p_user_id and external_account_id=v_permission.external_account_id and grant_generation=v_permission.local_grant_generation
      and revoked_at is null and expires_at>clock_timestamp());
  end if;
  return exists(select 1 from public.marketplace_browser_profiles where id=v_permission.browser_profile_id and workspace_id=v_permission.workspace_id
    and connection_id=v_permission.connection_id and provider_profile_id=v_permission.provider_profile_id)
    and public.marketplace_cloud_network_valid(v_permission.workspace_id,v_permission.connection_id);
end;
$function$;

revoke all on function public.marketplace_listing_permission_valid(bigint, uuid, bigint) from public;

grant all on function public.marketplace_listing_permission_valid(bigint, uuid, bigint) to service_role;

create function public.marketplace_protect_listing_job()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if row(new.id,new.workspace_id,new.draft_id,new.requested_by,new.request_id,new.request_hash,new.draft_revision,
      new.authorization_version,new.external_account_id,new.execution_mode,new.action,new.snapshot,new.scheduled_at,new.time_zone,new.late_policy,new.created_at)
    is distinct from row(old.id,old.workspace_id,old.draft_id,old.requested_by,old.request_id,old.request_hash,old.draft_revision,
      old.authorization_version,old.external_account_id,old.execution_mode,old.action,old.snapshot,old.scheduled_at,old.time_zone,old.late_policy,old.created_at)
    or (new.connection_id is distinct from old.connection_id and new.connection_id is not null)
    or (new.permission_id is distinct from old.permission_id and new.permission_id is not null) then
    raise exception 'Ein angenommener Inseratauftrag darf nicht verändert werden.' using errcode='22023';
  end if;
  new.version:=old.version+1;
  new.updated_at:=clock_timestamp();
  return new;
end;
$function$;

revoke all on function public.marketplace_protect_listing_job() from public;

grant all on function public.marketplace_protect_listing_job() to service_role;

create function public.marketplace_read_listing_jobs (
  p_workspace_id uuid,
  p_draft_id     text default null::text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_items jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if p_draft_id is not null and (p_draft_id !~ '^[1-9][0-9]{0,18}$' or not exists(
    select 1 from public.marketplace_listing_drafts where workspace_id=p_workspace_id and id=p_draft_id::bigint)) then
    raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501';
  end if;
  update public.marketplace_listing_jobs job set
    state=case when job.state='writing' then 'outcome_unknown' else 'cancelled' end,
    error_code='authorization_revoked'
    where job.workspace_id=p_workspace_id and job.state in ('queued','paused','claimed','writing')
      and not public.marketplace_listing_permission_valid(job.permission_id,job.requested_by,job.authorization_version);
  update public.marketplace_listing_jobs job set state='paused',error_code='schedule_late'
    where job.workspace_id=p_workspace_id and job.state='queued'
      and public.marketplace_listing_job_timing(job.scheduled_at,job.late_policy,clock_timestamp())='paused';
  select coalesce(jsonb_agg(public.marketplace_listing_job_document(job) order by job.created_at desc,job.id desc),'[]'::jsonb)
    into v_items from (select * from public.marketplace_listing_jobs where workspace_id=p_workspace_id
      and (p_draft_id is null or draft_id=p_draft_id::bigint) order by created_at desc,id desc limit 50) job;
  return jsonb_build_object('items',v_items);
end;
$function$;

revoke all on function public.marketplace_read_listing_jobs(uuid, text) from public;

grant all on function public.marketplace_read_listing_jobs(uuid, text) to authenticated;

grant all on function public.marketplace_read_listing_jobs(uuid, text) to service_role;

create function public.marketplace_read_listing_permission (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_permission public.marketplace_listing_permissions; v_connection public.marketplace_connections;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted';
  if not found then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('allowed',public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())),
    'authorizationVersion',coalesce(v_permission.authorization_version,0),'executionMode',v_connection.execution_mode);
end;
$function$;

revoke all on function public.marketplace_read_listing_permission(uuid, uuid) from public;

grant all on function public.marketplace_read_listing_permission(uuid, uuid) to authenticated;

grant all on function public.marketplace_read_listing_permission(uuid, uuid) to service_role;

create function public.marketplace_revoke_listings (
  p_workspace_id          uuid,
  p_connection_id         uuid,
  p_authorization_version bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  update public.marketplace_listing_permissions set revoked_at=clock_timestamp(),authorization_version=authorization_version+1,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and authorization_version=p_authorization_version;
  if not found then raise exception 'Die Freigabe wurde inzwischen geändert.' using errcode='40001'; end if;
  -- Begonnene Schreibversuche werden nicht als sicher abgebrochen ausgegeben.
  update public.marketplace_listing_jobs set state='cancelled',version=version+1,error_code='authorization_revoked',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','paused','claimed');
  update public.marketplace_listing_jobs set state='outcome_unknown',version=version+1,error_code='authorization_revoked',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and state='writing';
  return public.marketplace_read_listing_permission(p_workspace_id,p_connection_id);
end;
$function$;

revoke all on function public.marketplace_revoke_listings(uuid, uuid, bigint) from public;

grant all on function public.marketplace_revoke_listings(uuid, uuid, bigint) to authenticated;

grant all on function public.marketplace_revoke_listings(uuid, uuid, bigint) to service_role;

create table public.marketplace_listing_jobs (
  id                    bigint                   generated always as identity not null,
  workspace_id          uuid                     not null,
  connection_id         uuid,
  draft_id              bigint                   not null,
  permission_id         bigint,
  requested_by          uuid                     not null,
  request_id            uuid                     not null,
  request_hash          text                     not null,
  draft_revision        bigint                   not null,
  authorization_version bigint                   not null,
  external_account_id   text                     not null,
  execution_mode        text                     not null,
  action                text                     not null,
  snapshot              jsonb                    not null,
  state                 text                     default 'queued'::text not null,
  version               bigint                   default 1 not null,
  scheduled_at          timestamp with time zone,
  time_zone             text,
  late_policy           text                     default 'pause_after_30_minutes'::text not null,
  error_code            text,
  external_id           text,
  provider_state        text,
  verified_at           timestamp with time zone,
  created_at            timestamp with time zone default now() not null,
  updated_at            timestamp with time zone default now() not null
);

create function public.marketplace_listing_job_document (
  p_job public.marketplace_listing_jobs
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
  select jsonb_build_object('id',p_job.id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id,'draftId',p_job.draft_id::text,
    'draftRevision',p_job.draft_revision,'executionMode',p_job.execution_mode,'externalAccountId',p_job.external_account_id,'action',p_job.action,
    'state',p_job.state,'version',p_job.version,'scheduledAt',p_job.scheduled_at,'timeZone',p_job.time_zone,'latePolicy',p_job.late_policy,
    'errorCode',p_job.error_code,'externalId',p_job.external_id,'providerState',p_job.provider_state,'verifiedAt',p_job.verified_at,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at);
$function$;

revoke all on function public.marketplace_listing_job_document(public.marketplace_listing_jobs) from public;

grant all on function public.marketplace_listing_job_document(public.marketplace_listing_jobs) to service_role;

comment on table public.marketplace_listing_jobs is 'Dauerhafte Inhalts- und Fotoaufnahme mit festem Konto und Ausführer; queued bestätigt ausschließlich die lokale Auftragsannahme.';

alter table public.marketplace_listing_jobs
  enable row level security;

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_action_check check (action = any (array['publish'::text, 'vinted_draft'::text]));

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_authorization_version_check check (authorization_version >= 1 and authorization_version <= '9007199254740991'::bigint);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_check check (scheduled_at is null and time_zone is null or scheduled_at is not null and isfinite(scheduled_at) and time_zone is not null);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_check1 check (state <> 'confirmed'::text or external_id is not null and provider_state is not null and verified_at is not null);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_draft_revision_check check (draft_revision >= 1 and draft_revision <= '9007199254740991'::bigint);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_error_code_check check (error_code ~ '^[a-z_]{1,80}$'::text);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_execution_mode_check check (execution_mode = any (array['local'::text, 'cloud'::text]));

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_external_account_id_check check (external_account_id ~ '^[1-9][0-9]{0,31}$'::text);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_external_id_check check (external_id ~ '^[1-9][0-9]{0,31}$'::text);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_late_policy_check check (late_policy = any (array['pause_after_30_minutes'::text, 'publish_when_available'::text]));

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_pkey primary key (id);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_provider_state_check check (provider_state = any (array['active'::text, 'draft'::text, 'processing'::text]));

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_request_hash_check check (request_hash ~ '^[0-9a-f]{64}$'::text);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_requested_by_fkey foreign key (requested_by) references auth.users(id);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_snapshot_check check (jsonb_typeof(snapshot) = 'object'::text and octet_length(snapshot::text) <= 300000);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_state_check
    check (state = any (array['queued'::text, 'paused'::text, 'claimed'::text, 'writing'::text, 'confirmed'::text, 'failed'::text, 'outcome_unknown'::text, 'cancelled'::text]));

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_version_check check (version >= 1 and version <= '9007199254740991'::bigint);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_workspace_id_connection_id_fkey foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id)
    on delete set null (connection_id);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_workspace_id_draft_id_fkey foreign key (workspace_id, draft_id) references public.marketplace_listing_drafts(workspace_id, id);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_workspace_id_requested_by_request__key unique (workspace_id, requested_by, request_id);

grant select on public.marketplace_listing_jobs to authenticated;

grant all on public.marketplace_listing_jobs to service_role;

create index marketplace_listing_jobs_connection on public.marketplace_listing_jobs (connection_id);

create index marketplace_listing_jobs_workspace on public.marketplace_listing_jobs (workspace_id, created_at desc, id desc);

create unique index marketplace_listing_jobs_one_unresolved on public.marketplace_listing_jobs (draft_id)
  where state = any (array['queued'::text, 'paused'::text, 'claimed'::text, 'writing'::text, 'outcome_unknown'::text]);

create index marketplace_listing_jobs_due on public.marketplace_listing_jobs (execution_mode, scheduled_at, id)
  where state = 'queued'::text;

create index marketplace_listing_jobs_permission on public.marketplace_listing_jobs (permission_id);

create index marketplace_listing_jobs_user on public.marketplace_listing_jobs (requested_by);

create trigger marketplace_protect_listing_job
  before update on public.marketplace_listing_jobs
  for each row
  execute function public.marketplace_protect_listing_job();

create policy "Eigene Inserataufträge lesen" on public.marketplace_listing_jobs
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Inserataufträge nur per RPC anlegen" on public.marketplace_listing_jobs
  for insert
  to authenticated
  with check (false);

create policy "Inserataufträge nur per RPC löschen" on public.marketplace_listing_jobs
  for delete
  to authenticated
  using (false);

create policy "Inserataufträge nur per RPC ändern" on public.marketplace_listing_jobs
  for update
  to authenticated
  using (false)
  with check (false);

create table public.marketplace_listing_permissions (
  id                     bigint                   generated always as identity not null,
  workspace_id           uuid                     not null,
  connection_id          uuid                     not null,
  approved_by            uuid                     not null,
  external_account_id    text                     not null,
  execution_mode         text                     not null,
  authorization_version  bigint                   default 1 not null,
  local_grant_generation bigint,
  browser_profile_id     bigint,
  provider_profile_id    text,
  revoked_at             timestamp with time zone,
  created_at             timestamp with time zone default now() not null,
  updated_at             timestamp with time zone default now() not null
);

comment on table public.marketplace_listing_permissions is 'Ausdrückliche Inseratfreigabe für Nutzer, Kontoidentität und lokale Installation oder Cloud-Browserprofil; keine Ableitung aus Nachrichtenrechten.';

alter table public.marketplace_listing_permissions
  enable row level security;

alter table public.marketplace_listing_permissions
  add constraint marketplace_listing_permissions_approved_by_fkey foreign key (approved_by) references auth.users(id);

alter table public.marketplace_listing_permissions
  add constraint marketplace_listing_permissions_authorization_version_check check (authorization_version >= 1 and authorization_version <= '9007199254740991'::bigint);

alter table public.marketplace_listing_permissions
  add constraint marketplace_listing_permissions_browser_profile_id_fkey foreign key (browser_profile_id) references public.marketplace_browser_profiles(id) on delete set null;

alter table public.marketplace_listing_permissions
  add constraint marketplace_listing_permissions_check check (execution_mode = 'local'::text and local_grant_generation is
    not null and browser_profile_id is null and provider_profile_id is null or execution_mode = 'cloud'::text and local_grant_generation is null and provider_profile_id is
    not null);

alter table public.marketplace_listing_permissions
  add constraint marketplace_listing_permissions_execution_mode_check check (execution_mode = any (array['local'::text, 'cloud'::text]));

alter table public.marketplace_listing_permissions
  add constraint marketplace_listing_permissions_external_account_id_check check (external_account_id ~ '^[1-9][0-9]{0,31}$'::text);

alter table public.marketplace_listing_permissions
  add constraint marketplace_listing_permissions_pkey primary key (id);

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_permission_id_fkey foreign key (permission_id) references public.marketplace_listing_permissions(id) on delete set null deferrable
    initially deferred;

alter table public.marketplace_listing_permissions
  add constraint marketplace_listing_permissions_workspace_id_connection_id_fkey foreign key (workspace_id, connection_id)
    references public.marketplace_connections(workspace_id, id) on delete cascade;

alter table public.marketplace_listing_permissions
  add constraint marketplace_listing_permissions_workspace_id_connection_id_key unique (workspace_id, connection_id);

grant select on public.marketplace_listing_permissions to authenticated;

grant all on public.marketplace_listing_permissions to service_role;

create index marketplace_listing_permissions_profile on public.marketplace_listing_permissions (browser_profile_id);

create index marketplace_listing_permissions_user on public.marketplace_listing_permissions (approved_by);

create policy "Eigene Inseratfreigaben lesen" on public.marketplace_listing_permissions
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Inseratfreigaben nur per RPC anlegen" on public.marketplace_listing_permissions
  for insert
  to authenticated
  with check (false);

create policy "Inseratfreigaben nur per RPC löschen" on public.marketplace_listing_permissions
  for delete
  to authenticated
  using (false);

create policy "Inseratfreigaben nur per RPC ändern" on public.marketplace_listing_permissions
  for update
  to authenticated
  using (false)
  with check (false);

-- Explizite Inseratauftragsrechte aus dem deklarativen Schema.
revoke all on public.marketplace_listing_permissions from public,anon,authenticated;
grant select on public.marketplace_listing_permissions to authenticated;
grant all on public.marketplace_listing_permissions to service_role;
grant usage,select on sequence public.marketplace_listing_permissions_id_seq to service_role;
revoke all on public.marketplace_listing_jobs from public,anon,authenticated;
grant select on public.marketplace_listing_jobs to authenticated;
grant all on public.marketplace_listing_jobs to service_role;
grant usage,select on sequence public.marketplace_listing_jobs_id_seq to service_role;
revoke all on function public.marketplace_protect_listing_job() from public,anon,authenticated;
revoke all on function public.marketplace_listing_permission_valid(bigint,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_listing_permission_valid(bigint,uuid,bigint) to service_role;
revoke all on function public.marketplace_read_listing_permission(uuid,uuid),public.marketplace_approve_listings(uuid,uuid,text),public.marketplace_revoke_listings(uuid,uuid,bigint) from public,anon;
grant execute on function public.marketplace_read_listing_permission(uuid,uuid),public.marketplace_approve_listings(uuid,uuid,text),public.marketplace_revoke_listings(uuid,uuid,bigint) to authenticated;
revoke all on function public.marketplace_listing_job_timing(timestamptz,text,timestamptz) from public,anon;
grant execute on function public.marketplace_listing_job_timing(timestamptz,text,timestamptz) to authenticated,service_role;
revoke all on function public.marketplace_listing_job_document(public.marketplace_listing_jobs) from public,anon,authenticated;
revoke all on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) from public,anon;
grant execute on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) to authenticated;
revoke all on function public.marketplace_read_listing_jobs(uuid,text) from public,anon;
grant execute on function public.marketplace_read_listing_jobs(uuid,text) to authenticated;

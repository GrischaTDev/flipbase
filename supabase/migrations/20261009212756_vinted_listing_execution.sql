-- Zweck: lokale Inseratversuche übernehmen und Schreibbeginn sowie Ergebnisse dauerhaft binden.
-- Betroffen: public.marketplace_listing_permissions und marketplace_listing_jobs sowie deren kontrollierte RPCs.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_expire_local_listing_attempts (
  p_workspace_id  uuid default null::uuid,
  p_connection_id uuid default null::uuid
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  -- Nur Vorbereitungen ohne Schreibbeginn dürfen nach einem Ausfall erneut übernommen werden.
  update public.marketplace_listing_jobs set state='outcome_unknown',error_code='timeout',lease_expires_at=null
    where (p_workspace_id is null or workspace_id=p_workspace_id) and (p_connection_id is null or connection_id=p_connection_id) and execution_mode='local' and state in ('claimed','writing') and lease_expires_at<=clock_timestamp() and started_at is not null;
  update public.marketplace_listing_jobs set state='queued',claim_token=null,lease_expires_at=null,absolute_expires_at=null,claim_local_token_hash=null,claim_local_grant_generation=null
    where (p_workspace_id is null or workspace_id=p_workspace_id) and (p_connection_id is null or connection_id=p_connection_id) and execution_mode='local' and state='claimed' and lease_expires_at<=clock_timestamp() and started_at is null;
end;
$function$;

revoke all on function public.marketplace_expire_local_listing_attempts(uuid, uuid) from public;

grant all on function public.marketplace_expire_local_listing_attempts(uuid, uuid) to service_role;

create function public.marketplace_listing_finish_job (
  p_job    public.marketplace_listing_jobs,
  p_result jsonb
)
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
  return public.marketplace_listing_job_document(v_job);
end;
$function$;

revoke all on function public.marketplace_listing_finish_job(public.marketplace_listing_jobs, jsonb) from public;

grant all on function public.marketplace_listing_finish_job(public.marketplace_listing_jobs, jsonb) to service_role;

create function public.marketplace_listing_job_valid (
  p_job public.marketplace_listing_jobs
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
declare v_image jsonb; v_inventory_id uuid;
begin
  if p_job.connection_id is null or not public.marketplace_listing_permission_valid(p_job.permission_id,p_job.requested_by,p_job.authorization_version) then return false; end if;
  if jsonb_typeof(p_job.snapshot->'images')<>'array' or jsonb_array_length(p_job.snapshot->'images') not between 1 and 20 then return false; end if;
  for v_image in select value from jsonb_array_elements(p_job.snapshot->'images') loop
    if not exists(select 1 from public.marketplace_listing_images image join storage.objects object on object.bucket_id='marketplace-listing-media' and object.name=image.storage_path
      where image.id=(v_image->>'id')::bigint and image.workspace_id=p_job.workspace_id and image.draft_id=p_job.draft_id and image.state='ready'
        and image.storage_path=v_image->>'storagePath' and image.mime_type=v_image->>'mimeType' and image.byte_size=(v_image->>'byteSize')::bigint
        and object.metadata->>'size'=image.byte_size::text and object.metadata->>'mimetype'=image.mime_type) then return false; end if;
  end loop;
  v_inventory_id:=(p_job.snapshot->>'inventoryItemId')::uuid;
  if v_inventory_id is not null and not exists(select 1 from public.inventory_items item join public.inventory_item_sale_states sale on sale.inventory_item_id=item.id and sale.workspace_id=item.workspace_id
    where item.workspace_id=p_job.workspace_id and item.id=v_inventory_id and item.archived_at is null and item.status in ('ready','listed') and sale.sale_state='no_active_sale') then return false; end if;
  return true;
end;
$function$;

revoke all on function public.marketplace_listing_job_valid(public.marketplace_listing_jobs) from public;

grant all on function public.marketplace_listing_job_valid(public.marketplace_listing_jobs) to service_role;

create function public.marketplace_local_listing_authorized (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text
)
  returns public.marketplace_local_extension_grants
  language plpgsql
  set search_path to ''
  as $function$
declare v_grant public.marketplace_local_extension_grants; v_permission public.marketplace_listing_permissions;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found then raise exception 'Lokale Inseratfreigabe ungültig.' using errcode='42501'; end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local';
  if not public.marketplace_listing_permission_valid(v_permission.id,v_grant.approved_by) or v_permission.local_grant_generation<>v_grant.grant_generation then
    raise exception 'Lokale Inseratfreigabe ungültig.' using errcode='42501';
  end if;
  return v_grant;
end;
$function$;

revoke all on function public.marketplace_local_listing_authorized(uuid, uuid, text) from public;

grant all on function public.marketplace_local_listing_authorized(uuid, uuid, text) to service_role;

create function public.marketplace_local_listing_begin (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text,
  p_job_id        text,
  p_claim_token   uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
begin
  if public.marketplace_local_listing_check(p_workspace_id,p_connection_id,p_token_hash,p_job_id,p_claim_token)->>'active'<>'true' then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  update public.marketplace_listing_jobs set state='writing',started_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id::bigint and claim_token=p_claim_token and state='claimed' and started_at is null;
  if not found then raise exception 'Inseratversuch wurde bereits begonnen oder beendet.' using errcode='42501'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

revoke all on function public.marketplace_local_listing_begin(uuid, uuid, text, text, uuid) from public;

grant all on function public.marketplace_local_listing_begin(uuid, uuid, text, text, uuid) to service_role;

create function public.marketplace_local_listing_check (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text,
  p_job_id        text,
  p_claim_token   uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_grant public.marketplace_local_extension_grants; v_job public.marketplace_listing_jobs;
begin
  v_grant:=public.marketplace_local_listing_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_job from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id::bigint and execution_mode='local'
    and claim_token=p_claim_token and claim_local_token_hash=p_token_hash and claim_local_grant_generation=v_grant.grant_generation and requested_by=v_grant.approved_by
    and state in ('claimed','writing') and lease_expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp() for update;
  if not found or not public.marketplace_listing_job_valid(v_job) then return jsonb_build_object('active',false); end if;
  if v_job.state='claimed' and public.marketplace_listing_job_timing(v_job.scheduled_at,v_job.late_policy,clock_timestamp())<>'due' then
    update public.marketplace_listing_jobs set state='paused',error_code='schedule_late',lease_expires_at=null where id=v_job.id;
    return jsonb_build_object('active',false);
  end if;
  update public.marketplace_listing_jobs set lease_expires_at=least(v_grant.expires_at,v_job.absolute_expires_at,clock_timestamp()+interval '90 seconds') where id=v_job.id returning * into v_job;
  return jsonb_build_object('active',true,'expiresAt',v_job.lease_expires_at,'absoluteExpiresAt',v_job.absolute_expires_at);
end;
$function$;

revoke all on function public.marketplace_local_listing_check(uuid, uuid, text, text, uuid) from public;

grant all on function public.marketplace_local_listing_check(uuid, uuid, text, text, uuid) to service_role;

create function public.marketplace_local_listing_claim (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_grant public.marketplace_local_extension_grants; v_job public.marketplace_listing_jobs;
begin
  v_grant:=public.marketplace_local_listing_authorized(p_workspace_id,p_connection_id,p_token_hash);
  perform public.marketplace_expire_local_listing_attempts(p_workspace_id,p_connection_id);
  update public.marketplace_listing_jobs job set state='cancelled',error_code='authorization_revoked'
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state in ('queued','paused','claimed') and not public.marketplace_listing_job_valid(job);
  update public.marketplace_listing_jobs job set state='paused',error_code='schedule_late'
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued' and public.marketplace_listing_job_timing(job.scheduled_at,job.late_policy,clock_timestamp())='paused';
  if exists(select 1 from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('claimed','writing') and lease_expires_at>clock_timestamp()) then return null; end if;
  select * into v_job from public.marketplace_listing_jobs job where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued'
    and requested_by=v_grant.approved_by and public.marketplace_listing_job_valid(job) and public.marketplace_listing_job_timing(job.scheduled_at,job.late_policy,clock_timestamp())='due'
    order by scheduled_at nulls first,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.marketplace_listing_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),
    absolute_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '10 minutes'),claim_local_token_hash=p_token_hash,claim_local_grant_generation=v_grant.grant_generation where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id::text,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'externalAccountId',v_job.external_account_id,
    'action',v_job.action,'snapshot',v_job.snapshot,'expiresAt',v_job.lease_expires_at,'absoluteExpiresAt',v_job.absolute_expires_at);
end;
$function$;

revoke all on function public.marketplace_local_listing_claim(uuid, uuid, text) from public;

grant all on function public.marketplace_local_listing_claim(uuid, uuid, text) to service_role;

create function public.marketplace_local_listing_finish (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text,
  p_job_id        text,
  p_claim_token   uuid,
  p_result        jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  -- Eine bereits ausgelöste Aktion darf auch nach Widerruf noch ihrem alten Versuch zugeordnet werden.
  -- Das erlaubt keine neue Schreibaktion und verlangt weiterhin das ursprüngliche Geheimnis und die Versuchkennung.
  select * into v_job from public.marketplace_listing_jobs where workspace_id=p_workspace_id and (connection_id=p_connection_id or (connection_id is null and snapshot->>'connectionId'=p_connection_id::text)) and id=p_job_id::bigint and execution_mode='local'
    and claim_token=p_claim_token and claim_local_token_hash=p_token_hash for update;
  if not found then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  return public.marketplace_listing_finish_job(v_job,p_result);
end;
$function$;

revoke all on function public.marketplace_local_listing_finish(uuid, uuid, text, text, uuid, jsonb) from public;

grant all on function public.marketplace_local_listing_finish(uuid, uuid, text, text, uuid, jsonb) to service_role;

create or replace function public.marketplace_read_listing_jobs (
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
  perform public.marketplace_expire_local_listing_attempts(p_workspace_id);
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

create function public.marketplace_revoke_changed_listing_connection()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_listing_permissions set revoked_at=clock_timestamp(),authorization_version=authorization_version+1,updated_at=clock_timestamp()
    where workspace_id=old.workspace_id and connection_id=old.id and revoked_at is null;
  update public.marketplace_listing_jobs set state=case when started_at is not null then 'outcome_unknown' else 'cancelled' end,error_code='connection_changed',lease_expires_at=null
    where workspace_id=old.workspace_id and connection_id=old.id and state in ('queued','paused','claimed','writing');
  return null;
end;
$function$;

revoke all on function public.marketplace_revoke_changed_listing_connection() from public;

grant all on function public.marketplace_revoke_changed_listing_connection() to service_role;

create trigger marketplace_revoke_changed_listing_connection
  after update of execution_mode, external_account_id, status on public.marketplace_connections
  for each row
  when
    (old.execution_mode is distinct from new.execution_mode or old.external_account_id is distinct from new.external_account_id or old.status is distinct from new.status and
    (new.status = any (array['paused'::text, 'blocked'::text, 'disconnected'::text])))
  execute function public.marketplace_revoke_changed_listing_connection();

alter table public.marketplace_listing_jobs
  add column claim_token uuid;

alter table public.marketplace_listing_jobs
  add column lease_expires_at timestamp with time zone;

alter table public.marketplace_listing_jobs
  add column absolute_expires_at timestamp with time zone;

alter table public.marketplace_listing_jobs
  add column claim_local_token_hash text;

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_claim_local_token_hash_check check (claim_local_token_hash ~ '^[0-9a-f]{64}$'::text);

alter table public.marketplace_listing_jobs
  add column claim_local_grant_generation bigint;

alter table public.marketplace_listing_jobs
  add column started_at timestamp with time zone;

alter table public.marketplace_listing_jobs
  add column finished_at timestamp with time zone;

alter table public.marketplace_listing_jobs
  add column provider_result jsonb;

alter table public.marketplace_listing_jobs
  add constraint marketplace_listing_jobs_provider_result_check
    check (provider_result is null or jsonb_typeof(provider_result) = 'object'::text and octet_length(provider_result::text) <= 4096);

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
revoke all on function public.marketplace_enqueue_listing_internal(text,bigint,text,uuid,boolean,timestamptz,text,text,bigint,bigint) from public,anon,authenticated;
revoke all on function public.marketplace_replace_planned_listing(text,bigint,bigint,text,uuid,boolean,timestamptz,text,text) from public,anon;
grant execute on function public.marketplace_replace_planned_listing(text,bigint,bigint,text,uuid,boolean,timestamptz,text,text) to authenticated;
revoke all on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) from public,anon;
grant execute on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) to authenticated;
revoke all on function public.marketplace_read_listing_jobs(uuid,text) from public,anon;
grant execute on function public.marketplace_read_listing_jobs(uuid,text) to authenticated;
revoke all on function public.marketplace_expire_local_listing_attempts(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_expire_local_listing_attempts(uuid,uuid) to service_role;
revoke all on function public.marketplace_local_listing_authorized(uuid,uuid,text),public.marketplace_listing_job_valid(public.marketplace_listing_jobs),public.marketplace_local_listing_claim(uuid,uuid,text),public.marketplace_local_listing_check(uuid,uuid,text,text,uuid),public.marketplace_local_listing_begin(uuid,uuid,text,text,uuid),public.marketplace_listing_finish_job(public.marketplace_listing_jobs,jsonb),public.marketplace_local_listing_finish(uuid,uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_local_listing_authorized(uuid,uuid,text),public.marketplace_listing_job_valid(public.marketplace_listing_jobs),public.marketplace_local_listing_claim(uuid,uuid,text),public.marketplace_local_listing_check(uuid,uuid,text,text,uuid),public.marketplace_local_listing_begin(uuid,uuid,text,text,uuid),public.marketplace_listing_finish_job(public.marketplace_listing_jobs,jsonb),public.marketplace_local_listing_finish(uuid,uuid,text,text,uuid,jsonb) to service_role;
revoke all on function public.marketplace_revoke_changed_listing_connection() from public,anon,authenticated;
grant execute on function public.marketplace_revoke_changed_listing_connection() to service_role;

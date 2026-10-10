-- Eigene Inseratfreigaben und revisionsgebundene Aufträge; noch keine Anbieteraktion aus der Auftragsannahme.
create table public.marketplace_listing_permissions (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  approved_by uuid not null references auth.users(id),
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  execution_mode text not null check (execution_mode in ('local','cloud')),
  authorization_version bigint not null default 1 check (authorization_version between 1 and 9007199254740991),
  local_grant_generation bigint,
  browser_profile_id bigint references public.marketplace_browser_profiles(id) on delete set null,
  provider_profile_id text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,connection_id),
  foreign key (workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade,
  check ((execution_mode='local' and local_grant_generation is not null and browser_profile_id is null and provider_profile_id is null)
    or (execution_mode='cloud' and local_grant_generation is null and provider_profile_id is not null))
);
comment on table public.marketplace_listing_permissions is 'Ausdrückliche Inseratfreigabe für Nutzer, Kontoidentität und lokale Installation oder Cloud-Browserprofil; keine Ableitung aus Nachrichtenrechten.';
create index marketplace_listing_permissions_user on public.marketplace_listing_permissions(approved_by);
create index marketplace_listing_permissions_profile on public.marketplace_listing_permissions(browser_profile_id);
alter table public.marketplace_listing_permissions enable row level security;
create policy "Eigene Inseratfreigaben lesen" on public.marketplace_listing_permissions for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Inseratfreigaben nur per RPC anlegen" on public.marketplace_listing_permissions for insert to authenticated with check (false);
create policy "Inseratfreigaben nur per RPC ändern" on public.marketplace_listing_permissions for update to authenticated using (false) with check (false);
create policy "Inseratfreigaben nur per RPC löschen" on public.marketplace_listing_permissions for delete to authenticated using (false);
revoke all on public.marketplace_listing_permissions from public,anon,authenticated;
grant select on public.marketplace_listing_permissions to authenticated;
grant all on public.marketplace_listing_permissions to service_role;
grant usage,select on sequence public.marketplace_listing_permissions_id_seq to service_role;

create table public.marketplace_listing_jobs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid,
  draft_id bigint not null,
  -- Kontolöschung leert sowohl Verbindung als auch Freigabe. Erst beide Änderungen zusammen prüfen.
  permission_id bigint references public.marketplace_listing_permissions(id) on delete set null deferrable initially deferred,
  requested_by uuid not null references auth.users(id),
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  draft_revision bigint not null check (draft_revision between 1 and 9007199254740991),
  authorization_version bigint not null check (authorization_version between 1 and 9007199254740991),
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  execution_mode text not null check (execution_mode in ('local','cloud')),
  action text not null check (action in ('publish','vinted_draft')),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=300000),
  state text not null default 'queued' check (state in ('queued','paused','claimed','writing','confirmed','failed','outcome_unknown','cancelled')),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  scheduled_at timestamptz,
  time_zone text,
  late_policy text not null default 'pause_after_30_minutes' check (late_policy in ('pause_after_30_minutes','publish_when_available')),
  error_code text check (error_code ~ '^[a-z_]{1,80}$'),
  external_id text check (external_id ~ '^[1-9][0-9]{0,31}$'),
  provider_state text check (provider_state in ('active','draft','processing')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  replaces_job_id bigint references public.marketplace_listing_jobs(id),
  unique (workspace_id,requested_by,request_id),
  foreign key (workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete set null (connection_id),
  foreign key (workspace_id,draft_id) references public.marketplace_listing_drafts(workspace_id,id),
  check ((scheduled_at is null and time_zone is null) or (scheduled_at is not null and isfinite(scheduled_at) and time_zone is not null)),
  check (state<>'confirmed' or (external_id is not null and provider_state is not null and verified_at is not null))
);
comment on table public.marketplace_listing_jobs is 'Dauerhafte Inhalts- und Fotoaufnahme mit festem Konto und Ausführer; queued bestätigt ausschließlich die lokale Auftragsannahme.';
create unique index marketplace_listing_jobs_one_unresolved on public.marketplace_listing_jobs(draft_id) where state in ('queued','paused','claimed','writing','outcome_unknown');
create index marketplace_listing_jobs_workspace on public.marketplace_listing_jobs(workspace_id,created_at desc,id desc);
create index marketplace_listing_jobs_connection on public.marketplace_listing_jobs(connection_id);
create index marketplace_listing_jobs_permission on public.marketplace_listing_jobs(permission_id);
create index marketplace_listing_jobs_user on public.marketplace_listing_jobs(requested_by);
create unique index marketplace_listing_jobs_replacement on public.marketplace_listing_jobs(replaces_job_id) where replaces_job_id is not null;
create index marketplace_listing_jobs_due on public.marketplace_listing_jobs(execution_mode,scheduled_at,id) where state='queued';
alter table public.marketplace_listing_jobs enable row level security;
create policy "Eigene Inserataufträge lesen" on public.marketplace_listing_jobs for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Inserataufträge nur per RPC anlegen" on public.marketplace_listing_jobs for insert to authenticated with check (false);
create policy "Inserataufträge nur per RPC ändern" on public.marketplace_listing_jobs for update to authenticated using (false) with check (false);
create policy "Inserataufträge nur per RPC löschen" on public.marketplace_listing_jobs for delete to authenticated using (false);
revoke all on public.marketplace_listing_jobs from public,anon,authenticated;
grant select on public.marketplace_listing_jobs to authenticated;
grant all on public.marketplace_listing_jobs to service_role;
grant usage,select on sequence public.marketplace_listing_jobs_id_seq to service_role;

-- Inhalt, Konto und Ausführer bleiben nach der Annahme unveränderlich.
-- Fremdschlüssel dürfen bei einer Kontolöschung ihre Referenz leeren; die Aufnahme bleibt erhalten.
create or replace function public.marketplace_protect_listing_job()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  if row(new.id,new.workspace_id,new.draft_id,new.requested_by,new.request_id,new.request_hash,new.draft_revision,
      new.authorization_version,new.external_account_id,new.execution_mode,new.action,new.snapshot,new.scheduled_at,new.time_zone,new.late_policy,new.created_at,new.replaces_job_id)
    is distinct from row(old.id,old.workspace_id,old.draft_id,old.requested_by,old.request_id,old.request_hash,old.draft_revision,
      old.authorization_version,old.external_account_id,old.execution_mode,old.action,old.snapshot,old.scheduled_at,old.time_zone,old.late_policy,old.created_at,old.replaces_job_id)
    or (new.connection_id is distinct from old.connection_id and new.connection_id is not null)
    or (new.permission_id is distinct from old.permission_id and new.permission_id is not null) then
    raise exception 'Ein angenommener Inseratauftrag darf nicht verändert werden.' using errcode='22023';
  end if;
  new.version:=old.version+1;
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;
revoke all on function public.marketplace_protect_listing_job() from public,anon,authenticated;
create trigger marketplace_protect_listing_job before update on public.marketplace_listing_jobs
for each row execute function public.marketplace_protect_listing_job();

create or replace function public.marketplace_listing_permission_valid(p_permission_id bigint,p_user_id uuid,p_version bigint default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
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
$$;
revoke all on function public.marketplace_listing_permission_valid(bigint,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_listing_permission_valid(bigint,uuid,bigint) to service_role;

-- SECURITY DEFINER ist für die kontrollierte Freigabe ohne direkte Tabellenschreibrechte nötig.
create or replace function public.marketplace_read_listing_permission(p_workspace_id uuid,p_connection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_permission public.marketplace_listing_permissions; v_connection public.marketplace_connections;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted';
  if not found then raise exception 'Kontozugriff verweigert.' using errcode='42501'; end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('allowed',public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())),
    'authorizationVersion',coalesce(v_permission.authorization_version,0),'executionMode',v_connection.execution_mode);
end;
$$;

create or replace function public.marketplace_approve_listings(p_workspace_id uuid,p_connection_id uuid,p_expected_external_account_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
$$;

create or replace function public.marketplace_revoke_listings(p_workspace_id uuid,p_connection_id uuid,p_authorization_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
$$;
revoke all on function public.marketplace_read_listing_permission(uuid,uuid),public.marketplace_approve_listings(uuid,uuid,text),public.marketplace_revoke_listings(uuid,uuid,bigint) from public,anon;
grant execute on function public.marketplace_read_listing_permission(uuid,uuid),public.marketplace_approve_listings(uuid,uuid,text),public.marketplace_revoke_listings(uuid,uuid,bigint) to authenticated;

create or replace function public.marketplace_listing_job_timing(p_scheduled_at timestamptz,p_late_policy text,p_now timestamptz)
returns text language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_now is null or not isfinite(p_now) or p_late_policy is null or p_late_policy not in ('pause_after_30_minutes','publish_when_available')
    or (p_scheduled_at is not null and not isfinite(p_scheduled_at)) then raise exception 'Ungültiger Veröffentlichungstermin.' using errcode='22023'; end if;
  if p_scheduled_at is null then return 'due'; end if;
  if p_scheduled_at>p_now then return 'not_due'; end if;
  if p_late_policy='pause_after_30_minutes' and p_now>p_scheduled_at+interval '30 minutes' then return 'paused'; end if;
  return 'due';
end;
$$;
revoke all on function public.marketplace_listing_job_timing(timestamptz,text,timestamptz) from public,anon;
grant execute on function public.marketplace_listing_job_timing(timestamptz,text,timestamptz) to authenticated,service_role;

create or replace function public.marketplace_listing_job_document(p_job public.marketplace_listing_jobs)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_job.id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id,'draftId',p_job.draft_id::text,
    'draftRevision',p_job.draft_revision,'executionMode',p_job.execution_mode,'externalAccountId',p_job.external_account_id,'action',p_job.action,
    'state',p_job.state,'version',p_job.version,'scheduledAt',p_job.scheduled_at,'timeZone',p_job.time_zone,'latePolicy',p_job.late_policy,
    'errorCode',p_job.error_code,'externalId',p_job.external_id,'providerState',p_job.provider_state,'verifiedAt',p_job.verified_at,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at,'replacesJobId',p_job.replaces_job_id::text);
$$;
revoke all on function public.marketplace_listing_job_document(public.marketplace_listing_jobs) from public,anon,authenticated;

create or replace function public.marketplace_enqueue_listing_internal(p_draft_id text,p_expected_revision bigint,p_action text,p_request_id uuid,p_ai_photo boolean,
  p_scheduled_at timestamptz default null,p_time_zone text default null,p_late_policy text default 'pause_after_30_minutes',p_replaces_job_id bigint default null,p_replaces_version bigint default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_draft public.marketplace_listing_drafts; v_permission public.marketplace_listing_permissions; v_job public.marketplace_listing_jobs; v_previous public.marketplace_listing_jobs; v_images jsonb; v_hash text; v_request jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  if p_expected_revision is null or p_expected_revision not between 1 and 9007199254740991 or p_request_id is null or p_action is null or p_action not in ('publish','vinted_draft') or p_ai_photo is null
    or p_late_policy is null or p_late_policy not in ('pause_after_30_minutes','publish_when_available')
    or (p_scheduled_at is null and p_time_zone is not null) or (p_scheduled_at is not null and (not isfinite(p_scheduled_at) or p_time_zone is null
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone))) then raise exception 'Ungültiger Inseratauftrag.' using errcode='22023'; end if;
  if (p_replaces_job_id is null)<>(p_replaces_version is null) or (p_replaces_job_id is not null and (p_replaces_job_id<=0 or p_replaces_version not between 1 and 9007199254740991 or p_scheduled_at is null)) then
    raise exception 'Ungültiger Planungsersatz.' using errcode='22023';
  end if;
  -- Normale Auftragskennungen behalten ihren bisherigen Hash auch nach dieser Erweiterung.
  v_request:=jsonb_build_array(p_draft_id,p_expected_revision,p_action,p_ai_photo,
    to_char(p_scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),p_time_zone,p_late_policy);
  if p_replaces_job_id is not null then v_request:=v_request||jsonb_build_array(p_replaces_job_id::text,p_replaces_version); end if;
  v_hash:=encode(extensions.digest(convert_to(v_request::text,'utf8'),'sha256'),'hex');
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
  if p_replaces_job_id is not null then
    select * into v_previous from public.marketplace_listing_jobs where id=p_replaces_job_id and workspace_id=v_draft.workspace_id and draft_id=v_draft.id for update;
    if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
    if v_previous.version<>p_replaces_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
    if v_previous.state not in ('queued','paused') or v_previous.scheduled_at is null then raise exception 'Dieser Auftrag kann nicht mehr ersetzt werden.' using errcode='22023'; end if;
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
  if not public.marketplace_listing_content_valid(v_draft.content) or coalesce(length(btrim(v_draft.content->>'title')),0)=0 or coalesce(length(btrim(v_draft.content->>'description')),0)=0
    or coalesce(v_draft.content->>'currency','')<>'EUR' or coalesce((v_draft.content->>'priceCents')::bigint,0)<=0 or coalesce((v_draft.content->>'categoryId')::bigint,0)<=0
    or coalesce((v_draft.content->>'conditionId')::bigint,0)<=0 or coalesce((v_draft.content->>'packageSizeId')::bigint,0)<=0 or cardinality(v_draft.image_ids) not between 1 and 20 then raise exception 'Bitte Angaben und Fotos vor der Anbieteraktion vervollständigen.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('id',image.id::text,'storagePath',image.storage_path,'fileName',image.file_name,'mimeType',image.mime_type,'byteSize',image.byte_size) order by chosen.position) into v_images
    from unnest(v_draft.image_ids) with ordinality chosen(id,position) join public.marketplace_listing_images image on image.id=chosen.id and image.workspace_id=v_draft.workspace_id and image.draft_id=v_draft.id and image.state='ready'
    where exists(select 1 from storage.objects object where object.bucket_id='marketplace-listing-media' and object.name=image.storage_path and object.metadata->>'size'=image.byte_size::text and object.metadata->>'mimetype'=image.mime_type);
  if coalesce(jsonb_array_length(v_images),0)<>cardinality(v_draft.image_ids) then raise exception 'Die Originalfotos sind noch nicht vollständig gespeichert.' using errcode='22023'; end if;
  insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,permission_id,requested_by,request_id,request_hash,draft_revision,authorization_version,
    external_account_id,execution_mode,action,snapshot,scheduled_at,time_zone,late_policy,replaces_job_id)
    values(v_draft.workspace_id,v_draft.connection_id,v_draft.id,v_permission.id,(select auth.uid()),p_request_id,v_hash,v_draft.revision,v_permission.authorization_version,
      v_permission.external_account_id,v_permission.execution_mode,p_action,jsonb_build_object('content',v_draft.content,'images',v_images,'aiPhoto',p_ai_photo,'bump',false,
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id),p_scheduled_at,p_time_zone,p_late_policy,p_replaces_job_id) returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$$;
revoke all on function public.marketplace_enqueue_listing_internal(text,bigint,text,uuid,boolean,timestamptz,text,text,bigint,bigint) from public,anon,authenticated;

create or replace function public.marketplace_enqueue_listing(p_draft_id text,p_expected_revision bigint,p_action text,p_request_id uuid,p_ai_photo boolean,
  p_scheduled_at timestamptz default null,p_time_zone text default null,p_late_policy text default 'pause_after_30_minutes')
returns jsonb language sql volatile security definer set search_path='' as $$
  select public.marketplace_enqueue_listing_internal(p_draft_id,p_expected_revision,p_action,p_request_id,p_ai_photo,p_scheduled_at,p_time_zone,p_late_policy);
$$;

-- Ersatz nutzt dieselbe Annahmeprüfung; Abbruch und neuer Inhalt werden zusammen gespeichert.
create or replace function public.marketplace_replace_planned_listing(p_job_id text,p_expected_version bigint,p_expected_revision bigint,p_action text,p_request_id uuid,p_ai_photo boolean,
  p_scheduled_at timestamptz,p_time_zone text,p_late_policy text default 'pause_after_30_minutes')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  return public.marketplace_enqueue_listing_internal(v_job.draft_id::text,p_expected_revision,p_action,p_request_id,p_ai_photo,p_scheduled_at,p_time_zone,p_late_policy,v_job.id,p_expected_version);
end;
$$;
revoke all on function public.marketplace_replace_planned_listing(text,bigint,bigint,text,uuid,boolean,timestamptz,text,text) from public,anon;
grant execute on function public.marketplace_replace_planned_listing(text,bigint,bigint,text,uuid,boolean,timestamptz,text,text) to authenticated;

-- Umplanen erhält Aktion und Fotoeinstellung aus der unveränderlichen Aufnahme.
-- Definer ist nötig, weil Clients weder Aufnahmen verändern noch die interne Annahme aufrufen dürfen.
create or replace function public.marketplace_reschedule_listing(p_job_id text,p_expected_version bigint,p_expected_revision bigint,p_request_id uuid,
  p_scheduled_at timestamptz,p_time_zone text,p_late_policy text default 'pause_after_30_minutes')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_job.workspace_id);
  return public.marketplace_enqueue_listing_internal(v_job.draft_id::text,p_expected_revision,v_job.action,p_request_id,
    (v_job.snapshot->>'aiPhoto')::boolean,p_scheduled_at,p_time_zone,p_late_policy,v_job.id,p_expected_version);
end;
$$;
revoke all on function public.marketplace_reschedule_listing(text,bigint,bigint,uuid,timestamptz,text,text) from public,anon;
grant execute on function public.marketplace_reschedule_listing(text,bigint,bigint,uuid,timestamptz,text,text) to authenticated;

create or replace function public.marketplace_cancel_listing_job(p_job_id text,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
$$;
revoke all on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) from public,anon;
grant execute on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) to authenticated;

-- SECURITY DEFINER gleicht abgelaufene Freigaben ab, ohne Clients Schreibrechte zu geben.
create or replace function public.marketplace_read_listing_jobs(p_workspace_id uuid,p_draft_id text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_items jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  perform public.marketplace_expire_local_listing_attempts(p_workspace_id);
  perform public.marketplace_expire_cloud_listing_attempts(p_workspace_id);
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
$$;
revoke all on function public.marketplace_read_listing_jobs(uuid,text) from public,anon;
grant execute on function public.marketplace_read_listing_jobs(uuid,text) to authenticated;

-- Lokaler Lesepilot: Nur Token-Hashes, eine Installation je Verbindung und keine Cloud-Rücknahme.
create table public.marketplace_local_extension_grants (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  approved_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  unique (workspace_id, connection_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade
);
comment on table public.marketplace_local_extension_grants is 'Widerrufbare 24-Stunden-Lesefreigaben für eine lokale Installation; keine Browser- oder Vinted-Geheimnisse.';
create index marketplace_local_extension_grants_approver on public.marketplace_local_extension_grants(approved_by);
alter table public.marketplace_local_extension_grants enable row level security;
revoke all on public.marketplace_local_extension_grants from public,anon,authenticated;
grant all on public.marketplace_local_extension_grants to service_role;
revoke all on sequence public.marketplace_local_extension_grants_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_local_extension_grants_id_seq to service_role;
create policy "Worker reads local grants" on public.marketplace_local_extension_grants for select to service_role using(true);
create policy "Worker inserts local grants" on public.marketplace_local_extension_grants for insert to service_role with check(true);
create policy "Worker updates local grants" on public.marketplace_local_extension_grants for update to service_role using(true) with check(true);
create policy "Worker deletes local grants" on public.marketplace_local_extension_grants for delete to service_role using(true);

-- Eng begrenzter Auth-Lookup: Worker erhalten niemals Tabellenzugriff auf auth.users.
create or replace function public.marketplace_local_extension_user_valid(p_user_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  perform 1 from auth.users where id=p_user_id and not is_anonymous for share;
  return found;
end;
$$;
revoke all on function public.marketplace_local_extension_user_valid(uuid) from public,anon,authenticated;
grant execute on function public.marketplace_local_extension_user_valid(uuid) to service_role;

create or replace function public.marketplace_approve_local_extension(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_expected_external_account_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expected_external_account_id is null or p_expected_external_account_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Ungültige lokale Freigabe' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.status in ('paused','blocked') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if v_connection.external_account_id is not null and v_connection.external_account_id<>p_expected_external_account_id then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping'))
    or exists(select 1 from public.marketplace_operations where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','running','outcome_unknown'))
    or exists(select 1 from public.marketplace_sync_schedules where workspace_id=p_workspace_id and connection_id=p_connection_id and enabled) then raise exception 'Cloudbetrieb muss zuerst beendet werden' using errcode='55P03'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if found and v_grant.revoked_at is null and v_grant.expires_at>clock_timestamp() then
    if v_connection.execution_mode='local' and v_grant.token_hash=p_token_hash and v_grant.approved_by=(select auth.uid()) and v_grant.external_account_id=p_expected_external_account_id then
      return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at);
    end if;
    raise exception 'Lokale Installation bereits verbunden' using errcode='55P03';
  end if;
  if not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_token_hash,p_expected_external_account_id,clock_timestamp()+interval '24 hours')
    on conflict(workspace_id,connection_id) do update set approved_by=excluded.approved_by,token_hash=excluded.token_hash,external_account_id=excluded.external_account_id,expires_at=excluded.expires_at,last_seen_at=null,revoked_at=null returning * into v_grant;
  update public.marketplace_connections set external_account_id=p_expected_external_account_id,execution_mode='local',status='needs_login',resume_status=null,capabilities='{}'::jsonb,updated_at=clock_timestamp() where id=p_connection_id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at);
end;
$$;

create or replace function public.marketplace_read_local_extension(p_workspace_id uuid,p_connection_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('binding',case when v_grant.id is null then null else jsonb_build_object('externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'lastSeenAt',v_grant.last_seen_at,'revoked',v_grant.revoked_at is not null) end);
end;
$$;

create or replace function public.marketplace_revoke_local_extension(p_workspace_id uuid,p_connection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  perform 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  update public.marketplace_local_extension_grants set revoked_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and revoked_at is null;
  update public.marketplace_connections set status='disconnected',resume_status=null,capabilities='{}',updated_at=clock_timestamp() where id=p_connection_id and execution_mode='local';
  return jsonb_build_object('ok',true);
end;
$$;

-- Server-RPC hält Freigabe und Berechtigungszeilen bis zum atomaren Import gesperrt.
create or replace function public.marketplace_ingest_local_extension(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_snapshot jsonb default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
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
    return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at);
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>524288
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object' or p_snapshot->'identity'->>'id' is distinct from v_grant.external_account_id then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array' or jsonb_array_length(p_snapshot->'entries')>501
    or jsonb_typeof(p_snapshot->'publicationsComplete') is distinct from 'boolean' or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or jsonb_typeof(p_snapshot->'identity'->'username') is distinct from 'string' or char_length(p_snapshot->'identity'->>'username') not between 1 and 120 then raise exception 'Ungültiger lokaler Import' using errcode='22023'; end if;
  begin v_observed:=(p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Abrufzeit' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id),'-infinity') then raise exception 'Veralteter Import' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind'='profile')<>1
    or exists(select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Ungültige Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or v_entry->>'kind' is null or v_entry->>'kind' not in ('profile','publication')
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^[1-9][0-9]{0,31}$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='profile' then array['username','displayName','location','bio','bioState','imageUrl','feedbackCount','feedbackReputation','positiveFeedbackCount','neutralFeedbackCount','negativeFeedbackCount','itemCount','observedAt'] else array['title','text','textState','occurredAt','price','currency','status','imageUrl','imageUrls','metrics','promoted','brand','size','priceLabel','isClosed','isReserved'] end))
      or (v_entry->>'kind'='profile' and (v_entry->>'externalId'<>v_grant.external_account_id or v_entry->'body'->>'username' is distinct from p_snapshot->'identity'->>'username')) then raise exception 'Ungültiger Kontoeintrag' using errcode='22023'; end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_entry->>'kind',v_entry->>'externalId',v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
      on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    if v_entry->>'kind'='publication' then v_count:=v_count+1; end if;
  end loop;
  v_complete:=(p_snapshot->>'publicationsComplete')::boolean;
  -- Auch vollständige lokale Lesekopien löschen niemals Anzeigen oder interpretieren fehlende Datensätze als Verkauf.
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
    values(p_workspace_id,p_connection_id,'profile','complete',v_observed,v_observed,v_observed),
      (p_workspace_id,p_connection_id,'publications',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,
      last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  update public.marketplace_connections set external_account_id=v_grant.external_account_id,status='connected',capabilities='{"profile.read":"verified","listings.read":"verified"}',last_synced_at=v_observed,updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  -- Der bestehende Connection-Trigger sendet account_imported mit last_synced_at.
  return jsonb_build_object('ok',true,'counts',jsonb_build_object('profile',1,'publication',v_count),'observedAt',v_observed);
end;
$$;

-- Defensive Schranke auch für direkte Worker-Inserts; Ablauf ändert den Modus nicht.
create or replace function public.marketplace_require_cloud_execution()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_connections where workspace_id=new.workspace_id and id=new.connection_id and execution_mode='cloud' for update;
  if not found then raise exception 'Lokale Verbindung erlaubt keinen Cloudauftrag' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger marketplace_browser_requires_cloud before insert on public.marketplace_browser_sessions for each row execute function public.marketplace_require_cloud_execution();
create trigger marketplace_operation_requires_cloud before insert on public.marketplace_operations for each row execute function public.marketplace_require_cloud_execution();
create trigger marketplace_schedule_requires_cloud before insert or update on public.marketplace_sync_schedules for each row when(new.enabled) execute function public.marketplace_require_cloud_execution();
revoke all on function public.marketplace_require_cloud_execution() from public,anon,authenticated;
revoke all on function public.marketplace_approve_local_extension(uuid,uuid,text,text),public.marketplace_read_local_extension(uuid,uuid),public.marketplace_revoke_local_extension(uuid,uuid) from public,anon;
grant execute on function public.marketplace_approve_local_extension(uuid,uuid,text,text),public.marketplace_read_local_extension(uuid,uuid),public.marketplace_revoke_local_extension(uuid,uuid) to authenticated;
revoke all on function public.marketplace_ingest_local_extension(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_ingest_local_extension(uuid,uuid,text,jsonb),public.marketplace_require_cloud_execution() to service_role;

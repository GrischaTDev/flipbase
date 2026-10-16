-- Eigene Kleinanzeigen-Konten und widerrufbare lokale Installationsfreigaben.
-- Öffentliche Nutzer-RPCs brauchen Definer-Rechte ausschließlich für die versteckte Hash-Tabelle.
-- Jeder Einstieg prüft echte Nutzeridentität, bestehende Marktplatzrechte und aktiven Workspace.
create table public.kleinanzeigen_connections (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  account_type text not null check (account_type in ('private','commercial','unknown')),
  status text not null default 'needs_login' check (status in ('needs_login','connected','disconnected')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_synced_at timestamptz,
  quota_used integer check (quota_used >= 0),
  quota_observed_at timestamptz,
  unique (workspace_id,id),
  unique (workspace_id,external_account_id),
  check ((quota_used is null) = (quota_observed_at is null))
);
comment on table public.kleinanzeigen_connections is 'Eigene Kleinanzeigen-Konten; Kontingent nur aus den offiziellen Kontoeinstellungen, niemals aus aktiven Inseraten.';
create index kleinanzeigen_connections_creator on public.kleinanzeigen_connections(created_by);
alter table public.kleinanzeigen_connections enable row level security;
revoke all on public.kleinanzeigen_connections from public,anon,authenticated;
grant select on public.kleinanzeigen_connections to authenticated;
grant all on public.kleinanzeigen_connections to service_role;
revoke all on sequence public.kleinanzeigen_connections_id_seq from public,anon,authenticated;
grant usage,select on sequence public.kleinanzeigen_connections_id_seq to service_role;
create policy "Eigene Kleinanzeigen-Konten lesen" on public.kleinanzeigen_connections for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Kleinanzeigen-Konten serverseitig lesen" on public.kleinanzeigen_connections for select to service_role using (true);
create policy "Kleinanzeigen-Konten serverseitig anlegen" on public.kleinanzeigen_connections for insert to service_role with check (true);
create policy "Kleinanzeigen-Konten serverseitig ändern" on public.kleinanzeigen_connections for update to service_role using (true) with check (true);
create policy "Kleinanzeigen-Konten serverseitig löschen" on public.kleinanzeigen_connections for delete to service_role using (true);
create trigger "00_protect_archived_workspace" before insert or update or delete on public.kleinanzeigen_connections for each row execute function public.protect_archived_workspace_data();

create table public.kleinanzeigen_local_grants (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id bigint not null,
  approved_by uuid not null references auth.users(id),
  installation_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  grant_generation bigint not null default 1 check (grant_generation > 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  can_publish boolean not null default false,
  last_seen_at timestamptz,
  unique(workspace_id,connection_id),
  foreign key(workspace_id,connection_id) references public.kleinanzeigen_connections(workspace_id,id) on delete cascade
);
comment on table public.kleinanzeigen_local_grants is 'Versteckte Hashes lokaler Kleinanzeigen-Freigaben; niemals Cookies oder Rohsecrets. Lesen und Veröffentlichen sind getrennt.';
create index kleinanzeigen_grants_approver on public.kleinanzeigen_local_grants(approved_by);
alter table public.kleinanzeigen_local_grants enable row level security;
revoke all on public.kleinanzeigen_local_grants from public,anon,authenticated;
grant all on public.kleinanzeigen_local_grants to service_role;
revoke all on sequence public.kleinanzeigen_local_grants_id_seq from public,anon,authenticated;
grant usage,select on sequence public.kleinanzeigen_local_grants_id_seq to service_role;
create policy "Kleinanzeigen-Freigaben serverseitig lesen" on public.kleinanzeigen_local_grants for select to service_role using (true);
create policy "Kleinanzeigen-Freigaben serverseitig anlegen" on public.kleinanzeigen_local_grants for insert to service_role with check (true);
create policy "Kleinanzeigen-Freigaben serverseitig ändern" on public.kleinanzeigen_local_grants for update to service_role using (true) with check (true);
create policy "Kleinanzeigen-Freigaben serverseitig löschen" on public.kleinanzeigen_local_grants for delete to service_role using (true);
create trigger "00_protect_archived_workspace" before insert or update or delete on public.kleinanzeigen_local_grants for each row execute function public.protect_archived_workspace_data();

create or replace function public.kleinanzeigen_connect_account(
 p_workspace_id uuid,p_external_account_id text,p_display_name text,p_account_type text,
 p_installation_id uuid,p_token_hash text,p_can_publish boolean default false
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_connection public.kleinanzeigen_connections; v_grant public.kleinanzeigen_local_grants;
begin
 if not public.marketplace_can_manage(p_workspace_id)
   or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid()))
   or not public.marketplace_local_extension_user_valid((select auth.uid())) then
   raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode='42501';
 end if;
 if p_external_account_id is null or p_external_account_id !~ '^[1-9][0-9]{0,31}$'
   or p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120
   or p_account_type is null or p_account_type not in ('private','commercial','unknown')
   or p_installation_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
   or p_can_publish is null then raise exception 'Ungültige Kontobindung.' using errcode='22023'; end if;
 -- Dieselbe externe Identität im Workspace wird auch bei paralleler Erstbindung serialisiert.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':kleinanzeigen:' || p_external_account_id,0));
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and external_account_id=p_external_account_id for update;
 if not found then
   insert into public.kleinanzeigen_connections(workspace_id,external_account_id,display_name,account_type,created_by)
   values(p_workspace_id,p_external_account_id,btrim(p_display_name),p_account_type,(select auth.uid())) returning * into v_connection;
 end if;
 select * into v_grant from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=v_connection.id for update;
 if found and v_grant.revoked_at is null and v_grant.expires_at>clock_timestamp() then
   if v_grant.approved_by is distinct from (select auth.uid()) or v_grant.installation_id<>p_installation_id or v_grant.token_hash<>p_token_hash or v_grant.can_publish<>p_can_publish then
     raise exception 'Dieses Konto ist bereits an eine aktive Installation gebunden.' using errcode='55P03';
   end if;
 else
   insert into public.kleinanzeigen_local_grants(workspace_id,connection_id,approved_by,installation_id,token_hash,expires_at,can_publish)
   values(p_workspace_id,v_connection.id,(select auth.uid()),p_installation_id,p_token_hash,clock_timestamp()+interval '24 hours',p_can_publish)
   on conflict(workspace_id,connection_id) do update set approved_by=excluded.approved_by,installation_id=excluded.installation_id,
    token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked_at=null,can_publish=excluded.can_publish,last_seen_at=null,
    grant_generation=public.kleinanzeigen_local_grants.grant_generation+1 returning * into v_grant;
   update public.kleinanzeigen_connections set status='needs_login',quota_used=null,quota_observed_at=null where id=v_connection.id returning * into v_connection;
 end if;
 -- Erst nach Prüfung einer bestehenden aktiven Installation bestätigte Metadaten übernehmen.
 if v_connection.display_name is distinct from btrim(p_display_name) or v_connection.account_type is distinct from p_account_type then
  update public.kleinanzeigen_connections set display_name=btrim(p_display_name),account_type=p_account_type where workspace_id=p_workspace_id and id=v_connection.id returning * into v_connection;
 end if;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',v_connection.id::text,'externalAccountId',v_connection.external_account_id,
  'displayName',v_connection.display_name,'accountType',v_connection.account_type,'status',v_connection.status,
  'generation',v_grant.grant_generation,'expiresAt',v_grant.expires_at,'canPublish',v_grant.can_publish);
end;
$$;
revoke all on function public.kleinanzeigen_connect_account(uuid,text,text,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_connect_account(uuid,text,text,text,uuid,text,boolean) to authenticated;

create or replace function public.kleinanzeigen_disconnect_account(p_workspace_id uuid,p_connection_id bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid()))
  or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;
 if not found then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
 update public.kleinanzeigen_local_grants set revoked_at=clock_timestamp(),grant_generation=grant_generation+1 where workspace_id=p_workspace_id and connection_id=p_connection_id and revoked_at is null;
 update public.kleinanzeigen_connections set status='disconnected' where workspace_id=p_workspace_id and id=p_connection_id;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.kleinanzeigen_disconnect_account(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_disconnect_account(uuid,bigint) to authenticated;

-- Nur der geprüfte Installationsendpoint darf diese Prüfung verwenden. Die Zeilensperren
-- bleiben bis zum Ende der aufrufenden RPC bestehen und schützen vor gleichzeitigem Widerruf.
create or replace function public.kleinanzeigen_extension_session(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_connection public.kleinanzeigen_connections; v_grant public.kleinanzeigen_local_grants;
begin
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;
 if not found or v_connection.status='disconnected' then raise exception 'Lokale Freigabe ungültig.' using errcode='42501'; end if;
 select * into v_grant from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
 if not found or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
  or (p_generation is not null and v_grant.grant_generation<>p_generation)
  or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
  or not public.marketplace_local_extension_user_valid(v_grant.approved_by) then raise exception 'Lokale Freigabe ungültig.' using errcode='42501'; end if;
 update public.kleinanzeigen_local_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'externalAccountId',v_connection.external_account_id,
  'generation',v_grant.grant_generation,'expiresAt',v_grant.expires_at,'canPublish',v_grant.can_publish);
end;
$$;
revoke all on function public.kleinanzeigen_extension_session(uuid,bigint,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_extension_session(uuid,bigint,text,bigint) to service_role;

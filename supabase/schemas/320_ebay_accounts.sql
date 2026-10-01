-- Persönliche eBay-OAuth-Verbindungen; Vinted-Betreiberrechte bleiben unverändert.
create table public.ebay_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  environment text not null check (environment in ('production', 'sandbox')),
  status text not null default 'needs_login' check (status in ('connected', 'needs_login', 'disconnected')),
  external_account_id text,
  username text,
  authorization_version bigint not null default 0,
  operation_id uuid,
  operation_expires_at timestamptz,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, environment)
);
comment on table public.ebay_connections is 'Eine persönliche eBay-Verbindung je Nutzer, Workspace und Umgebung. Keine Zugangstokens.';
create index ebay_connections_user on public.ebay_connections (user_id, workspace_id);
create index ebay_connections_external_account on public.ebay_connections (environment, external_account_id);
alter table public.ebay_connections enable row level security;
revoke all on public.ebay_connections from public, anon, authenticated;
grant select on public.ebay_connections to authenticated;
grant all on public.ebay_connections to service_role;

create table public.ebay_credentials (
  id uuid primary key references public.ebay_connections(id) on delete cascade,
  encrypted_tokens text not null,
  updated_at timestamptz not null default now()
);
comment on table public.ebay_credentials is 'AES-GCM-verschlüsselte OAuth-Tokens. Schlüssel ausschließlich im Funktionsdienst; kein Clientzugriff.';
alter table public.ebay_credentials enable row level security;
revoke all on public.ebay_credentials from public, anon, authenticated;
grant all on public.ebay_credentials to service_role;

create table public.ebay_authorization_states (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.ebay_connections(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  authorization_version bigint not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
comment on table public.ebay_authorization_states is 'Einmalige, gehashte OAuth-Zustände; Identität und Workspace stammen aus der persönlichen Verbindung.';
create index ebay_authorization_states_connection on public.ebay_authorization_states (connection_id);
create index ebay_authorization_states_expiry on public.ebay_authorization_states (expires_at);
alter table public.ebay_authorization_states enable row level security;
revoke all on public.ebay_authorization_states from public, anon, authenticated;
grant all on public.ebay_authorization_states to service_role;

create or replace function public.ebay_can_connect(p_workspace_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null
    and public.is_workspace_member(p_workspace_id)
    and exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.archived_at is null);
$$;
revoke all on function public.ebay_can_connect(uuid) from public, anon;
grant execute on function public.ebay_can_connect(uuid) to authenticated;

create policy "Users read their own eBay connections" on public.ebay_connections
for select to authenticated using (user_id = (select auth.uid()) and public.ebay_can_connect(workspace_id));

-- Dienstfunktionen erhalten ausschließlich die durch getUser bestätigte Identität.
create or replace function public.ebay_begin_authorization(p_workspace_id uuid, p_user_id uuid, p_environment text, p_state_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections;
begin
  if not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and w.archived_at is null)
  then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_environment not in ('production','sandbox') or p_state_hash !~ '^[0-9a-f]{64}$' or p_state_hash is null
  then raise exception 'Ungültige Anmeldung' using errcode = '22023'; end if;
  insert into public.ebay_connections (workspace_id,user_id,environment)
    values (p_workspace_id,p_user_id,p_environment)
    on conflict (workspace_id,user_id,environment) do nothing;
  update public.ebay_connections set authorization_version = authorization_version + 1,
    status = 'needs_login', external_account_id = null, username = null, last_read_at = null,
    operation_id = null, operation_expires_at = null, updated_at = now()
    where workspace_id = p_workspace_id and user_id = p_user_id and environment = p_environment
    returning * into v_connection;
  delete from public.ebay_credentials where id = v_connection.id;
  delete from public.ebay_authorization_states where connection_id = v_connection.id or expires_at <= now();
  insert into public.ebay_authorization_states (connection_id,state_hash,authorization_version)
    values (v_connection.id,p_state_hash,v_connection.authorization_version);
  return to_jsonb(v_connection);
end;
$$;
revoke all on function public.ebay_begin_authorization(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.ebay_begin_authorization(uuid,uuid,text,text) to service_role;

create or replace function public.ebay_consume_authorization(p_state_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_state public.ebay_authorization_states; v_connection public.ebay_connections;
begin
  select * into v_state from public.ebay_authorization_states where state_hash = p_state_hash;
  if not found or v_state.expires_at <= now() then return null; end if;
  select * into v_connection from public.ebay_connections where id = v_state.connection_id
    and authorization_version = v_state.authorization_version for update;
  if not found or not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = v_connection.workspace_id and m.user_id = v_connection.user_id and w.archived_at is null)
  then return null; end if;
  delete from public.ebay_authorization_states where id = v_state.id returning * into v_state;
  if not found then return null; end if;
  return to_jsonb(v_connection);
end;
$$;
revoke all on function public.ebay_consume_authorization(text) from public, anon, authenticated;
grant execute on function public.ebay_consume_authorization(text) to service_role;

create or replace function public.ebay_complete_authorization(p_connection_id uuid, p_version bigint, p_external_account_id text, p_username text, p_encrypted_tokens text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id
    and authorization_version = p_version and status = 'needs_login' for update;
  if not found or not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = v_connection.workspace_id and m.user_id = v_connection.user_id and w.archived_at is null)
  then return false; end if;
  if p_external_account_id is null or char_length(p_external_account_id) not between 1 and 256
    or p_encrypted_tokens is null or p_encrypted_tokens = '' then raise exception 'Ungültige Kontoverbindung' using errcode = '22023'; end if;
  insert into public.ebay_credentials (id,encrypted_tokens) values (p_connection_id,p_encrypted_tokens)
    on conflict (id) do update set encrypted_tokens = excluded.encrypted_tokens, updated_at = now();
  update public.ebay_connections set status = 'connected', external_account_id = p_external_account_id,
    username = left(p_username,120), updated_at = now() where id = p_connection_id;
  return true;
end;
$$;
revoke all on function public.ebay_complete_authorization(uuid,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.ebay_complete_authorization(uuid,bigint,text,text,text) to service_role;

-- Die zeitlich begrenzte Sperre schützt auch mehrere Edge-Instanzen vor parallelem Refresh.
create or replace function public.ebay_claim_connection(p_workspace_id uuid, p_user_id uuid, p_connection_id uuid, p_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections; v_tokens text;
begin
  if not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and w.archived_at is null)
  then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  update public.ebay_connections set operation_id = p_operation_id, operation_expires_at = now() + interval '90 seconds'
    where id = p_connection_id and workspace_id = p_workspace_id and user_id = p_user_id and status = 'connected'
      and (operation_id is null or operation_expires_at <= now()) returning * into v_connection;
  if not found then return null; end if;
  select encrypted_tokens into v_tokens from public.ebay_credentials where id = v_connection.id;
  return jsonb_build_object('connection',to_jsonb(v_connection),'encryptedTokens',v_tokens);
end;
$$;
revoke all on function public.ebay_claim_connection(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.ebay_claim_connection(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.ebay_finish_read(p_connection_id uuid, p_operation_id uuid, p_version bigint, p_encrypted_tokens text default null, p_needs_login boolean default false, p_observed boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id
    and operation_id = p_operation_id and authorization_version = p_version and status = 'connected'
    and operation_expires_at > now() for update;
  if not found then return false; end if;
  if not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = v_connection.workspace_id and m.user_id = v_connection.user_id and w.archived_at is null)
  then return false; end if;
  if p_needs_login then
    delete from public.ebay_credentials where id = p_connection_id;
  elsif p_encrypted_tokens is not null then
    update public.ebay_credentials set encrypted_tokens = p_encrypted_tokens, updated_at = now() where id = p_connection_id;
  end if;
  update public.ebay_connections set operation_id = null, operation_expires_at = null,
    status = case when p_needs_login then 'needs_login' else status end,
    last_read_at = case when p_observed then now() else last_read_at end, updated_at = now() where id = p_connection_id;
  return true;
end;
$$;
revoke all on function public.ebay_finish_read(uuid,uuid,bigint,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.ebay_finish_read(uuid,uuid,bigint,text,boolean,boolean) to service_role;

create or replace function public.ebay_disconnect(p_workspace_id uuid, p_connection_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.ebay_can_connect(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  update public.ebay_connections set status = 'disconnected', external_account_id = null, username = null,
    authorization_version = authorization_version + 1, operation_id = null, operation_expires_at = null,
    last_read_at = null, updated_at = now()
    where id = p_connection_id and workspace_id = p_workspace_id and user_id = (select auth.uid());
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  delete from public.ebay_credentials where id = p_connection_id;
  delete from public.ebay_authorization_states where connection_id = p_connection_id;
  return true;
end;
$$;
revoke all on function public.ebay_disconnect(uuid,uuid) from public, anon;
grant execute on function public.ebay_disconnect(uuid,uuid) to authenticated;

create or replace function public.ebay_delete_account(p_environment text, p_external_account_id text)
returns void language sql security invoker set search_path = '' as $$
  delete from public.ebay_connections where environment = p_environment and external_account_id = p_external_account_id;
$$;
revoke all on function public.ebay_delete_account(text,text) from public, anon, authenticated;
grant execute on function public.ebay_delete_account(text,text) to service_role;

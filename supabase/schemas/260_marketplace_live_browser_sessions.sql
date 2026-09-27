-- Dauerhafte, kontogebundene Browser-Sitzungen. Keine Anbieter- oder Plattformtoken.
-- Profilreferenzen sind nur für den Serverdienst lesbar und werden je Sitzung kopiert.
create table public.marketplace_browser_profiles (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  provider_profile_id text not null check (char_length(provider_profile_id) between 1 and 128 and provider_profile_id ~ '^[a-zA-Z0-9_-]+$'),
  created_at timestamptz not null default now(),
  unique (workspace_id, connection_id),
  unique (provider_profile_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_browser_profiles is 'Serverseitige Zuordnung einer Flipbase-Verbindung zu einem Anbieterprofil; keine Token oder Cookies.';
alter table public.marketplace_browser_profiles enable row level security;
revoke all on public.marketplace_browser_profiles from public, anon, authenticated;
grant all on public.marketplace_browser_profiles to service_role;
revoke all on sequence public.marketplace_browser_profiles_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_browser_profiles_id_seq to service_role;
create policy "Worker reads browser profiles" on public.marketplace_browser_profiles for select to service_role using (true);
create policy "Worker inserts browser profiles" on public.marketplace_browser_profiles for insert to service_role with check (true);
create policy "Worker updates browser profiles" on public.marketplace_browser_profiles for update to service_role using (true) with check (true);
create policy "Worker deletes browser profiles" on public.marketplace_browser_profiles for delete to service_role using (true);

create table public.marketplace_browser_sessions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  workspace_id uuid not null,
  connection_id uuid not null,
  started_by uuid not null,
  provider_profile_id text not null,
  state text not null default 'active' check (state in ('active', 'stopping', 'closed')),
  stop_reason text check (stop_reason in ('requested', 'expired', 'paused', 'interrupted')),
  expires_at timestamptz not null,
  provider_stopped_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade,
  check ((state = 'closed') = (provider_stopped_at is not null))
);
comment on table public.marketplace_browser_sessions is 'Dauerhafte Bedienungssperren; aktiv und wartend bleiben bis zum bestätigten Anbieter-Stopp exklusiv.';
create unique index marketplace_browser_one_unresolved on public.marketplace_browser_sessions (workspace_id, connection_id) where state in ('active', 'stopping');
create index marketplace_browser_unresolved on public.marketplace_browser_sessions (state, expires_at, id) where state in ('active', 'stopping');
create index marketplace_browser_owner on public.marketplace_browser_sessions (started_by, workspace_id, connection_id);
alter table public.marketplace_browser_sessions enable row level security;
revoke all on public.marketplace_browser_sessions from public, anon, authenticated;
grant all on public.marketplace_browser_sessions to service_role;
revoke all on sequence public.marketplace_browser_sessions_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_browser_sessions_id_seq to service_role;
create policy "Worker reads browser sessions" on public.marketplace_browser_sessions for select to service_role using (true);
create policy "Worker inserts browser sessions" on public.marketplace_browser_sessions for insert to service_role with check (true);
create policy "Worker updates browser sessions" on public.marketplace_browser_sessions for update to service_role using (true) with check (true);
create policy "Worker deletes browser sessions" on public.marketplace_browser_sessions for delete to service_role using (true);

create or replace function public.marketplace_prevent_unresolved_browser_delete()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.marketplace_browser_sessions
    where workspace_id = old.workspace_id and connection_id = old.id and state in ('active', 'stopping')) then
    raise exception 'Browsersitzung muss zuerst beendet werden' using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.marketplace_prevent_unresolved_browser_delete() from public, anon, authenticated;
create trigger marketplace_prevent_unresolved_browser_delete
before delete on public.marketplace_connections for each row
execute function public.marketplace_prevent_unresolved_browser_delete();

create or replace function public.marketplace_browser_session_reserve(p_workspace_id uuid, p_connection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_status text; v_profile_id text; v_session public.marketplace_browser_sessions;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_status in ('paused', 'blocked') then raise exception 'Verbindung ist nicht verfügbar' using errcode = '22023'; end if;
  select provider_profile_id into v_profile_id from public.marketplace_browser_profiles
    where workspace_id = p_workspace_id and connection_id = p_connection_id;
  if not found then raise exception 'Browserprofil fehlt' using errcode = '22023'; end if;
  if exists (select 1 from public.marketplace_browser_sessions
    where workspace_id = p_workspace_id and connection_id = p_connection_id and state in ('active', 'stopping'))
  then raise exception 'Konto wird bereits bedient oder bereinigt' using errcode = '55P03'; end if;
  insert into public.marketplace_browser_sessions (workspace_id, connection_id, started_by, provider_profile_id, expires_at)
    values (p_workspace_id, p_connection_id, (select auth.uid()), v_profile_id, clock_timestamp() + interval '10 minutes')
    returning * into v_session;
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state, 'expiresAt', v_session.expires_at);
end;
$$;
revoke all on function public.marketplace_browser_session_reserve(uuid, uuid) from public, anon;
grant execute on function public.marketplace_browser_session_reserve(uuid, uuid) to authenticated;

create or replace function public.marketplace_browser_session_check(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_status text; v_session public.marketplace_browser_sessions; v_active boolean;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid()) for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  if v_session.state = 'active' and (v_session.expires_at <= clock_timestamp() or v_status in ('paused', 'blocked')) then
    update public.marketplace_browser_sessions set state = 'stopping',
      stop_reason = case when v_status in ('paused', 'blocked') then 'paused' else 'expired' end
      where id = v_session.id returning * into v_session;
  end if;
  v_active := v_session.state = 'active' and v_session.expires_at > clock_timestamp();
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state,
    'expiresAt', v_session.expires_at, 'active', v_active);
end;
$$;
revoke all on function public.marketplace_browser_session_check(uuid, uuid, uuid) from public, anon;
grant execute on function public.marketplace_browser_session_check(uuid, uuid, uuid) to authenticated;

create or replace function public.marketplace_browser_session_revoke(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_session public.marketplace_browser_sessions;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid()) for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  if v_session.state = 'active' then
    update public.marketplace_browser_sessions set state = 'stopping', stop_reason = 'requested'
      where id = v_session.id returning * into v_session;
  end if;
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state, 'active', false);
end;
$$;
revoke all on function public.marketplace_browser_session_revoke(uuid, uuid, uuid) from public, anon;
grant execute on function public.marketplace_browser_session_revoke(uuid, uuid, uuid) to authenticated;

create or replace function public.marketplace_revoke_live_browsers_on_pause()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if new.status in ('paused', 'blocked') and old.status is distinct from new.status then
    update public.marketplace_browser_sessions set state = 'stopping', stop_reason = 'paused'
      where workspace_id = new.workspace_id and connection_id = new.id and state = 'active';
  end if;
  return new;
end;
$$;
revoke all on function public.marketplace_revoke_live_browsers_on_pause() from public, anon, authenticated;
create trigger marketplace_revoke_live_browsers_on_pause
after update of status on public.marketplace_connections for each row
execute function public.marketplace_revoke_live_browsers_on_pause();

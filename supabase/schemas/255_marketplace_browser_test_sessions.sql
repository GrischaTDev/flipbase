-- Künstliche Browser-Testsitzungen: eine aktive Bedienung je Kontoverbindung.
-- Die Tabelle enthält weder Plattformzugänge noch Anbieterprofile oder Cookies.
create table public.marketplace_browser_test_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  connection_id uuid not null,
  started_by uuid not null,
  state text not null default 'active' check (state in ('active', 'expired', 'revoked', 'interrupted')),
  interaction_count integer not null default 0 check (interaction_count >= 0),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_browser_test_sessions is 'Kurzlebige, künstliche Sitzungssperren für den kontogebundenen Browser-Test. Keine Anbieter- oder Plattformgeheimnisse.';
create unique index marketplace_browser_test_one_active on public.marketplace_browser_test_sessions (workspace_id, connection_id) where state = 'active';
create index marketplace_browser_test_owner on public.marketplace_browser_test_sessions (started_by, workspace_id, connection_id);
alter table public.marketplace_browser_test_sessions enable row level security;
revoke all on public.marketplace_browser_test_sessions from public, anon, authenticated;
grant select on public.marketplace_browser_test_sessions to authenticated;
grant all on public.marketplace_browser_test_sessions to service_role;
create policy "Operators read their browser tests" on public.marketplace_browser_test_sessions
for select to authenticated using (started_by = (select auth.uid()) and public.marketplace_can_manage(workspace_id));

create or replace function public.marketplace_test_session_start(p_workspace_id uuid, p_connection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_status text; v_session public.marketplace_browser_test_sessions;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  -- Die Verbindungssperre serialisiert konkurrierende Starts desselben Kontos.
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_status in ('paused', 'blocked') then raise exception 'Verbindung ist nicht verfügbar' using errcode = '22023'; end if;
  update public.marketplace_browser_test_sessions set state = 'expired', ended_at = clock_timestamp()
    where workspace_id = p_workspace_id and connection_id = p_connection_id and state = 'active' and expires_at <= clock_timestamp();
  if exists (select 1 from public.marketplace_browser_test_sessions
    where workspace_id = p_workspace_id and connection_id = p_connection_id and state = 'active')
  then raise exception 'Konto wird bereits bedient' using errcode = '55P03'; end if;
  insert into public.marketplace_browser_test_sessions (workspace_id, connection_id, started_by, expires_at)
    values (p_workspace_id, p_connection_id, (select auth.uid()), clock_timestamp() + interval '2 minutes')
    returning * into v_session;
  return jsonb_build_object('id', v_session.id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state,
    'expiresAt', v_session.expires_at, 'interactionCount', v_session.interaction_count);
end;
$$;
revoke all on function public.marketplace_test_session_start(uuid, uuid) from public, anon;
grant execute on function public.marketplace_test_session_start(uuid, uuid) to authenticated;

create or replace function public.marketplace_test_session_status(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_session public.marketplace_browser_test_sessions; v_state text;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_test_sessions
    where id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid());
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  v_state := case when v_session.state = 'active' and v_session.expires_at <= statement_timestamp()
    then 'expired' else v_session.state end;
  return jsonb_build_object('id', v_session.id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_state,
    'expiresAt', v_session.expires_at, 'interactionCount', v_session.interaction_count);
end;
$$;
revoke all on function public.marketplace_test_session_status(uuid, uuid, uuid) from public, anon;
grant execute on function public.marketplace_test_session_status(uuid, uuid, uuid) to authenticated;

create or replace function public.marketplace_test_session_action(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid, p_action text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_session public.marketplace_browser_test_sessions; v_status text; v_accepted boolean := false;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('ping', 'interrupt', 'revoke') then
    raise exception 'Unbekannte Testaktion' using errcode = '22023'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_test_sessions
    where id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid()) for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  if v_session.state = 'active' and v_session.expires_at <= clock_timestamp() then
    update public.marketplace_browser_test_sessions set state = 'expired', ended_at = clock_timestamp()
      where id = p_session_id returning * into v_session;
  elsif v_session.state = 'active' and v_status not in ('paused', 'blocked') then
    v_accepted := true;
    if p_action = 'ping' then
      update public.marketplace_browser_test_sessions
        set interaction_count = interaction_count + 1, last_seen_at = clock_timestamp()
        where id = p_session_id returning * into v_session;
    else
      update public.marketplace_browser_test_sessions
        set state = case when p_action = 'interrupt' then 'interrupted' else 'revoked' end,
            ended_at = clock_timestamp()
        where id = p_session_id returning * into v_session;
    end if;
  end if;
  return jsonb_build_object('id', v_session.id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state,
    'expiresAt', v_session.expires_at, 'interactionCount', v_session.interaction_count,
    'accepted', v_accepted);
end;
$$;
revoke all on function public.marketplace_test_session_action(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.marketplace_test_session_action(uuid, uuid, uuid, text) to authenticated;

create or replace function public.marketplace_revoke_browser_tests_on_pause()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if new.status in ('paused', 'blocked') and old.status is distinct from new.status then
    update public.marketplace_browser_test_sessions set state = 'revoked', ended_at = clock_timestamp()
      where workspace_id = new.workspace_id and connection_id = new.id and state = 'active';
  end if;
  return new;
end;
$$;
revoke all on function public.marketplace_revoke_browser_tests_on_pause() from public, anon, authenticated;
create trigger marketplace_revoke_browser_tests_on_pause
after update of status on public.marketplace_connections for each row
execute function public.marketplace_revoke_browser_tests_on_pause();

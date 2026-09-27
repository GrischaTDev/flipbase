-- Zweck: Künstliche, kontogebundene Browser-Testsitzungen mit Ablauf und Widerruf.
-- Betroffen: public.marketplace_browser_test_sessions und zugehörige Testfunktionen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.marketplace_revoke_browser_tests_on_pause()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.status in ('paused', 'blocked') and old.status is distinct from new.status then
    update public.marketplace_browser_test_sessions set state = 'revoked', ended_at = clock_timestamp()
      where workspace_id = new.workspace_id and connection_id = new.id and state = 'active';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_revoke_browser_tests_on_pause() FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_revoke_browser_tests_on_pause() TO service_role;

CREATE FUNCTION public.marketplace_test_session_action (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid,
  p_action        text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.marketplace_test_session_action(uuid, uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_test_session_action(uuid, uuid, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_test_session_action(uuid, uuid, uuid, text) TO service_role;

CREATE FUNCTION public.marketplace_test_session_start (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.marketplace_test_session_start(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_test_session_start(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_test_session_start(uuid, uuid) TO service_role;

CREATE FUNCTION public.marketplace_test_session_status (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.marketplace_test_session_status(uuid, uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_test_session_status(uuid, uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_test_session_status(uuid, uuid, uuid) TO service_role;

CREATE TABLE public.marketplace_browser_test_sessions (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id      uuid                     NOT NULL,
  connection_id     uuid                     NOT NULL,
  started_by        uuid                     NOT NULL,
  state             text                     DEFAULT 'active'::text NOT NULL,
  interaction_count integer                  DEFAULT 0 NOT NULL,
  expires_at        timestamp with time zone NOT NULL,
  last_seen_at      timestamp with time zone,
  ended_at          timestamp with time zone,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.marketplace_browser_test_sessions IS 'Kurzlebige, künstliche Sitzungssperren für den kontogebundenen Browser-Test. Keine Anbieter- oder Plattformgeheimnisse.';

ALTER TABLE public.marketplace_browser_test_sessions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketplace_browser_test_sessions
  ADD CONSTRAINT marketplace_browser_test_sessio_workspace_id_connection_id_fkey FOREIGN KEY (workspace_id, connection_id)
    REFERENCES public.marketplace_connections(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE public.marketplace_browser_test_sessions
  ADD CONSTRAINT marketplace_browser_test_sessions_interaction_count_check CHECK (interaction_count >= 0);

ALTER TABLE public.marketplace_browser_test_sessions
  ADD CONSTRAINT marketplace_browser_test_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.marketplace_browser_test_sessions
  ADD CONSTRAINT marketplace_browser_test_sessions_state_check CHECK (state = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text, 'interrupted'::text]));

GRANT SELECT ON public.marketplace_browser_test_sessions TO authenticated;

GRANT ALL ON public.marketplace_browser_test_sessions TO service_role;

CREATE INDEX marketplace_browser_test_owner ON public.marketplace_browser_test_sessions (started_by, workspace_id, connection_id);

CREATE UNIQUE INDEX marketplace_browser_test_one_active ON public.marketplace_browser_test_sessions (workspace_id, connection_id)
  WHERE state = 'active'::text;

CREATE POLICY "Operators read their browser tests" ON public.marketplace_browser_test_sessions
  FOR SELECT
  TO authenticated
  USING (((started_by = ( SELECT auth.uid() AS uid)) AND public.marketplace_can_manage(workspace_id)));

CREATE TRIGGER marketplace_revoke_browser_tests_on_pause
  AFTER UPDATE OF status ON public.marketplace_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.marketplace_revoke_browser_tests_on_pause();

-- Explicit browser test permissions from declarative schema
revoke all on public.marketplace_browser_test_sessions from public, anon, authenticated;
grant select on public.marketplace_browser_test_sessions to authenticated;
grant all on public.marketplace_browser_test_sessions to service_role;
revoke all on function public.marketplace_test_session_start(uuid, uuid) from public, anon;
grant execute on function public.marketplace_test_session_start(uuid, uuid) to authenticated;
revoke all on function public.marketplace_test_session_status(uuid, uuid, uuid) from public, anon;
grant execute on function public.marketplace_test_session_status(uuid, uuid, uuid) to authenticated;
revoke all on function public.marketplace_test_session_action(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.marketplace_test_session_action(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.marketplace_revoke_browser_tests_on_pause() from public, anon, authenticated;

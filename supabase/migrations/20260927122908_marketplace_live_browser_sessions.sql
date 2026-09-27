-- Zweck: Dauerhafte, kontogebundene Browser-Sperren und serverseitige Profilzuordnung.
-- Betroffen: public.marketplace_browser_profiles, public.marketplace_browser_sessions und Sitzungsfunktionen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.marketplace_browser_session_check (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.marketplace_browser_session_check(uuid, uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_browser_session_check(uuid, uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_browser_session_check(uuid, uuid, uuid) TO service_role;

CREATE FUNCTION public.marketplace_browser_session_reserve (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
    values (p_workspace_id, p_connection_id, (select auth.uid()), v_profile_id, clock_timestamp() + interval '2 minutes')
    returning * into v_session;
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state, 'expiresAt', v_session.expires_at);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_browser_session_reserve(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_browser_session_reserve(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_browser_session_reserve(uuid, uuid) TO service_role;

CREATE FUNCTION public.marketplace_browser_session_revoke (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.marketplace_browser_session_revoke(uuid, uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_browser_session_revoke(uuid, uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_browser_session_revoke(uuid, uuid, uuid) TO service_role;

CREATE FUNCTION public.marketplace_prevent_unresolved_browser_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if exists (select 1 from public.marketplace_browser_sessions
    where workspace_id = old.workspace_id and connection_id = old.id and state in ('active', 'stopping')) then
    raise exception 'Browsersitzung muss zuerst beendet werden' using errcode = '23503';
  end if;
  return old;
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_prevent_unresolved_browser_delete() FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_prevent_unresolved_browser_delete() TO service_role;

CREATE FUNCTION public.marketplace_revoke_live_browsers_on_pause()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.status in ('paused', 'blocked') and old.status is distinct from new.status then
    update public.marketplace_browser_sessions set state = 'stopping', stop_reason = 'paused'
      where workspace_id = new.workspace_id and connection_id = new.id and state = 'active';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_revoke_live_browsers_on_pause() FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_revoke_live_browsers_on_pause() TO service_role;

CREATE TABLE public.marketplace_browser_profiles (
  id                  bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  workspace_id        uuid                     NOT NULL,
  connection_id       uuid                     NOT NULL,
  provider_profile_id text                     NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.marketplace_browser_profiles IS 'Serverseitige Zuordnung einer Flipbase-Verbindung zu einem Anbieterprofil; keine Token oder Cookies.';

ALTER TABLE public.marketplace_browser_profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketplace_browser_profiles
  ADD CONSTRAINT marketplace_browser_profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.marketplace_browser_profiles
  ADD CONSTRAINT marketplace_browser_profiles_provider_profile_id_check
    CHECK (char_length(provider_profile_id) >= 1 AND char_length(provider_profile_id) <= 128 AND provider_profile_id ~ '^[a-zA-Z0-9_-]+$'::text);

ALTER TABLE public.marketplace_browser_profiles
  ADD CONSTRAINT marketplace_browser_profiles_provider_profile_id_key UNIQUE (provider_profile_id);

ALTER TABLE public.marketplace_browser_profiles
  ADD CONSTRAINT marketplace_browser_profiles_workspace_id_connection_id_fkey FOREIGN KEY (workspace_id, connection_id) REFERENCES public.marketplace_connections(workspace_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.marketplace_browser_profiles
  ADD CONSTRAINT marketplace_browser_profiles_workspace_id_connection_id_key UNIQUE (workspace_id, connection_id);

GRANT ALL ON public.marketplace_browser_profiles TO service_role;

-- Der Schema-Diff erfasst bestehende Standardrechte neuer Tabellen/Sequenzen nicht.
REVOKE ALL ON public.marketplace_browser_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.marketplace_browser_profiles_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketplace_browser_profiles_id_seq TO service_role;

CREATE POLICY "Worker deletes browser profiles" ON public.marketplace_browser_profiles
  FOR DELETE
  TO service_role
  USING (true);

CREATE POLICY "Worker inserts browser profiles" ON public.marketplace_browser_profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Worker reads browser profiles" ON public.marketplace_browser_profiles
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Worker updates browser profiles" ON public.marketplace_browser_profiles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE public.marketplace_browser_sessions (
  id                  bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  public_id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id        uuid                     NOT NULL,
  connection_id       uuid                     NOT NULL,
  started_by          uuid                     NOT NULL,
  provider_profile_id text                     NOT NULL,
  state               text                     DEFAULT 'active'::text NOT NULL,
  stop_reason         text,
  expires_at          timestamp with time zone NOT NULL,
  provider_stopped_at timestamp with time zone,
  created_at          timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.marketplace_browser_sessions IS 'Dauerhafte Bedienungssperren; aktiv und wartend bleiben bis zum bestätigten Anbieter-Stopp exklusiv.';

ALTER TABLE public.marketplace_browser_sessions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketplace_browser_sessions
  ADD CONSTRAINT marketplace_browser_sessions_check CHECK ((state = 'closed'::text) = (provider_stopped_at IS NOT NULL));

ALTER TABLE public.marketplace_browser_sessions
  ADD CONSTRAINT marketplace_browser_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.marketplace_browser_sessions
  ADD CONSTRAINT marketplace_browser_sessions_public_id_key UNIQUE (public_id);

ALTER TABLE public.marketplace_browser_sessions
  ADD CONSTRAINT marketplace_browser_sessions_state_check CHECK (state = ANY (ARRAY['active'::text, 'stopping'::text, 'closed'::text]));

ALTER TABLE public.marketplace_browser_sessions
  ADD CONSTRAINT marketplace_browser_sessions_stop_reason_check CHECK (stop_reason = ANY (ARRAY['requested'::text, 'expired'::text, 'paused'::text, 'interrupted'::text]));

ALTER TABLE public.marketplace_browser_sessions
  ADD CONSTRAINT marketplace_browser_sessions_workspace_id_connection_id_fkey FOREIGN KEY (workspace_id, connection_id) REFERENCES public.marketplace_connections(workspace_id, id)
    ON DELETE CASCADE;

GRANT ALL ON public.marketplace_browser_sessions TO service_role;

REVOKE ALL ON public.marketplace_browser_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.marketplace_browser_sessions_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketplace_browser_sessions_id_seq TO service_role;

CREATE INDEX marketplace_browser_owner ON public.marketplace_browser_sessions (started_by, workspace_id, connection_id);

CREATE UNIQUE INDEX marketplace_browser_one_unresolved ON public.marketplace_browser_sessions (workspace_id, connection_id)
  WHERE state = ANY (ARRAY['active'::text, 'stopping'::text]);

CREATE INDEX marketplace_browser_unresolved ON public.marketplace_browser_sessions (state, expires_at, id)
  WHERE state = ANY (ARRAY['active'::text, 'stopping'::text]);

CREATE POLICY "Worker deletes browser sessions" ON public.marketplace_browser_sessions
  FOR DELETE
  TO service_role
  USING (true);

CREATE POLICY "Worker inserts browser sessions" ON public.marketplace_browser_sessions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Worker reads browser sessions" ON public.marketplace_browser_sessions
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Worker updates browser sessions" ON public.marketplace_browser_sessions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER marketplace_prevent_unresolved_browser_delete
  BEFORE DELETE ON public.marketplace_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.marketplace_prevent_unresolved_browser_delete();

CREATE TRIGGER marketplace_revoke_live_browsers_on_pause
  AFTER UPDATE OF status ON public.marketplace_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.marketplace_revoke_live_browsers_on_pause();

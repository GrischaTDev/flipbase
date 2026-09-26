-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.marketplace_can_manage (
  p_workspace_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null
    and public.is_workspace_admin(p_workspace_id)
    and exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.archived_at is null);
$function$;

REVOKE ALL ON FUNCTION public.marketplace_can_manage(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_can_manage(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_can_manage(uuid) TO service_role;

CREATE FUNCTION public.marketplace_create_connection (
  p_workspace_id uuid,
  p_display_name text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_id uuid; v_result jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[[:cntrl:]]' then raise exception 'Ungültiger Kontoname' using errcode = '22023'; end if;
  insert into public.marketplace_connections(workspace_id, display_name) values(p_workspace_id, btrim(p_display_name)) returning id into v_id;
  select value into v_result from jsonb_array_elements(public.marketplace_list_connections(p_workspace_id)->'connections') where value->>'connectionId' = v_id::text;
  return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_create_connection(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_create_connection(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_create_connection(uuid, text) TO service_role;

CREATE FUNCTION public.marketplace_list_connections (
  p_workspace_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  return jsonb_build_object('canManage', true, 'connections', coalesce((
    select jsonb_agg(jsonb_build_object(
      'workspaceId', c.workspace_id, 'connectionId', c.id, 'marketplace', c.marketplace,
      'displayName', c.display_name, 'externalAccountId', c.external_account_id,
      'status', c.status, 'capabilities', c.capabilities,
      'allowedActions', jsonb_build_array('profile.read', 'listings.read', 'metrics.read', 'conversations.read', 'messages.sendText', 'listings.update', 'listings.publish', 'sales.read'),
      'lastSyncedAt', c.last_synced_at
    ) order by c.created_at, c.id) from public.marketplace_connections c
    where c.workspace_id = p_workspace_id and c.marketplace = 'vinted'
  ), '[]'::jsonb));
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_list_connections(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_list_connections(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_list_connections(uuid) TO service_role;

CREATE FUNCTION public.marketplace_read_page (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_kind          text,
  p_cursor        text DEFAULT NULL::text,
  p_parent_id     uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare v_cursor public.marketplace_account_entries; v_items jsonb; v_total bigint; v_next text;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists (select 1 from public.marketplace_connections c where c.workspace_id = p_workspace_id and c.id = p_connection_id and c.marketplace = 'vinted') then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('publication', 'conversation', 'message', 'sale', 'activity') or ((p_kind = 'message') <> (p_parent_id is not null)) then raise exception 'Ungültige Seitenart' using errcode = '22023'; end if;
  if p_kind = 'message' and not exists (select 1 from public.marketplace_account_entries e where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.id = p_parent_id and e.kind = 'conversation') then raise exception 'Gespräch nicht verfügbar' using errcode = '42501'; end if;
  if p_cursor is not null then
    select * into v_cursor from public.marketplace_account_entries e where e.id::text = p_cursor and e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id;
    if not found then raise exception 'Ungültiger Seitencursor' using errcode = '22023'; end if;
  end if;
  select count(*) into v_total from public.marketplace_account_entries e where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id;
  with candidates as (
    select e.*, row_number() over (order by e.sort_at desc, e.id desc) as position
    from public.marketplace_account_entries e
    where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id
      and (p_cursor is null or (e.sort_at, e.id) < (v_cursor.sort_at, v_cursor.id))
    order by e.sort_at desc, e.id desc limit 51
  )
  select coalesce(jsonb_agg((e.body || jsonb_build_object('id', e.id, 'workspaceId', e.workspace_id, 'connectionId', e.connection_id)
    || case when p_kind = 'message' then jsonb_build_object('conversationId', e.parent_id) else '{}'::jsonb end) order by e.position) filter (where e.position <= 50), '[]'::jsonb),
    case when count(*) > 50 then max(e.id::text) filter (where e.position = 50) else null end
    into v_items, v_next from candidates e;
  return jsonb_build_object('items', v_items, 'total', v_total, 'nextCursor', v_next);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_read_page(uuid, uuid, text, text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_read_page(uuid, uuid, text, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_read_page(uuid, uuid, text, text, uuid) TO service_role;

CREATE FUNCTION public.marketplace_read_snapshot (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare v_profile jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from public.marketplace_connections c where c.workspace_id = p_workspace_id and c.id = p_connection_id and c.marketplace = 'vinted') then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select e.body || jsonb_build_object('workspaceId', e.workspace_id, 'connectionId', e.connection_id) into v_profile from public.marketplace_account_entries e where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = 'profile';
  return jsonb_build_object('workspaceId', p_workspace_id, 'connectionId', p_connection_id, 'profile', v_profile,
    'publications', public.marketplace_read_page(p_workspace_id, p_connection_id, 'publication'),
    'conversations', public.marketplace_read_page(p_workspace_id, p_connection_id, 'conversation'),
    'sales', public.marketplace_read_page(p_workspace_id, p_connection_id, 'sale'),
    'activity', public.marketplace_read_page(p_workspace_id, p_connection_id, 'activity'));
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_read_snapshot(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_read_snapshot(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_read_snapshot(uuid, uuid) TO service_role;

CREATE FUNCTION public.marketplace_rename_connection (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_display_name  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[[:cntrl:]]' then raise exception 'Ungültiger Kontoname' using errcode = '22023'; end if;
  update public.marketplace_connections set display_name = btrim(p_display_name), updated_at = now() where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted';
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_rename_connection(uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_rename_connection(uuid, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_rename_connection(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.marketplace_set_paused (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_paused        boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_connection public.marketplace_connections;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_paused is null then raise exception 'Pausenstatus fehlt' using errcode = '22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_connection.status = 'blocked' then raise exception 'Gesperrte Verbindung' using errcode = '22023'; end if;
  if p_paused and v_connection.status <> 'paused' then
    update public.marketplace_connections set resume_status = status, status = 'paused', updated_at = now() where id = p_connection_id;
  elsif not p_paused and v_connection.status = 'paused' then
    update public.marketplace_connections set status = coalesce(resume_status, 'needs_login'), resume_status = null, updated_at = now() where id = p_connection_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_set_paused(uuid, uuid, boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_set_paused(uuid, uuid, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_set_paused(uuid, uuid, boolean) TO service_role;

CREATE TABLE public.marketplace_account_entries (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id  uuid                     NOT NULL,
  connection_id uuid                     NOT NULL,
  kind          text                     NOT NULL,
  external_id   text                     NOT NULL,
  parent_id     uuid,
  body          jsonb                    NOT NULL,
  sort_at       timestamp with time zone DEFAULT now() NOT NULL,
  observed_at   timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.marketplace_account_entries IS 'Kontogebundene Lesekopie von Marktplatzdaten. Keine zusätzlichen Lagerartikel und keine bestätigten Flipbase-Verkäufe.';

ALTER TABLE public.marketplace_account_entries
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketplace_account_entries
  ADD CONSTRAINT marketplace_account_entries_body_check CHECK (jsonb_typeof(body) = 'object'::text);

ALTER TABLE public.marketplace_account_entries
  ADD CONSTRAINT marketplace_account_entries_check CHECK ((kind = 'message'::text) = (parent_id IS NOT NULL));

ALTER TABLE public.marketplace_account_entries
  ADD CONSTRAINT marketplace_account_entries_external_id_check CHECK (char_length(external_id) >= 1 AND char_length(external_id) <= 256);

ALTER TABLE public.marketplace_account_entries
  ADD CONSTRAINT marketplace_account_entries_kind_check
    CHECK (kind = ANY (ARRAY['profile'::text, 'publication'::text, 'conversation'::text, 'message'::text, 'sale'::text, 'activity'::text]));

ALTER TABLE public.marketplace_account_entries
  ADD CONSTRAINT marketplace_account_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.marketplace_account_entries
  ADD CONSTRAINT marketplace_account_entries_workspace_id_connection_id_id_key UNIQUE (workspace_id, connection_id, id);

ALTER TABLE public.marketplace_account_entries
  ADD CONSTRAINT marketplace_account_entries_workspace_id_connection_id_kind_key UNIQUE (workspace_id, connection_id, kind, external_id);

ALTER TABLE public.marketplace_account_entries
  ADD CONSTRAINT marketplace_account_entries_workspace_id_connection_id_par_fkey FOREIGN KEY (workspace_id, connection_id, parent_id)
    REFERENCES public.marketplace_account_entries(workspace_id, connection_id, id) ON DELETE CASCADE;

GRANT SELECT ON public.marketplace_account_entries TO authenticated;

GRANT ALL ON public.marketplace_account_entries TO service_role;

CREATE UNIQUE INDEX marketplace_account_profile ON public.marketplace_account_entries (workspace_id, connection_id)
  WHERE kind = 'profile'::text;

CREATE INDEX marketplace_account_entries_page ON public.marketplace_account_entries (workspace_id, connection_id, kind, parent_id, sort_at DESC, id DESC);

CREATE POLICY "Administrators read their account entries" ON public.marketplace_account_entries
  FOR SELECT
  TO authenticated
  USING (public.marketplace_can_manage(workspace_id));

CREATE TABLE public.marketplace_connections (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id        uuid                     NOT NULL,
  marketplace         text                     DEFAULT 'vinted'::text NOT NULL,
  display_name        text                     NOT NULL,
  external_account_id text,
  status              text                     DEFAULT 'needs_login'::text NOT NULL,
  resume_status       text,
  capabilities        jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  last_synced_at      timestamp with time zone,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.marketplace_connections IS 'Öffentliche Kontometadaten. Keine Passwörter, Cookies, Proxy- oder Browserzugänge.';

ALTER TABLE public.marketplace_connections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketplace_connections
  ADD CONSTRAINT marketplace_connections_capabilities_check CHECK (jsonb_typeof(capabilities) = 'object'::text);

ALTER TABLE public.marketplace_connections
  ADD CONSTRAINT marketplace_connections_display_name_check
    CHECK (char_length(btrim(display_name)) >= 1 AND char_length(btrim(display_name)) <= 120 AND display_name !~ '[[:cntrl:]]'::text);

ALTER TABLE public.marketplace_connections
  ADD CONSTRAINT marketplace_connections_marketplace_check CHECK (marketplace = ANY (ARRAY['vinted'::text, 'kleinanzeigen'::text, 'ebay'::text]));

ALTER TABLE public.marketplace_connections
  ADD CONSTRAINT marketplace_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.marketplace_connections
  ADD CONSTRAINT marketplace_connections_resume_status_check CHECK (resume_status = ANY (ARRAY['disconnected'::text, 'needs_login'::text, 'connected'::text, 'blocked'::text]));

ALTER TABLE public.marketplace_connections
  ADD CONSTRAINT marketplace_connections_status_check CHECK (status = ANY (ARRAY['disconnected'::text, 'needs_login'::text, 'connected'::text, 'paused'::text, 'blocked'::text]));

ALTER TABLE public.marketplace_connections
  ADD CONSTRAINT marketplace_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.marketplace_connections
  ADD CONSTRAINT marketplace_connections_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE public.marketplace_account_entries
  ADD CONSTRAINT marketplace_account_entries_workspace_id_connection_id_fkey FOREIGN KEY (workspace_id, connection_id) REFERENCES public.marketplace_connections(workspace_id, id)
    ON DELETE CASCADE;

GRANT SELECT ON public.marketplace_connections TO authenticated;

GRANT ALL ON public.marketplace_connections TO service_role;

CREATE UNIQUE INDEX marketplace_connections_external_account ON public.marketplace_connections (marketplace, external_account_id)
  WHERE external_account_id IS NOT NULL;

CREATE INDEX marketplace_connections_workspace ON public.marketplace_connections (workspace_id, created_at, id);

CREATE POLICY "Administrators read their marketplace accounts" ON public.marketplace_connections
  FOR SELECT
  TO authenticated
  USING (public.marketplace_can_manage(workspace_id));

-- Explicit marketplace permissions from declarative schema
revoke all on public.marketplace_connections from public, anon, authenticated;
grant select on public.marketplace_connections to authenticated;
grant all on public.marketplace_connections to service_role;
revoke all on public.marketplace_account_entries from public, anon, authenticated;
grant select on public.marketplace_account_entries to authenticated;
grant all on public.marketplace_account_entries to service_role;
revoke all on function public.marketplace_can_manage(uuid) from public, anon;
grant execute on function public.marketplace_can_manage(uuid) to authenticated;
revoke all on function public.marketplace_list_connections(uuid) from public, anon;
grant execute on function public.marketplace_list_connections(uuid) to authenticated;
revoke all on function public.marketplace_create_connection(uuid, text) from public, anon;
grant execute on function public.marketplace_create_connection(uuid, text) to authenticated;
revoke all on function public.marketplace_rename_connection(uuid, uuid, text) from public, anon;
grant execute on function public.marketplace_rename_connection(uuid, uuid, text) to authenticated;
revoke all on function public.marketplace_set_paused(uuid, uuid, boolean) from public, anon;
grant execute on function public.marketplace_set_paused(uuid, uuid, boolean) to authenticated;
revoke all on function public.marketplace_read_page(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.marketplace_read_page(uuid, uuid, text, text, uuid) to authenticated;
revoke all on function public.marketplace_read_snapshot(uuid, uuid) from public, anon;
grant execute on function public.marketplace_read_snapshot(uuid, uuid) to authenticated;

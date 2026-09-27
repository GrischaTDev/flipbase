-- Marktplatzkonten sind Verbindungen innerhalb eines Workspaces, keine neuen Vinted-Konten.
-- Der erste Pilot ist ausdrücklich auf Inhaber/Admins begrenzt. Private Nachrichten
-- werden nicht automatisch für jedes bestehende Workspace-Mitglied freigegeben.
create table public.marketplace_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  marketplace text not null default 'vinted' check (marketplace in ('vinted', 'kleinanzeigen', 'ebay')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120 and display_name !~ '[[:cntrl:]]'),
  external_account_id text,
  status text not null default 'needs_login' check (status in ('disconnected', 'needs_login', 'connected', 'paused', 'blocked')),
  resume_status text check (resume_status in ('disconnected', 'needs_login', 'connected', 'blocked')),
  capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
comment on table public.marketplace_connections is 'Öffentliche Kontometadaten. Keine Passwörter, Cookies, Proxy- oder Browserzugänge.';
create unique index marketplace_connections_external_account on public.marketplace_connections (marketplace, external_account_id) where external_account_id is not null;
create index marketplace_connections_workspace on public.marketplace_connections (workspace_id, created_at, id);
alter table public.marketplace_connections enable row level security;
revoke all on public.marketplace_connections from public, anon, authenticated;
grant select on public.marketplace_connections to authenticated;
grant all on public.marketplace_connections to service_role;

create table public.marketplace_account_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  connection_id uuid not null,
  kind text not null check (kind in ('profile', 'publication', 'conversation', 'message', 'sale', 'activity')),
  external_id text not null check (char_length(external_id) between 1 and 256),
  parent_id uuid,
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  sort_at timestamptz not null default now(),
  observed_at timestamptz not null default now(),
  unique (workspace_id, connection_id, id),
  unique (workspace_id, connection_id, kind, external_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade,
  foreign key (workspace_id, connection_id, parent_id) references public.marketplace_account_entries(workspace_id, connection_id, id) on delete cascade,
  check ((kind = 'message') = (parent_id is not null))
);
comment on table public.marketplace_account_entries is 'Kontogebundene Lesekopie von Marktplatzdaten. Keine zusätzlichen Lagerartikel und keine bestätigten Flipbase-Verkäufe.';
create index marketplace_account_entries_page on public.marketplace_account_entries (workspace_id, connection_id, kind, parent_id, sort_at desc, id desc);
create unique index marketplace_account_profile on public.marketplace_account_entries (workspace_id, connection_id) where kind = 'profile';
alter table public.marketplace_account_entries enable row level security;
revoke all on public.marketplace_account_entries from public, anon, authenticated;
grant select on public.marketplace_account_entries to authenticated;
grant all on public.marketplace_account_entries to service_role;

create or replace function public.marketplace_can_manage(p_workspace_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null
    and public.is_workspace_admin(p_workspace_id)
    and exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.archived_at is null);
$$;
revoke all on function public.marketplace_can_manage(uuid) from public, anon;
grant execute on function public.marketplace_can_manage(uuid) to authenticated;

create policy "Administrators read their marketplace accounts" on public.marketplace_connections
for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Administrators read their account entries" on public.marketplace_account_entries
for select to authenticated using (public.marketplace_can_manage(workspace_id));

-- Diese RPCs besitzen keine Browserbefugnisse. SECURITY DEFINER ist nur für
-- kontrollierte Metadatenänderungen nötig; jede Funktion prüft die echte auth.uid().
create or replace function public.marketplace_list_connections(p_workspace_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
$$;
revoke all on function public.marketplace_list_connections(uuid) from public, anon;
grant execute on function public.marketplace_list_connections(uuid) to authenticated;

create or replace function public.marketplace_create_connection(p_workspace_id uuid, p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_result jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[[:cntrl:]]' then raise exception 'Ungültiger Kontoname' using errcode = '22023'; end if;
  insert into public.marketplace_connections(workspace_id, display_name) values(p_workspace_id, btrim(p_display_name)) returning id into v_id;
  select value into v_result from jsonb_array_elements(public.marketplace_list_connections(p_workspace_id)->'connections') where value->>'connectionId' = v_id::text;
  return v_result;
end;
$$;
revoke all on function public.marketplace_create_connection(uuid, text) from public, anon;
grant execute on function public.marketplace_create_connection(uuid, text) to authenticated;

create or replace function public.marketplace_rename_connection(p_workspace_id uuid, p_connection_id uuid, p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[[:cntrl:]]' then raise exception 'Ungültiger Kontoname' using errcode = '22023'; end if;
  update public.marketplace_connections set display_name = btrim(p_display_name), updated_at = now() where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted';
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.marketplace_rename_connection(uuid, uuid, text) from public, anon;
grant execute on function public.marketplace_rename_connection(uuid, uuid, text) to authenticated;

create or replace function public.marketplace_set_paused(p_workspace_id uuid, p_connection_id uuid, p_paused boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
$$;
revoke all on function public.marketplace_set_paused(uuid, uuid, boolean) from public, anon;
grant execute on function public.marketplace_set_paused(uuid, uuid, boolean) to authenticated;

create or replace function public.marketplace_read_page(p_workspace_id uuid, p_connection_id uuid, p_kind text, p_cursor text default null, p_parent_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
$$;
revoke all on function public.marketplace_read_page(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.marketplace_read_page(uuid, uuid, text, text, uuid) to authenticated;

create or replace function public.marketplace_read_snapshot(p_workspace_id uuid, p_connection_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
$$;
revoke all on function public.marketplace_read_snapshot(uuid, uuid) from public, anon;
grant execute on function public.marketplace_read_snapshot(uuid, uuid) to authenticated;

-- Arbeitskopien für Vinted: unvollständige Inhalte, getrennte Konten und sichere Revisionen.
create or replace function public.marketplace_listing_content_valid(p_content jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  v_key text;
  v_value jsonb;
  v_entry jsonb;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 200000 then return false; end if;
  for v_key, v_value in select key, value from jsonb_each(p_content) loop
    if v_key in ('title', 'description', 'categoryLabel', 'brandLabel', 'sizeLabel', 'conditionLabel') then
      if jsonb_typeof(v_value) <> 'string' or length(v_value #>> '{}') > 20000 or regexp_replace(v_value #>> '{}', E'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]' then return false; end if;
    elsif v_key = 'currency' then
      if v_value <> '"EUR"'::jsonb then return false; end if;
    elsif v_key in ('priceCents', 'categoryId', 'brandId', 'sizeId', 'conditionId', 'packageSizeId') then
      if v_value <> 'null'::jsonb then
        if jsonb_typeof(v_value) <> 'number' then return false; end if;
        if (v_value::text)::numeric <> trunc((v_value::text)::numeric) or (v_value::text)::numeric > 9007199254740991
          or (v_value::text)::numeric < (case when v_key = 'priceCents' then 0 else 1 end) then return false; end if;
      end if;
    elsif v_key in ('colorIds', 'materialIds', 'colorLabels', 'materialLabels') then
      if jsonb_typeof(v_value) <> 'array' or jsonb_array_length(v_value) > 100 then return false; end if;
      for v_entry in select value from jsonb_array_elements(v_value) loop
        if v_key in ('colorIds', 'materialIds') then
          if jsonb_typeof(v_entry) <> 'number' then return false; end if;
          if (v_entry::text)::numeric <> trunc((v_entry::text)::numeric) or (v_entry::text)::numeric not between 1 and 9007199254740991 then return false; end if;
        elsif jsonb_typeof(v_entry) <> 'string' or length(v_entry #>> '{}') > 20000 or regexp_replace(v_entry #>> '{}', E'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]' then return false;
        end if;
      end loop;
      if v_key in ('colorIds', 'materialIds') and (select count(distinct value) from jsonb_array_elements(v_value)) <> jsonb_array_length(v_value) then return false; end if;
    elsif v_key = 'attributes' then
      if jsonb_typeof(v_value) <> 'object' then return false; end if;
      if (select count(*) from jsonb_each(v_value)) > 100 or exists (
        select 1 from jsonb_each(v_value) where key !~ '^[a-zA-Z][a-zA-Z0-9_]{0,99}$'
          or key in ('constructor', 'prototype', '__proto__') or jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 20000 or regexp_replace(value #>> '{}', E'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]'
      ) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.marketplace_listing_content_valid(jsonb) from public, anon;
grant execute on function public.marketplace_listing_content_valid(jsonb) to authenticated, service_role;

create table public.marketplace_listing_drafts (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid,
  content jsonb not null default '{}'::jsonb check (public.marketplace_listing_content_valid(content)),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inventory_item_id uuid,
  image_ids bigint[] not null default '{}'::bigint[] check (cardinality(image_ids) <= 100),
  request_id uuid not null default gen_random_uuid(),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete set null (connection_id),
  foreign key (workspace_id, inventory_item_id) references public.inventory_items(workspace_id, id) on delete set null (inventory_item_id),
  unique (workspace_id, id),
  unique (workspace_id, created_by, request_id)
);
comment on table public.marketplace_listing_drafts is 'Unvollständige Vinted-Arbeitskopien; jede Inhalts- und Bildänderung benötigt die aktuelle Revision.';
create index marketplace_listing_drafts_workspace on public.marketplace_listing_drafts(workspace_id, updated_at desc, id desc);
create index marketplace_listing_drafts_connection on public.marketplace_listing_drafts(connection_id);
create index marketplace_listing_drafts_creator on public.marketplace_listing_drafts(created_by);
create index marketplace_listing_drafts_inventory on public.marketplace_listing_drafts(inventory_item_id);
alter table public.marketplace_listing_drafts enable row level security;
create policy "Eigene Inseratentwürfe lesen" on public.marketplace_listing_drafts
for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Entwürfe nur per RPC anlegen" on public.marketplace_listing_drafts for insert to authenticated with check (false);
create policy "Entwürfe nur per RPC ändern" on public.marketplace_listing_drafts for update to authenticated using (false) with check (false);
create policy "Entwürfe nur per RPC löschen" on public.marketplace_listing_drafts for delete to authenticated using (false);
-- Schreibrechte ausschließlich für RPCs: direkte Updates könnten den Revisionsvergleich umgehen.
revoke all on public.marketplace_listing_drafts from public, anon, authenticated;
grant select on public.marketplace_listing_drafts to authenticated;
grant all on public.marketplace_listing_drafts to service_role;
grant usage, select on sequence public.marketplace_listing_drafts_id_seq to service_role;

create or replace function public.marketplace_listing_draft_document(p_draft public.marketplace_listing_drafts)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id', p_draft.id::text, 'workspaceId', p_draft.workspace_id,
    'connectionId', p_draft.connection_id, 'content', p_draft.content, 'revision', p_draft.revision,
    'inventoryItemId', p_draft.inventory_item_id, 'createdAt', p_draft.created_at, 'updatedAt', p_draft.updated_at);
$$;
revoke all on function public.marketplace_listing_draft_document(public.marketplace_listing_drafts) from public, anon, authenticated;

-- SECURITY DEFINER ist nötig, um direkte Schreibrechte ohne Revisionskontrolle zu sperren.
-- Diese private Prüfung sperrt den Workspace gegen gleichzeitige Archivierung.
create or replace function public.marketplace_lock_listing_workspace(p_workspace_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id = p_workspace_id for share;
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.marketplace_lock_listing_workspace(uuid) from public, anon, authenticated, service_role;

create or replace function public.marketplace_create_listing_draft(p_workspace_id uuid, p_connection_id uuid, p_content jsonb, p_inventory_item_id uuid default null, p_request_id uuid default gen_random_uuid())
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_draft public.marketplace_listing_drafts;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if not public.marketplace_listing_content_valid(p_content) then raise exception 'Ungültige Inseratangaben.' using errcode = '22023'; end if;
  if p_request_id is null then raise exception 'Die Anfragekennung fehlt.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||(select auth.uid())::text||':'||p_request_id::text,460));
  select * into v_draft from public.marketplace_listing_drafts where workspace_id=p_workspace_id and created_by=(select auth.uid()) and request_id=p_request_id;
  if found then return public.marketplace_listing_draft_document(v_draft); end if;
  if p_connection_id is not null and not exists (select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
  if p_inventory_item_id is not null and not exists (select 1 from public.inventory_items where workspace_id=p_workspace_id and id=p_inventory_item_id and archived_at is null) then raise exception 'Kein Zugriff auf diesen Artikel.' using errcode='42501'; end if;
  insert into public.marketplace_listing_drafts(workspace_id, connection_id, content, created_by, inventory_item_id, request_id)
  values(p_workspace_id, p_connection_id, p_content, (select auth.uid()), p_inventory_item_id,p_request_id) returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$$;

create or replace function public.marketplace_read_listing_draft(p_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_draft public.marketplace_listing_drafts;
begin
  select * into v_draft from public.marketplace_listing_drafts where id=p_id::bigint;
  if not found or not public.marketplace_can_manage(v_draft.workspace_id) then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  return public.marketplace_listing_draft_document(v_draft);
end;
$$;

create or replace function public.marketplace_list_listing_drafts(p_workspace_id uuid,p_query text default '',p_cursor jsonb default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb; v_last jsonb; v_cursor_id bigint; v_cursor_at timestamptz; v_more boolean;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode='42501'; end if;
  if p_query is null or length(p_query)>160 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Ungültige Entwurfssuche.' using errcode='22023'; end if;
  if p_cursor is not null and p_cursor<>'null'::jsonb then
    if jsonb_typeof(p_cursor)<>'object' or coalesce(p_cursor->>'id','') !~ '^[1-9][0-9]{0,18}$' or coalesce(p_cursor->>'updatedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    v_cursor_id:=(p_cursor->>'id')::bigint;v_cursor_at:=(p_cursor->>'updatedAt')::timestamptz;
  end if;
  select coalesce(jsonb_agg(public.marketplace_listing_draft_document(d) order by d.updated_at desc,d.id desc),'[]'::jsonb) into v_rows from (
    select * from public.marketplace_listing_drafts where workspace_id=p_workspace_id
      and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(content->>'title'))>0)
      and (v_cursor_id is null or (updated_at,id)<(v_cursor_at,v_cursor_id))
    order by updated_at desc,id desc limit p_limit+1
  ) d;
  v_more:=jsonb_array_length(v_rows)>p_limit;
  if v_more then
    v_last:=v_rows->(p_limit-1);
    select jsonb_agg(value order by position) into v_rows from jsonb_array_elements(v_rows) with ordinality page(value,position) where position<=p_limit;
  end if;
  return jsonb_build_object('items',v_rows,'nextCursor',case when v_more then jsonb_build_object('id',v_last->>'id','updatedAt',v_last->>'updatedAt') else null end);
end;
$$;

create or replace function public.marketplace_save_listing_draft(p_id text, p_expected_revision bigint, p_content jsonb, p_connection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_draft public.marketplace_listing_drafts;
begin
  select * into v_draft from public.marketplace_listing_drafts where id=p_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  select * into v_draft from public.marketplace_listing_drafts where id=p_id::bigint for update;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  if p_expected_revision is null or v_draft.revision <> p_expected_revision then raise exception 'Der Entwurf wurde auf einem anderen Gerät geändert. Lade den aktuellen Stand.' using errcode='40001'; end if;
  if not public.marketplace_listing_content_valid(p_content) then raise exception 'Ungültige Inseratangaben.' using errcode='22023'; end if;
  if p_connection_id is not null and not exists (select 1 from public.marketplace_connections where workspace_id=v_draft.workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
  update public.marketplace_listing_drafts set content=p_content, connection_id=p_connection_id, revision=revision+1, updated_at=now() where id=p_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$$;

revoke all on function public.marketplace_create_listing_draft(uuid, uuid, jsonb, uuid, uuid), public.marketplace_read_listing_draft(text), public.marketplace_list_listing_drafts(uuid,text,jsonb,integer), public.marketplace_save_listing_draft(text, bigint, jsonb, uuid) from public, anon;
grant execute on function public.marketplace_create_listing_draft(uuid, uuid, jsonb, uuid, uuid), public.marketplace_read_listing_draft(text), public.marketplace_list_listing_drafts(uuid,text,jsonb,integer), public.marketplace_save_listing_draft(text, bigint, jsonb, uuid) to authenticated;

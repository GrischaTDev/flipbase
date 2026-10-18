-- Namen und Reihenfolge der Verkaufsplattformen je Workspace; keine Änderung bestehender Verkäufe.
create function public.sale_platform_list_valid(p_platforms jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare v_entry jsonb; v_keys text[] := '{}'; v_names text[] := '{}'; v_key text; v_name text;
begin
  if p_platforms is null or jsonb_typeof(p_platforms) <> 'array' then return false; end if;
  if jsonb_array_length(p_platforms) < 1 or jsonb_array_length(p_platforms) > 200 then return false; end if;
  for v_entry in select value from jsonb_array_elements(p_platforms) loop
    if jsonb_typeof(v_entry) <> 'object' or jsonb_typeof(v_entry->'value') <> 'string'
      or jsonb_typeof(v_entry->'label') <> 'string' then return false; end if;
    v_key := v_entry->>'value'; v_name := lower(btrim(normalize(v_entry->>'label', nfkc)));
    if v_key is null or v_name is null or length(btrim(v_key)) < 1 or length(v_key) > 120
      or length(v_name) < 1 or length(v_entry->>'label') > 120
      or v_key in ('all','returned','__other__') or v_key = any(v_keys) or v_name = any(v_names)
      then return false; end if;
    v_keys := array_append(v_keys, v_key); v_names := array_append(v_names, v_name);
  end loop;
  return true;
end;
$$;

create table public.sale_platform_settings (
  id bigint generated always as identity primary key,
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  platforms jsonb not null check (public.sale_platform_list_valid(platforms)),
  version integer not null default 1 check (version > 0)
);
comment on table public.sale_platform_settings is 'Gemeinsame Verkaufsplattformnamen und Auswahlreihenfolge eines Workspace; Kennungen bestehender Verkäufe bleiben unverändert.';
alter table public.sale_platform_settings enable row level security;
revoke all on public.sale_platform_settings from public, anon, authenticated;
grant select, insert on public.sale_platform_settings to authenticated;
grant update(platforms, version) on public.sale_platform_settings to authenticated;
grant usage, select on sequence public.sale_platform_settings_id_seq to authenticated;
grant all on public.sale_platform_settings to service_role;
grant usage, select on sequence public.sale_platform_settings_id_seq to service_role;

create policy "Verkaufsplattformen lesen" on public.sale_platform_settings for select to authenticated
using ((select public.can_access_workspace(workspace_id)) and exists (select 1 from public.workspaces w where w.id = sale_platform_settings.workspace_id and w.archived_at is null));
create policy "Verkaufsplattformen anlegen" on public.sale_platform_settings for insert to authenticated
with check ((select public.can_access_workspace(workspace_id)) and exists (select 1 from public.workspaces w where w.id = sale_platform_settings.workspace_id and w.archived_at is null) and exists (
  select 1 from public.workspace_members m where m.workspace_id = sale_platform_settings.workspace_id
  and m.user_id = (select auth.uid()) and m.role in ('owner','admin','member')
));
create policy "Verkaufsplattformen ändern" on public.sale_platform_settings for update to authenticated
using ((select public.can_access_workspace(workspace_id)) and exists (select 1 from public.workspaces w where w.id = sale_platform_settings.workspace_id and w.archived_at is null) and exists (
  select 1 from public.workspace_members m where m.workspace_id = sale_platform_settings.workspace_id
  and m.user_id = (select auth.uid()) and m.role in ('owner','admin','member')
)) with check ((select public.can_access_workspace(workspace_id)) and exists (select 1 from public.workspaces w where w.id = sale_platform_settings.workspace_id and w.archived_at is null) and exists (
  select 1 from public.workspace_members m where m.workspace_id = sale_platform_settings.workspace_id
  and m.user_id = (select auth.uid()) and m.role in ('owner','admin','member')
));
create policy "Verkaufsplattformen behalten" on public.sale_platform_settings for delete to authenticated using (false);
create policy "Keine anonymen Plattformleser" on public.sale_platform_settings for select to anon using (false);
create policy "Keine anonymen Plattformanlagen" on public.sale_platform_settings for insert to anon with check (false);
create policy "Keine anonymen Plattformänderungen" on public.sale_platform_settings for update to anon using (false) with check (false);
create policy "Keine anonymen Plattformlöschungen" on public.sale_platform_settings for delete to anon using (false);
create trigger "00_protect_archived_workspace" before insert or update or delete on public.sale_platform_settings
for each row execute function public.protect_archived_workspace_data();

create function public.save_sale_platforms(p_workspace_id uuid, p_platforms jsonb, p_expected_version integer)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_row public.sale_platform_settings;
begin
  if (select auth.uid()) is null or not public.can_access_workspace(p_workspace_id)
    or not exists (select 1 from public.workspaces w where w.id=p_workspace_id and w.archived_at is null)
    or not exists (select 1 from public.workspace_members m where m.workspace_id=p_workspace_id
      and m.user_id=(select auth.uid()) and m.role in ('owner','admin','member'))
    then raise exception 'Keine Berechtigung zum Ändern der Verkaufsplattformen.' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version < 0 or not public.sale_platform_list_valid(p_platforms)
    then raise exception 'Ungültige Verkaufsplattformliste.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 485));
  select * into v_row from public.sale_platform_settings where workspace_id=p_workspace_id for update;
  if coalesce(v_row.version,0) <> p_expected_version
    then raise exception 'Die Plattformliste wurde inzwischen geändert. Bitte neu laden.' using errcode='40001'; end if;
  if v_row.id is null then
    insert into public.sale_platform_settings(workspace_id,platforms) values(p_workspace_id,p_platforms) returning * into v_row;
  else
    -- Kennungen dürfen beim Umbenennen/Sortieren nicht verschwinden: alte Verkäufe behalten ihren Bezug.
    if exists (select 1 from jsonb_array_elements(v_row.platforms) old_entry
      where not exists (select 1 from jsonb_array_elements(p_platforms) new_entry where new_entry->>'value'=old_entry->>'value'))
      then raise exception 'Vorhandene Verkaufsplattformen müssen erhalten bleiben.' using errcode='22023'; end if;
    update public.sale_platform_settings set platforms=p_platforms,version=version+1 where id=v_row.id returning * into v_row;
  end if;
  return jsonb_build_object('platforms',v_row.platforms,'version',v_row.version);
end;
$$;
revoke all on function public.save_sale_platforms(uuid,jsonb,integer) from public,anon;
grant execute on function public.save_sale_platforms(uuid,jsonb,integer) to authenticated;

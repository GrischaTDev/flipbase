-- Zweck: Speichert den Abschluss der verpflichtenden Workspace-Ersteinrichtung.
-- Betroffen: public.workspaces.setup_completed_at und public.create_workspace(text).

alter table public.workspaces
  add column setup_completed_at timestamptz;

-- Bereits vorhandene Workspaces duerfen nicht nachtraeglich in die neue
-- Ersteinrichtung gezwungen werden. Neu registrierte Workspaces bleiben
-- anschliessend ohne Zeitstempel und werden dadurch zur Einrichtung geleitet.
update public.workspaces
set setup_completed_at = now()
where setup_completed_at is null;

create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_ws_id uuid;
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Nicht angemeldet';
  end if;

  insert into public.workspaces (name, setup_completed_at)
  values (coalesce(nullif(trim(p_name), ''), 'Mein Workspace'), now())
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, caller_id, 'owner');

  return new_ws_id;
end;
$$;

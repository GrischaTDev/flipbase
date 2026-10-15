-- Persönliche Marktplatzsichtbarkeit pro Nutzer und aktivem Workspace.
-- Betroffen: neue Tabelle marketplace_user_settings und die Speicher-RPC.
create table public.marketplace_user_settings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  vinted boolean not null default true,
  ebay boolean not null default true,
  kleinanzeigen boolean not null default true,
  unique (user_id, workspace_id)
);
comment on table public.marketplace_user_settings is 'Persönliche Sichtbarkeit von Marktplätzen; keine Änderung von Kontofreigaben oder Aufträgen.';
create index marketplace_user_settings_workspace on public.marketplace_user_settings(workspace_id);
alter table public.marketplace_user_settings enable row level security;
revoke all on public.marketplace_user_settings from public, anon, authenticated;
grant select, insert on public.marketplace_user_settings to authenticated;
grant update(vinted, ebay, kleinanzeigen) on public.marketplace_user_settings to authenticated;
grant usage, select on sequence public.marketplace_user_settings_id_seq to authenticated;
grant all on public.marketplace_user_settings to service_role;
grant usage, select on sequence public.marketplace_user_settings_id_seq to service_role;

create policy "Eigene Marktplatzauswahl lesen" on public.marketplace_user_settings
for select to authenticated using (
  user_id = (select auth.uid()) and (select public.is_workspace_member(workspace_id))
  and exists (select 1 from public.workspaces w where w.id = workspace_id and w.archived_at is null)
);
create policy "Eigene Marktplatzauswahl anlegen" on public.marketplace_user_settings
for insert to authenticated with check (
  user_id = (select auth.uid()) and (select public.is_workspace_member(workspace_id))
  and exists (select 1 from public.workspaces w where w.id = workspace_id and w.archived_at is null)
);
create policy "Eigene Marktplatzauswahl ändern" on public.marketplace_user_settings
for update to authenticated using (
  user_id = (select auth.uid()) and (select public.is_workspace_member(workspace_id))
  and exists (select 1 from public.workspaces w where w.id = workspace_id and w.archived_at is null)
) with check (
  user_id = (select auth.uid()) and (select public.is_workspace_member(workspace_id))
  and exists (select 1 from public.workspaces w where w.id = workspace_id and w.archived_at is null)
);
create policy "Marktplatzauswahl nicht direkt löschen" on public.marketplace_user_settings
for delete to authenticated using (false);
create trigger "00_protect_archived_workspace" before insert or update or delete
on public.marketplace_user_settings for each row execute function public.protect_archived_workspace_data();

create or replace function public.marketplace_save_settings(
  p_workspace_id uuid, p_vinted boolean, p_ebay boolean, p_kleinanzeigen boolean,
  p_only_if_absent boolean default false
) returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_row public.marketplace_user_settings;
begin
  if (select auth.uid()) is null or not public.is_workspace_member(p_workspace_id)
    or not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.archived_at is null)
    then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
  end if;
  if p_only_if_absent is null then raise exception 'Ungültige Auswahl.' using errcode = '22023'; end if;
  if p_only_if_absent then
    insert into public.marketplace_user_settings(user_id,workspace_id,vinted,ebay,kleinanzeigen)
    values((select auth.uid()),p_workspace_id,p_vinted,p_ebay,p_kleinanzeigen)
    on conflict(user_id,workspace_id) do nothing;
    select * into strict v_row from public.marketplace_user_settings
    where user_id = (select auth.uid()) and workspace_id = p_workspace_id;
  else
    insert into public.marketplace_user_settings(user_id,workspace_id,vinted,ebay,kleinanzeigen)
    values((select auth.uid()),p_workspace_id,p_vinted,p_ebay,p_kleinanzeigen)
    on conflict(user_id,workspace_id) do update set
      vinted=excluded.vinted, ebay=excluded.ebay, kleinanzeigen=excluded.kleinanzeigen
    returning * into strict v_row;
  end if;
  return jsonb_build_object('vinted',v_row.vinted,'ebay',v_row.ebay,'kleinanzeigen',v_row.kleinanzeigen);
end;
$$;
revoke all on function public.marketplace_save_settings(uuid,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.marketplace_save_settings(uuid,boolean,boolean,boolean,boolean) to authenticated;

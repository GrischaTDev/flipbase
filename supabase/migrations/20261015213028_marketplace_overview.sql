-- Persönliche Marktplatzsichtbarkeit speichern.
-- Betroffen: public.marketplace_user_settings und public.marketplace_save_settings.
-- Automatisch aus dem geprüften lokalen Schema erzeugt; SQL nur mechanisch kleingeschrieben.

-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create function public.marketplace_save_settings (
  p_workspace_id   uuid,
  p_vinted         boolean,
  p_ebay           boolean,
  p_kleinanzeigen  boolean,
  p_only_if_absent boolean default false
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_save_settings(uuid, boolean, boolean, boolean, boolean) from public;

grant all on function public.marketplace_save_settings(uuid, boolean, boolean, boolean, boolean) to authenticated;

grant all on function public.marketplace_save_settings(uuid, boolean, boolean, boolean, boolean) to service_role;

create table public.marketplace_user_settings (
  id            bigint  generated always as identity not null,
  user_id       uuid    not null,
  workspace_id  uuid    not null,
  vinted        boolean default true not null,
  ebay          boolean default true not null,
  kleinanzeigen boolean default true not null
);

comment on table public.marketplace_user_settings is 'Persönliche Sichtbarkeit von Marktplätzen; keine Änderung von Kontofreigaben oder Aufträgen.';

alter table public.marketplace_user_settings
  enable row level security;

alter table public.marketplace_user_settings
  add constraint marketplace_user_settings_pkey primary key (id);

alter table public.marketplace_user_settings
  add constraint marketplace_user_settings_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.marketplace_user_settings
  add constraint marketplace_user_settings_user_id_workspace_id_key unique (user_id, workspace_id);

alter table public.marketplace_user_settings
  add constraint marketplace_user_settings_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade;

grant insert, select on public.marketplace_user_settings to authenticated;

grant update (ebay, kleinanzeigen, vinted) on public.marketplace_user_settings to authenticated;

grant all on public.marketplace_user_settings to service_role;

create index marketplace_user_settings_workspace on public.marketplace_user_settings (workspace_id);

create trigger "00_protect_archived_workspace"
  before insert or delete or update on public.marketplace_user_settings
  for each row
  execute function public.protect_archived_workspace_data();

create policy "Eigene Marktplatzauswahl anlegen" on public.marketplace_user_settings
  for insert
  to authenticated
  with
    check (((user_id = ( select auth.uid() as uid)) and ( select public.is_workspace_member(marketplace_user_settings.workspace_id) as is_workspace_member) and (exists ( select 1
   from public.workspaces w
  where ((w.id = marketplace_user_settings.workspace_id) and (w.archived_at is null))))));

create policy "Eigene Marktplatzauswahl lesen" on public.marketplace_user_settings
  for select
  to authenticated
  using (((user_id = ( select auth.uid() as uid)) and ( select public.is_workspace_member(marketplace_user_settings.workspace_id) as is_workspace_member) and (exists ( select 1
   from public.workspaces w
  where ((w.id = marketplace_user_settings.workspace_id) and (w.archived_at is null))))));

create policy "Eigene Marktplatzauswahl ändern" on public.marketplace_user_settings
  for update
  to authenticated
  using (((user_id = ( select auth.uid() as uid)) and ( select public.is_workspace_member(marketplace_user_settings.workspace_id) as is_workspace_member) and (exists ( select 1
   from public.workspaces w
  where ((w.id = marketplace_user_settings.workspace_id) and (w.archived_at is null))))))
  with
    check (((user_id = ( select auth.uid() as uid)) and ( select public.is_workspace_member(marketplace_user_settings.workspace_id) as is_workspace_member) and (exists ( select 1
   from public.workspaces w
  where ((w.id = marketplace_user_settings.workspace_id) and (w.archived_at is null))))));

create policy "Marktplatzauswahl nicht direkt löschen" on public.marketplace_user_settings
  for delete
  to authenticated
  using (false);
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

revoke delete, maintain, references, trigger, truncate on public.marketplace_user_settings from authenticated;

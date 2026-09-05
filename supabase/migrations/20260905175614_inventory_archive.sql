-- Reversible Archivmetadaten an inventory_items, geschützte RPC und Trigger.
-- Automatisch erzeugter Schemaabgleich; ACL mechanisch aus Deklaration übernommen.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create function public.protect_inventory_archive_metadata()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  -- Kein vom Client setzbares Sitzungsflag. Nur die geprüfte RPC läuft als postgres.
  if current_user <> 'postgres' and (
    (tg_op = 'INSERT' and (new.archived_at is not null or new.archived_by is not null))
    or (tg_op = 'UPDATE' and (new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by))
  ) then
    raise exception using errcode = '42501', message = 'Archivmetadaten dürfen nur über die Archivaktion geändert werden.';
  end if;
  return new;
end;
$function$;

revoke all on function public.protect_inventory_archive_metadata() from public;

create function public.set_inventory_item_archived (
  p_workspace_id uuid,
  p_item_id      uuid,
  p_archived     boolean
)
  returns public.inventory_items
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor uuid := (select auth.uid());
  v_item public.inventory_items;
  v_before timestamptz;
  v_workspace_archived_at timestamptz;
begin
  if v_actor is null or p_workspace_id is null or p_item_id is null then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_archived is null then
    raise exception using errcode = '22023', message = 'Archivaktion fehlt.';
  end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  select archived_at into v_workspace_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_workspace_archived_at is not null then
    raise exception using errcode = '55000', message = 'Dieser Workspace ist archiviert.';
  end if;
  select * into v_item from public.inventory_items where workspace_id = p_workspace_id and id = p_item_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_archived and not exists (
    select 1 from public.inventory_item_sale_states where workspace_id = p_workspace_id and inventory_item_id = p_item_id
      and sale_state = 'sold' and active_sale_count = 1 and active_sale_id is not null
  ) then
    raise exception using errcode = '22023', message = 'Nur eindeutig verkaufte Einzelartikel können archiviert werden.';
  end if;
  if (v_item.archived_at is not null) = p_archived then return v_item; end if;
  v_before := v_item.archived_at;
  update public.inventory_items set archived_at = case when p_archived then clock_timestamp() else null end,
    archived_by = case when p_archived then v_actor else null end
    where workspace_id = p_workspace_id and id = p_item_id returning * into v_item;
  insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, changes)
    values(p_workspace_id, 'inventory_item', p_item_id,
      case when p_archived then 'inventory_item_archived' else 'inventory_item_restored' end, v_actor,
      jsonb_build_object('archived_at', jsonb_build_object('before', v_before, 'after', v_item.archived_at)));
  return v_item;
end;
$function$;

comment on function public.set_inventory_item_archived(uuid,uuid,boolean) is 'Reversible Archivmetadaten für bestätigte Einzelverkäufe ohne Änderung von Bestand, Verkauf oder Buchungen.';

revoke all on function public.set_inventory_item_archived(uuid, uuid, boolean) from public;

grant all on function public.set_inventory_item_archived(uuid, uuid, boolean) to authenticated;

alter table public.inventory_items
  add column archived_at timestamp with time zone;

alter table public.inventory_items
  add column archived_by uuid;

alter table public.inventory_items
  add constraint inventory_items_archived_by_fkey foreign key (archived_by) references auth.users(id) on delete restrict;

create index inventory_items_archived_by_idx on public.inventory_items (archived_by);

create index inventory_items_workspace_archive_idx on public.inventory_items (workspace_id, archived_at);

create trigger protect_inventory_archive_metadata
  before insert or update on public.inventory_items
  for each row
  execute function public.protect_inventory_archive_metadata();
revoke execute on function public.protect_inventory_archive_metadata() from public, anon, authenticated, service_role;
revoke execute on function public.set_inventory_item_archived(uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_inventory_item_archived(uuid,uuid,boolean) to authenticated;

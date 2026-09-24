-- Archivstatus für Stammartikel; Lagerbestand, Wert und Buchungen bleiben unverändert.
create index catalog_products_workspace_archive_idx on public.catalog_products(workspace_id, archived_at);
create index catalog_products_archived_by_idx on public.catalog_products(archived_by);

comment on column public.catalog_products.archived_at is 'Reversibler Archivzeitpunkt; kein Bestandsabgang.';
comment on column public.catalog_products.archived_by is 'Angemeldeter Akteur der letzten Archivierung.';

create function public.protect_catalog_product_archive_metadata()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'postgres' and (
    (tg_op = 'INSERT' and (new.archived_at is not null or new.archived_by is not null))
    or (tg_op = 'UPDATE' and (new.archived_at is distinct from old.archived_at
      or new.archived_by is distinct from old.archived_by))
  ) then
    raise exception using errcode = '42501', message = 'Archivmetadaten dürfen nur über die Archivaktion geändert werden.';
  end if;
  return new;
end;
$$;

create trigger protect_catalog_product_archive_metadata before insert or update on public.catalog_products
for each row execute function public.protect_catalog_product_archive_metadata();
revoke execute on function public.protect_catalog_product_archive_metadata() from public, anon, authenticated, service_role;

create function public.set_catalog_product_archived(p_workspace_id uuid, p_product_id uuid, p_archived boolean)
returns public.catalog_products language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_product public.catalog_products;
  v_before timestamptz;
  v_workspace_archived_at timestamptz;
begin
  if v_actor is null or p_workspace_id is null or p_product_id is null then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_archived is null then
    raise exception using errcode = '22023', message = 'Archivaktion fehlt.';
  end if;
  perform 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  select archived_at into v_workspace_archived_at from public.workspaces
    where id = p_workspace_id for share;
  if v_workspace_archived_at is not null then
    raise exception using errcode = '55000', message = 'Dieser Workspace ist archiviert.';
  end if;
  select * into v_product from public.catalog_products
    where workspace_id = p_workspace_id and id = p_product_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_archived then
    if exists (select 1 from public.listings where workspace_id = p_workspace_id
      and catalog_product_id = p_product_id and status <> 'ended')
      or exists (select 1 from public.listings listing
        join public.inventory_items item on item.id = listing.inventory_item_id and item.workspace_id = listing.workspace_id
        join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
        where listing.workspace_id = p_workspace_id and line.catalog_product_id = p_product_id
          and listing.status <> 'ended') then
      raise exception using errcode = '22023', message = 'Bitte das Inserat zuerst beenden.';
    end if;
    if exists (select 1 from public.inventory_items item
      join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
      where item.workspace_id = p_workspace_id and line.catalog_product_id = p_product_id
        and item.status = 'reserved')
      or exists (select 1 from public.stock_movements movement
      join public.stock_lots lot on lot.id = movement.stock_lot_id
      where lot.workspace_id = p_workspace_id and lot.catalog_product_id = p_product_id
        and movement.reason in ('reservation', 'reservation_release')
      group by lot.id
      having sum(case when movement.reason = 'reservation' then movement.quantity else -movement.quantity end) > 0) then
      raise exception using errcode = '22023', message = 'Bitte die Reservierung zuerst klären.';
    end if;
    if exists (select 1 from public.store_order_items oi
      join public.store_orders o on o.id = oi.store_order_id
      where o.workspace_id = p_workspace_id and oi.catalog_product_id = p_product_id
        and o.status not in ('completed', 'cancelled'))
      or exists (select 1 from public.store_order_items oi
        join public.store_orders o on o.id = oi.store_order_id
        join public.inventory_items item on item.id = oi.inventory_item_id and item.workspace_id = o.workspace_id
        join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
        where o.workspace_id = p_workspace_id and line.catalog_product_id = p_product_id
          and o.status not in ('completed', 'cancelled')) then
      raise exception using errcode = '22023', message = 'Bitte den offenen Shopauftrag zuerst klären.';
    end if;
  end if;
  if (v_product.archived_at is not null) = p_archived then return v_product; end if;
  v_before := v_product.archived_at;
  update public.catalog_products
    set archived_at = case when p_archived then clock_timestamp() else null end,
        archived_by = case when p_archived then v_actor else null end
    where workspace_id = p_workspace_id and id = p_product_id
    returning * into v_product;
  insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, changes)
    values (p_workspace_id, 'catalog_product', p_product_id,
      case when p_archived then 'catalog_product_archived' else 'catalog_product_restored' end,
      v_actor, jsonb_build_object('archived_at', jsonb_build_object('before', v_before, 'after', v_product.archived_at)));
  return v_product;
end;
$$;
alter function public.set_catalog_product_archived(uuid,uuid,boolean) owner to postgres;
comment on function public.set_catalog_product_archived(uuid,uuid,boolean) is 'Reversible Archivmetadaten ohne Änderung von Lagerbestand und Buchungen.';
revoke execute on function public.set_catalog_product_archived(uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_catalog_product_archived(uuid,uuid,boolean) to authenticated;

-- Bilddateien dürfen erst nach einem erfolgreich abgeschlossenen Artikellöschen entfernt werden.
create table public.article_media_cleanup_jobs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  article_kind text not null check (article_kind in ('catalog', 'item')),
  article_id uuid not null,
  bucket_id text not null default 'item-media' check (bucket_id = 'item-media'),
  storage_path text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (bucket_id, storage_path)
);
comment on table public.article_media_cleanup_jobs is 'Nach einem erlaubten Artikellöschen ausstehende private Bilddateien.';
create index article_media_cleanup_jobs_workspace_due_idx
  on public.article_media_cleanup_jobs(workspace_id, completed_at, next_attempt_at);
alter table public.article_media_cleanup_jobs enable row level security;
revoke all on public.article_media_cleanup_jobs from public, anon, authenticated, service_role;
grant select on public.article_media_cleanup_jobs to authenticated;
grant select, update on public.article_media_cleanup_jobs to service_role;
create policy "Eigene Bildbereinigung lesen" on public.article_media_cleanup_jobs
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));

create function public.delete_unused_article(p_workspace_id uuid, p_article_kind text, p_article_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_title text;
  v_queued integer := 0;
begin
  if v_actor is null or p_workspace_id is null or p_article_id is null then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_article_kind not in ('catalog', 'item') or p_article_kind is null then
    raise exception using errcode = '22023', message = 'Unbekannte Artikelart.';
  end if;
  perform 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then
    raise exception using errcode = '55000', message = 'Dieser Workspace ist archiviert.';
  end if;

  if p_article_kind = 'catalog' then
    select title into v_title from public.catalog_products
      where workspace_id = p_workspace_id and id = p_article_id for update;
    if not found then
      raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
    end if;
    if exists (select 1 from public.purchase_lines where workspace_id = p_workspace_id and catalog_product_id = p_article_id)
       or exists (select 1 from public.catalog_products where workspace_id = p_workspace_id and id = p_article_id and is_public_store)
       or exists (select 1 from public.stock_lots where workspace_id = p_workspace_id and catalog_product_id = p_article_id)
       or exists (select 1 from public.sale_lines where workspace_id = p_workspace_id and catalog_product_id = p_article_id)
       or exists (select 1 from public.store_order_items oi join public.store_orders o on o.id = oi.store_order_id
         where o.workspace_id = p_workspace_id and oi.catalog_product_id = p_article_id)
       or exists (select 1 from public.listings where workspace_id = p_workspace_id and catalog_product_id = p_article_id)
    then
      raise exception using errcode = '23503', message = 'Der Artikel wird bereits verwendet und kann nur archiviert werden.';
    end if;
    insert into public.article_media_cleanup_jobs(workspace_id, article_kind, article_id, storage_path)
      select p_workspace_id, 'catalog', p_article_id, storage_path
      from public.catalog_product_media where workspace_id = p_workspace_id and catalog_product_id = p_article_id;
    get diagnostics v_queued = row_count;
    delete from public.catalog_product_media where workspace_id = p_workspace_id and catalog_product_id = p_article_id;
    delete from public.catalog_products where workspace_id = p_workspace_id and id = p_article_id;
  else
    select title into v_title from public.inventory_items
      where workspace_id = p_workspace_id and id = p_article_id for update;
    if not found then
      raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
    end if;
    if exists (select 1 from public.inventory_items where workspace_id = p_workspace_id and id = p_article_id
      and (purchase_id is not null or purchase_line_id is not null or source_package_line_id is not null
        or status in ('reserved', 'sold') or is_public_store))
       or exists (select 1 from public.item_costs where inventory_item_id = p_article_id)
       or exists (select 1 from public.sales where workspace_id = p_workspace_id and inventory_item_id = p_article_id)
       or exists (select 1 from public.sale_lines where workspace_id = p_workspace_id and inventory_item_id = p_article_id)
       or exists (select 1 from public.returns where inventory_item_id = p_article_id)
       or exists (select 1 from public.inventory_reconciliation_events where workspace_id = p_workspace_id and inventory_item_id = p_article_id)
       or exists (select 1 from public.store_order_items oi join public.store_orders o on o.id = oi.store_order_id
         where o.workspace_id = p_workspace_id and oi.inventory_item_id = p_article_id)
       or exists (select 1 from public.listings where workspace_id = p_workspace_id and inventory_item_id = p_article_id)
       or exists (select 1 from public.activity_logs where inventory_item_id = p_article_id)
       or exists (select 1 from public.market_research where inventory_item_id = p_article_id)
       or exists (select 1 from public.price_tracked_items where inventory_item_id = p_article_id)
    then
      raise exception using errcode = '23503', message = 'Der Artikel wird bereits verwendet und kann nur archiviert werden.';
    end if;
    insert into public.article_media_cleanup_jobs(workspace_id, article_kind, article_id, storage_path)
      select p_workspace_id, 'item', p_article_id, storage_path
      from public.item_media where inventory_item_id = p_article_id;
    get diagnostics v_queued = row_count;
    delete from public.item_media where inventory_item_id = p_article_id;
    delete from public.inventory_items where workspace_id = p_workspace_id and id = p_article_id;
  end if;

  insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, changes)
    values (p_workspace_id, case when p_article_kind = 'catalog' then 'catalog_product' else 'inventory_item' end,
      p_article_id, 'article_deleted', v_actor, jsonb_build_object('title', v_title, 'queued_media', v_queued));
  return jsonb_build_object('deleted', true, 'queued_media', v_queued);
end;
$$;
alter function public.delete_unused_article(uuid,text,uuid) owner to postgres;
comment on function public.delete_unused_article(uuid,text,uuid) is 'Löscht ausschließlich unbenutzte Artikel und merkt private Bilder transaktional vor.';
revoke execute on function public.delete_unused_article(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_unused_article(uuid,text,uuid) to authenticated;

-- Bestehende Einkaufszeilen bleiben bearbeitbar; nur neue Artikelzuordnungen sind gesperrt.
create function public.reject_archived_product_purchase_line()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_archived_at timestamptz;
begin
  if new.catalog_product_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.catalog_product_id is not distinct from old.catalog_product_id
      and new.workspace_id is not distinct from old.workspace_id then
      return new;
    end if;
  end if;
  select archived_at into v_archived_at from public.catalog_products
    where id = new.catalog_product_id and workspace_id = new.workspace_id for share;
  if v_archived_at is not null then
    raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
  end if;
  return new;
end;
$$;
revoke execute on function public.reject_archived_product_purchase_line() from public, anon, authenticated, service_role;
create trigger reject_archived_product_purchase_line before insert or update of catalog_product_id, workspace_id
on public.purchase_lines for each row execute function public.reject_archived_product_purchase_line();

-- Ein dem Stammartikel zugeordnetes Stück darf das Archiv nicht über direkte Stück-IDs umgehen.
create function public.reject_archived_parent_for_item_operation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_archived_at timestamptz;
begin
  if new.inventory_item_id is null then return new; end if;
  if tg_table_name = 'listings' then
    if new.status = 'ended' then return new; end if;
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'sale_lines' then
    if new.inventory_item_id is not distinct from old.inventory_item_id
      and new.workspace_id is not distinct from old.workspace_id then
      return new;
    end if;
  end if;
  select product.archived_at into v_archived_at
    from public.inventory_items item
    join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
    join public.catalog_products product on product.id = line.catalog_product_id and product.workspace_id = line.workspace_id
    where item.id = new.inventory_item_id and item.workspace_id = new.workspace_id
    for share of product;
  if v_archived_at is not null then
    raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
  end if;
  return new;
end;
$$;
revoke execute on function public.reject_archived_parent_for_item_operation() from public, anon, authenticated, service_role;
create trigger reject_archived_parent_item_sale before insert or update of inventory_item_id, workspace_id
on public.sale_lines for each row execute function public.reject_archived_parent_for_item_operation();
create trigger reject_archived_parent_item_listing before insert or update of inventory_item_id, workspace_id, status
on public.listings for each row execute function public.reject_archived_parent_for_item_operation();

create function public.reject_archived_parent_item_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_archived_at timestamptz;
begin
  if new.purchase_line_id is null then return new; end if;
  if tg_op = 'UPDATE'
    and new.purchase_line_id is not distinct from old.purchase_line_id
    and new.workspace_id is not distinct from old.workspace_id
    and new.status <> 'reserved' then
    return new;
  end if;
  select product.archived_at into v_archived_at
    from public.purchase_lines line
    join public.catalog_products product on product.id = line.catalog_product_id and product.workspace_id = line.workspace_id
    where line.id = new.purchase_line_id and line.workspace_id = new.workspace_id
    for share of product;
  if v_archived_at is not null then
    raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
  end if;
  return new;
end;
$$;
revoke execute on function public.reject_archived_parent_item_change() from public, anon, authenticated, service_role;
create trigger reject_archived_parent_item_change before insert or update of status, purchase_line_id, workspace_id
on public.inventory_items for each row execute function public.reject_archived_parent_item_change();

create function public.reject_archived_product_lot_reservation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_archived_at timestamptz;
begin
  if new.reason <> 'reservation' then return new; end if;
  select product.archived_at into v_archived_at
    from public.stock_lots lot
    join public.catalog_products product on product.id = lot.catalog_product_id and product.workspace_id = lot.workspace_id
    where lot.id = new.stock_lot_id and lot.workspace_id = new.workspace_id
    for share of product;
  if v_archived_at is not null then
    raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
  end if;
  return new;
end;
$$;
revoke execute on function public.reject_archived_product_lot_reservation() from public, anon, authenticated, service_role;
create trigger reject_archived_product_lot_reservation before insert or update of reason, stock_lot_id, quantity, workspace_id
on public.stock_movements for each row execute function public.reject_archived_product_lot_reservation();

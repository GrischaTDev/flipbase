-- Gemeinsame Artikelverwaltung: Archivierung, sichere Loeschung und Bildbereinigung.
-- Betroffen: catalog_products, article_media_cleanup_jobs, business_events und Artikelvorgaenge.
alter table "public"."business_events" drop constraint "business_events_entity_type_check";


  create table "public"."article_media_cleanup_jobs" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "article_kind" text not null,
    "article_id" uuid not null,
    "bucket_id" text not null default 'item-media'::text,
    "storage_path" text not null,
    "attempt_count" integer not null default 0,
    "next_attempt_at" timestamp with time zone not null default now(),
    "completed_at" timestamp with time zone,
    "last_error" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."article_media_cleanup_jobs" enable row level security;

alter table "public"."catalog_products" add column "archived_at" timestamp with time zone;

alter table "public"."catalog_products" add column "archived_by" uuid;

CREATE UNIQUE INDEX article_media_cleanup_jobs_bucket_id_storage_path_key ON public.article_media_cleanup_jobs USING btree (bucket_id, storage_path);

CREATE UNIQUE INDEX article_media_cleanup_jobs_pkey ON public.article_media_cleanup_jobs USING btree (id);

CREATE INDEX article_media_cleanup_jobs_workspace_due_idx ON public.article_media_cleanup_jobs USING btree (workspace_id, completed_at, next_attempt_at);

CREATE INDEX catalog_products_archived_by_idx ON public.catalog_products USING btree (archived_by);

CREATE INDEX catalog_products_workspace_archive_idx ON public.catalog_products USING btree (workspace_id, archived_at);

alter table "public"."article_media_cleanup_jobs" add constraint "article_media_cleanup_jobs_pkey" PRIMARY KEY using index "article_media_cleanup_jobs_pkey";

alter table "public"."article_media_cleanup_jobs" add constraint "article_media_cleanup_jobs_article_kind_check" CHECK ((article_kind = ANY (ARRAY['catalog'::text, 'item'::text]))) not valid;

alter table "public"."article_media_cleanup_jobs" validate constraint "article_media_cleanup_jobs_article_kind_check";

alter table "public"."article_media_cleanup_jobs" add constraint "article_media_cleanup_jobs_attempt_count_check" CHECK ((attempt_count >= 0)) not valid;

alter table "public"."article_media_cleanup_jobs" validate constraint "article_media_cleanup_jobs_attempt_count_check";

alter table "public"."article_media_cleanup_jobs" add constraint "article_media_cleanup_jobs_bucket_id_check" CHECK ((bucket_id = 'item-media'::text)) not valid;

alter table "public"."article_media_cleanup_jobs" validate constraint "article_media_cleanup_jobs_bucket_id_check";

alter table "public"."article_media_cleanup_jobs" add constraint "article_media_cleanup_jobs_bucket_id_storage_path_key" UNIQUE using index "article_media_cleanup_jobs_bucket_id_storage_path_key";

alter table "public"."article_media_cleanup_jobs" add constraint "article_media_cleanup_jobs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE RESTRICT not valid;

alter table "public"."article_media_cleanup_jobs" validate constraint "article_media_cleanup_jobs_workspace_id_fkey";

alter table "public"."catalog_products" add constraint "catalog_products_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."catalog_products" validate constraint "catalog_products_archived_by_fkey";

alter table "public"."business_events" add constraint "business_events_entity_type_check" CHECK ((entity_type = ANY (ARRAY['purchase'::text, 'inventory_item'::text, 'catalog_product'::text, 'sale'::text, 'return'::text, 'expense'::text, 'export'::text, 'workspace'::text]))) not valid;

alter table "public"."business_events" validate constraint "business_events_entity_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_unused_article(p_workspace_id uuid, p_article_kind text, p_article_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.protect_catalog_product_archive_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_catalog_product_archived(p_workspace_id uuid, p_product_id uuid, p_archived boolean)
 RETURNS public.catalog_products
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.place_store_order(p_workspace_id uuid, p_order_id uuid, p_order_number text, p_customer jsonb, p_subtotal numeric, p_shipping_cost numeric, p_total numeric, p_payment_method text, p_payment_status text, p_payment_id text, p_status text, p_sale_date date, p_buyer_notes text, p_items jsonb)
 RETURNS public.store_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.store_orders;
  v_inventory_item public.inventory_items;
  v_inventory_item_id uuid;
  v_sale_state text;
  v_item_count integer;
  v_reference_count integer;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_order_id is null
    or nullif(trim(p_order_number), '') is null
    or jsonb_typeof(p_customer) <> 'object'
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or p_subtotal < 0
    or p_shipping_cost < 0
    or p_total < 0 then
    raise exception using errcode = '22023', message = 'Die Bestelldaten sind ungültig.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or nullif(trim(item.value ->> 'item_title'), '') is null
      or coalesce((item.value ->> 'quantity')::integer, 0) < 1
      or coalesce((item.value ->> 'price')::numeric, -1) < 0
      or case
        when item.value ? 'payment_fee'
          and jsonb_typeof(item.value -> 'payment_fee') <> 'null' then
          case jsonb_typeof(item.value -> 'payment_fee')
            when 'number' then
              (item.value ->> 'payment_fee')::numeric < 0
              or (item.value ->> 'payment_fee')::numeric <> trunc((item.value ->> 'payment_fee')::numeric, 2)
            else true
          end
        else false
      end
      or num_nonnulls(
        nullif(item.value ->> 'catalog_product_id', ''),
        nullif(item.value ->> 'inventory_item_id', '')
      ) <> 1
  ) then
    raise exception using errcode = '22023', message = 'Mindestens eine Bestellposition ist ungültig.';
  end if;

  select * into v_order
  from public.store_orders
  where id = p_order_id
  for update;

  if found then
    if v_order.workspace_id <> p_workspace_id
      or v_order.order_number <> p_order_number then
      raise exception using errcode = '22023', message = 'Die Bestellkennung gehört zu einer anderen Bestellung.';
    end if;
    return v_order;
  end if;

  select count(*), count(distinct coalesce(
    'catalog_product:' || item.catalog_product_id::text,
    'inventory_item:' || item.inventory_item_id::text
  ))
  into v_item_count, v_reference_count
  from jsonb_to_recordset(p_items) as item(
    catalog_product_id uuid,
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  );

  if v_reference_count <> v_item_count then
    raise exception using errcode = '22023', message = 'Jeder Artikel darf nur einmal in einer Bestellung vorkommen.';
  end if;

  -- Lock in stable order so concurrent checkout requests cannot sell the same
  -- individual item and cannot deadlock when an order contains several items.
  for v_inventory_item_id in
    select distinct item.inventory_item_id
    from jsonb_to_recordset(p_items) as item(
      catalog_product_id uuid,
      inventory_item_id uuid,
      item_title text,
      quantity integer,
      price numeric,
      payment_fee numeric
    )
    where item.inventory_item_id is not null
    order by item.inventory_item_id
  loop
    select * into v_inventory_item
    from public.inventory_items
    where id = v_inventory_item_id
      and workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Der Einzelartikel wurde nicht gefunden.';
    end if;

    if v_inventory_item.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
    end if;

    select sale_state into v_sale_state
    from public.inventory_item_sale_states
    where inventory_item_id = v_inventory_item.id
      and workspace_id = p_workspace_id;

    if v_inventory_item.status not in ('ready', 'listed')
      or v_sale_state is distinct from 'no_active_sale' then
      raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
    end if;
  end loop;

  insert into public.store_orders (
    id,
    workspace_id,
    order_number,
    customer,
    subtotal,
    shipping_cost,
    total,
    payment_method,
    payment_status,
    payment_id,
    status
  )
  values (
    p_order_id,
    p_workspace_id,
    p_order_number,
    p_customer,
    p_subtotal,
    p_shipping_cost,
    p_total,
    p_payment_method,
    p_payment_status,
    p_payment_id,
    p_status
  )
  returning * into v_order;

  insert into public.store_order_items (
    store_order_id,
    inventory_item_id,
    catalog_product_id,
    item_title,
    price,
    quantity
  )
  select
    v_order.id,
    item.inventory_item_id,
    item.catalog_product_id,
    item.item_title,
    item.price,
    item.quantity
  from jsonb_to_recordset(p_items) as item(
    catalog_product_id uuid,
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  );

  perform public.record_sale(
    p_workspace_id,
    jsonb_build_object(
      'platform', 'custom_store',
      'sale_date', p_sale_date,
      'shipping_revenue', p_shipping_cost,
      'shipping_cost', 0,
      'shipping_mode', case
        when p_customer ->> 'shippingMethod' = 'pickup' then 'pickup'
        else 'seller_arranged'
      end,
      'cost_entries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'category', 'payment_fee',
          'amount', item.payment_fee
        ))
        from jsonb_to_recordset(p_items) as item(
          catalog_product_id uuid,
          inventory_item_id uuid,
          item_title text,
          quantity integer,
          price numeric,
          payment_fee numeric
        )
        where coalesce(item.payment_fee, 0) > 0
      ), '[]'::jsonb),
      'external_order_id', p_order_number,
      'buyer_notes', p_buyer_notes
    ),
    (
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'catalog_product_id', item.catalog_product_id,
        'inventory_item_id', item.inventory_item_id,
        'title_snapshot', item.item_title,
        'quantity', item.quantity,
        'unit_sale_price', item.price
      )))
      from jsonb_to_recordset(p_items) as item(
        catalog_product_id uuid,
        inventory_item_id uuid,
        item_title text,
        quantity integer,
        price numeric,
        payment_fee numeric
      )
    )
  );

  return v_order;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_legacy_inventory_sale(p_workspace_id uuid, p_inventory_item_id uuid, p_sale jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_inventory_item public.inventory_items;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_event public.inventory_reconciliation_events;
  v_sale_state text;
  v_unit_sale_price numeric(12, 2);
  v_workspace_tax_mode text;
  v_shipping_revenue numeric(12,2) := 0;
  v_shipping_mode text;
  v_cost_entries jsonb := '[]'::jsonb;
  v_cost_entry jsonb;
  v_packaging_cost numeric(12,2) := 0;
  v_other_costs numeric(12,2) := 0;
  v_money_key text;
begin
  if v_actor_id is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Ein dokumentierter Klaerungsgrund ist erforderlich.';
  end if;

  if jsonb_typeof(p_sale) <> 'object'
    or nullif(trim(p_sale ->> 'platform'), '') is null
    or (p_sale ->> 'sale_date') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_sale -> 'unit_sale_price') <> 'number'
    or (p_sale ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
    or (p_sale ->> 'unit_sale_price')::numeric <= 0 then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungueltig.';
  end if;

  foreach v_money_key in array array['platform_fee', 'shipping_cost', 'shipping_revenue', 'packaging_cost', 'other_costs'] loop
    if p_sale ? v_money_key
      and (
        jsonb_typeof(p_sale -> v_money_key) <> 'number'
        or (p_sale ->> v_money_key) !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
        or (p_sale ->> v_money_key)::numeric < 0
      ) then
      raise exception using errcode = '22023', message = 'Die Verkaufsbeträge sind ungültig.';
    end if;
  end loop;

  if p_sale ? 'shipping_mode'
    and jsonb_typeof(p_sale -> 'shipping_mode') <> 'null'
    and (
      jsonb_typeof(p_sale -> 'shipping_mode') <> 'string'
      or p_sale ->> 'shipping_mode' not in ('seller_arranged', 'platform_prepaid', 'pickup')
    ) then
    raise exception using errcode = '22023', message = 'Die Versandabwicklung ist ungültig.';
  end if;

  if p_sale ? 'cost_entries' then
    if jsonb_typeof(p_sale -> 'cost_entries') <> 'array' then
      raise exception using errcode = '22023', message = 'Die zusätzlichen Verkaufskosten sind ungültig.';
    end if;
    v_cost_entries := p_sale -> 'cost_entries';
  else
    v_cost_entries := jsonb_strip_nulls(jsonb_build_array(
      case when coalesce((p_sale ->> 'packaging_cost')::numeric, 0) > 0
        then jsonb_build_object('category', 'packaging', 'amount', (p_sale ->> 'packaging_cost')::numeric)
      end,
      case when coalesce((p_sale ->> 'other_costs')::numeric, 0) > 0
        then jsonb_build_object('category', 'other', 'amount', (p_sale ->> 'other_costs')::numeric)
      end
    ));
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    into v_cost_entries
    from jsonb_array_elements(v_cost_entries) as entry(value)
    where value <> 'null'::jsonb;
  end if;

  if jsonb_array_length(v_cost_entries) > 50 then
    raise exception using errcode = '22023', message = 'Es sind höchstens 50 zusätzliche Verkaufskosten erlaubt.';
  end if;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    if jsonb_typeof(v_cost_entry) <> 'object'
      or jsonb_typeof(v_cost_entry -> 'category') <> 'string'
      or v_cost_entry ->> 'category' not in ('packaging', 'payment_fee', 'promotion', 'other')
      or (v_cost_entry ? 'description' and jsonb_typeof(v_cost_entry -> 'description') not in ('string', 'null'))
      or jsonb_typeof(v_cost_entry -> 'amount') <> 'number'
      or (v_cost_entry ->> 'amount') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_cost_entry ->> 'amount')::numeric < 0 then
      raise exception using errcode = '22023', message = 'Eine zusätzliche Verkaufskostenzeile ist ungültig.';
    end if;

    if v_cost_entry ->> 'category' = 'packaging' then
      v_packaging_cost := v_packaging_cost + (v_cost_entry ->> 'amount')::numeric;
    else
      v_other_costs := v_other_costs + (v_cost_entry ->> 'amount')::numeric;
    end if;
  end loop;

  v_shipping_revenue := coalesce((p_sale ->> 'shipping_revenue')::numeric, 0);
  v_shipping_mode := nullif(p_sale ->> 'shipping_mode', '');

  select *
  into v_inventory_item
  from public.inventory_items
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Der Inventarartikel wurde nicht gefunden.';
  end if;

  if v_inventory_item.archived_at is not null then
    raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
  end if;

  select sale_state
  into v_sale_state
  from public.inventory_item_sale_states
  where inventory_item_id = p_inventory_item_id
    and workspace_id = p_workspace_id;

  if v_sale_state <> 'legacy_sold_unverified' then
    raise exception using errcode = '22023', message = 'Legacy-Verkaufsnachtrag ist nur fuer ungepruefte sold-Altdaten zulaessig.';
  end if;

  select tax_mode into v_workspace_tax_mode
  from public.workspaces
  where id = p_workspace_id;
  v_unit_sale_price := (p_sale ->> 'unit_sale_price')::numeric(12, 2);

  insert into public.sales (
    workspace_id, inventory_item_id, platform, sale_price, sale_price_total, sale_date,
    platform_fee, shipping_cost, packaging_cost, other_costs, shipping_revenue, shipping_mode,
    external_order_id, external_listing_id, buyer_notes
  ) values (
    p_workspace_id, null, trim(p_sale ->> 'platform'),
    v_unit_sale_price + v_shipping_revenue, v_unit_sale_price + v_shipping_revenue, (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    v_packaging_cost,
    v_other_costs,
    v_shipping_revenue,
    v_shipping_mode,
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), '')
  ) returning * into v_sale;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    insert into public.sale_cost_entries (
      workspace_id, sale_id, category, description, amount
    ) values (
      p_workspace_id,
      v_sale.id,
      v_cost_entry ->> 'category',
      nullif(trim(v_cost_entry ->> 'description'), ''),
      (v_cost_entry ->> 'amount')::numeric
    );
  end loop;

  insert into public.sale_lines (
    workspace_id, sale_id, inventory_item_id, title_snapshot, quantity,
    unit_sale_price, line_total, cost_of_goods_sold, tax_mode
  ) values (
    p_workspace_id, v_sale.id, p_inventory_item_id,
    coalesce(nullif(trim(p_sale ->> 'title_snapshot'), ''), v_inventory_item.title),
    1, v_unit_sale_price, v_unit_sale_price,
    v_inventory_item.allocated_purchase_cost + coalesce((
      select pg_catalog.sum(cost.amount) from public.item_costs as cost
      where cost.inventory_item_id = v_inventory_item.id
    ), 0), v_workspace_tax_mode
  ) returning * into v_sale_line;

  update public.sales
  set inventory_item_id = p_inventory_item_id
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.inventory_reconciliation_events (
    workspace_id, inventory_item_id, actor_id, event_type,
    previous_status, new_status, reason
  ) values (
    p_workspace_id, p_inventory_item_id, v_actor_id, 'record_legacy_sale',
    'sold', 'sold', trim(p_reason)
  ) returning * into v_event;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'cost_entries', coalesce((
      select jsonb_agg(to_jsonb(cost_entry) order by cost_entry.id)
      from public.sale_cost_entries as cost_entry
      where cost_entry.sale_id = v_sale.id
    ), '[]'::jsonb),
    'sale_lines', jsonb_build_array(to_jsonb(v_sale_line)),
    'lot_allocations', '[]'::jsonb,
    'stock_movements', '[]'::jsonb,
    'event', to_jsonb(v_event)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_sale(p_workspace_id uuid, p_sale jsonb, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_input_line jsonb;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_stock_lot public.stock_lots;
  v_catalog_product public.catalog_products;
  v_inventory_item public.inventory_items;
  v_workspace public.workspaces;
  v_catalog_product_id uuid;
  v_inventory_item_id uuid;
  v_header_inventory_item_id uuid;
  v_source_purchase_id uuid;
  v_source_purchase_status text;
  v_locked_purchase_ids uuid[] := array[]::uuid[];
  v_quantity integer;
  v_unit_sale_price numeric(12, 2);
  v_line_total numeric(12, 2);
  v_tax_costs numeric[];
  v_business_unit_costs numeric[];
  v_line_tax_costs numeric[];
  v_tax_unknown boolean;
  v_line_cogs numeric(12, 2);
  v_remaining_quantity integer;
  v_allocated_quantity integer;
  v_allocation_cost numeric(12,2);
  v_previously_allocated_cost numeric(12,2);
  v_lot_total_cost numeric(12,2);
  v_remaining_lot_cost numeric(12,2);
  v_remaining_cost_cents bigint;
  v_previously_active_quantity integer;
  v_consumption_sequence bigint;
  v_ambiguous_active_cost_count integer;
  v_invalid_restocked_quantity_count integer;
  v_sale_total numeric(12, 2) := 0;
  v_shipping_revenue numeric(12,2) := 0;
  v_shipping_mode text;
  v_cost_entries jsonb := '[]'::jsonb;
  v_cost_entry jsonb;
  v_packaging_cost numeric(12,2) := 0;
  v_other_costs numeric(12,2) := 0;
  v_money_key text;
  v_sale_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_sale_state text;
  v_business_event_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_sale) <> 'object'
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0
    or nullif(trim(p_sale ->> 'platform'), '') is null
    or (p_sale ->> 'sale_date') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungültig.';
  end if;

  foreach v_money_key in array array['platform_fee', 'shipping_cost', 'shipping_revenue', 'packaging_cost', 'other_costs'] loop
    if p_sale ? v_money_key
      and (
        jsonb_typeof(p_sale -> v_money_key) <> 'number'
        or (p_sale ->> v_money_key) !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
        or (p_sale ->> v_money_key)::numeric < 0
      ) then
      raise exception using errcode = '22023', message = 'Die Verkaufsbeträge sind ungültig.';
    end if;
  end loop;

  if p_sale ? 'shipping_mode'
    and jsonb_typeof(p_sale -> 'shipping_mode') <> 'null'
    and (
      jsonb_typeof(p_sale -> 'shipping_mode') <> 'string'
      or p_sale ->> 'shipping_mode' not in ('seller_arranged', 'platform_prepaid', 'pickup')
    ) then
    raise exception using errcode = '22023', message = 'Die Versandabwicklung ist ungültig.';
  end if;

  if p_sale ? 'cost_entries' then
    if jsonb_typeof(p_sale -> 'cost_entries') <> 'array' then
      raise exception using errcode = '22023', message = 'Die zusätzlichen Verkaufskosten sind ungültig.';
    end if;
    v_cost_entries := p_sale -> 'cost_entries';
  else
    v_cost_entries := jsonb_strip_nulls(jsonb_build_array(
      case when coalesce((p_sale ->> 'packaging_cost')::numeric, 0) > 0
        then jsonb_build_object('category', 'packaging', 'amount', (p_sale ->> 'packaging_cost')::numeric)
      end,
      case when coalesce((p_sale ->> 'other_costs')::numeric, 0) > 0
        then jsonb_build_object('category', 'other', 'amount', (p_sale ->> 'other_costs')::numeric)
      end
    ));
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    into v_cost_entries
    from jsonb_array_elements(v_cost_entries) as entry(value)
    where value <> 'null'::jsonb;
  end if;

  if jsonb_array_length(v_cost_entries) > 50 then
    raise exception using errcode = '22023', message = 'Es sind höchstens 50 zusätzliche Verkaufskosten erlaubt.';
  end if;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    if jsonb_typeof(v_cost_entry) <> 'object'
      or jsonb_typeof(v_cost_entry -> 'category') <> 'string'
      or v_cost_entry ->> 'category' not in ('packaging', 'payment_fee', 'promotion', 'other')
      or (v_cost_entry ? 'description' and jsonb_typeof(v_cost_entry -> 'description') not in ('string', 'null'))
      or jsonb_typeof(v_cost_entry -> 'amount') <> 'number'
      or (v_cost_entry ->> 'amount') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_cost_entry ->> 'amount')::numeric < 0 then
      raise exception using errcode = '22023', message = 'Eine zusätzliche Verkaufskostenzeile ist ungültig.';
    end if;

    if v_cost_entry ->> 'category' = 'packaging' then
      v_packaging_cost := v_packaging_cost + (v_cost_entry ->> 'amount')::numeric;
    else
      v_other_costs := v_other_costs + (v_cost_entry ->> 'amount')::numeric;
    end if;
  end loop;

  v_shipping_revenue := coalesce((p_sale ->> 'shipping_revenue')::numeric, 0);
  v_shipping_mode := nullif(p_sale ->> 'shipping_mode', '');

  select * into v_workspace
  from public.workspaces
  where id = p_workspace_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Workspace wurde nicht gefunden.';
  end if;

  -- Validate every line before taking locks or writing the sale header.
  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(trim(v_input_line ->> 'catalog_product_id'), ''),
        nullif(trim(v_input_line ->> 'inventory_item_id'), '')
      ) <> 1
      or (
        nullif(trim(v_input_line ->> 'catalog_product_id'), '') is not null
        and jsonb_typeof(v_input_line -> 'catalog_product_id') <> 'string'
      )
      or (
        nullif(trim(v_input_line ->> 'inventory_item_id'), '') is not null
        and jsonb_typeof(v_input_line -> 'inventory_item_id') <> 'string'
      ) then
      raise exception using errcode = '22023', message = 'Eine Verkaufsposition ist ungültig.';
    end if;
  end loop;

  -- Lock every currently relevant source purchase before any item or lot.
  -- Reopen/correction use the same purchase-first order, and UUID sorting
  -- prevents client-controlled deadlocks across mixed multi-line sales.
  select coalesce(
    pg_catalog.array_agg(source.purchase_id order by source.purchase_id),
    array[]::uuid[]
  )
  into v_locked_purchase_ids
  from (
    select coalesce(item.purchase_id, linked_line.purchase_id) as purchase_id
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    join public.inventory_items as item
      on item.workspace_id = p_workspace_id
      and item.id = (element.value ->> 'inventory_item_id')::uuid
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where nullif(pg_catalog.btrim(element.value ->> 'inventory_item_id'), '') is not null

    union

    select lot.purchase_id
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    join public.stock_lots as lot
      on lot.workspace_id = p_workspace_id
      and lot.catalog_product_id = (element.value ->> 'catalog_product_id')::uuid
      and lot.remaining_quantity > 0
    where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
  ) as source
  where source.purchase_id is not null;

  if pg_catalog.cardinality(v_locked_purchase_ids) > 0 then
    for v_purchase_position in 1..pg_catalog.cardinality(v_locked_purchase_ids) loop
      perform purchase.id
      from public.purchases as purchase
      where purchase.workspace_id = p_workspace_id
        and purchase.id = v_locked_purchase_ids[v_purchase_position]
      for update;
    end loop;
  end if;

  -- Nach den Einkäufen und vor den Losen sperren und Archivstatus prüfen.
  for v_catalog_product_id in
    select candidate.catalog_product_id
    from (
      select distinct (element.value ->> 'catalog_product_id')::uuid as catalog_product_id
      from pg_catalog.jsonb_array_elements(p_lines) as element(value)
      where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
    ) as candidate
    order by candidate.catalog_product_id
  loop
    select * into v_catalog_product from public.catalog_products
      where workspace_id = p_workspace_id and id = v_catalog_product_id for update;
    if not found then
      raise exception using errcode = '22023', message = 'Der Mengenartikel ist ungültig.';
    end if;
    if v_catalog_product.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
    end if;
  end loop;

  -- A draft lot can exist while goods are being received, but it must never
  -- close an availability gap for a sale. Keep finalized inventory sellable
  -- even when another draft of the same product exists.
  for v_input_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
  loop
    v_catalog_product_id := (v_input_line ->> 'catalog_product_id')::uuid;
    v_quantity := (v_input_line ->> 'quantity')::integer;

    if coalesce((
      select pg_catalog.sum(lot.remaining_quantity)
      from public.stock_lots as lot
      join public.purchases as purchase
        on purchase.workspace_id = lot.workspace_id
        and purchase.id = lot.purchase_id
      where lot.workspace_id = p_workspace_id
        and lot.catalog_product_id = v_catalog_product_id
        and lot.remaining_quantity > 0
        and purchase.entry_status = 'finalized'
    ), 0) < v_quantity
      and exists (
        select 1
        from public.stock_lots as lot
        join public.purchases as purchase
          on purchase.workspace_id = lot.workspace_id
          and purchase.id = lot.purchase_id
        where lot.workspace_id = p_workspace_id
          and lot.catalog_product_id = v_catalog_product_id
          and lot.remaining_quantity > 0
          and purchase.entry_status is distinct from 'finalized'
      ) then
      raise exception using
        errcode = '22023',
        message = 'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.';
    end if;
  end loop;

  -- Resolve unique UUIDs first and lock the items in one stable order.
  for v_inventory_item_id in
    select candidate.inventory_item_id
    from (
      select distinct (element.value ->> 'inventory_item_id')::uuid as inventory_item_id
      from jsonb_array_elements(p_lines) as element(value)
      where nullif(trim(element.value ->> 'inventory_item_id'), '') is not null
    ) as candidate
    order by candidate.inventory_item_id
  loop
    select * into v_inventory_item
    from public.inventory_items
    where id = v_inventory_item_id
      and workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Der Einzelartikel wurde nicht gefunden.';
    end if;

    if v_inventory_item.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
    end if;

    v_source_purchase_id := v_inventory_item.purchase_id;
    if v_source_purchase_id is null and v_inventory_item.purchase_line_id is not null then
      select line.purchase_id
      into v_source_purchase_id
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.id = v_inventory_item.purchase_line_id;
    end if;

    if v_source_purchase_id is not null then
      if not (v_source_purchase_id = any(v_locked_purchase_ids)) then
        raise exception using
          errcode = '40001',
          message = 'Die Einkaufszuordnung des Einzelartikels wurde parallel geändert.';
      end if;

      select purchase.entry_status
      into v_source_purchase_status
      from public.purchases as purchase
      where purchase.workspace_id = p_workspace_id
        and purchase.id = v_source_purchase_id;

      if v_source_purchase_status is distinct from 'finalized' then
        raise exception using
          errcode = '22023',
          message = 'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.';
      end if;
    end if;

    select sale_state into v_sale_state
    from public.inventory_item_sale_states
    where inventory_item_id = v_inventory_item.id
      and workspace_id = p_workspace_id;

    if v_inventory_item.status not in ('ready', 'listed')
      or v_sale_state is distinct from 'no_active_sale' then
      raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
    end if;
  end loop;

  if jsonb_array_length(p_lines) = 1
    and jsonb_typeof(p_lines -> 0 -> 'inventory_item_id') = 'string' then
    v_header_inventory_item_id := (p_lines -> 0 ->> 'inventory_item_id')::uuid;
  end if;

  insert into public.sales (
    workspace_id,
    inventory_item_id,
    platform,
    sale_price,
    sale_price_total,
    sale_date,
    platform_fee,
    shipping_cost,
    packaging_cost,
    other_costs,
    shipping_revenue,
    shipping_mode,
    external_order_id,
    external_listing_id,
    buyer_notes,
    created_at
  ) values (
    p_workspace_id,
    v_header_inventory_item_id,
    trim(p_sale ->> 'platform'),
    0,
    0,
    (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    v_packaging_cost,
    v_other_costs,
    v_shipping_revenue,
    v_shipping_mode,
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), ''),
    pg_catalog.clock_timestamp()
  )
  returning * into v_sale;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    insert into public.sale_cost_entries (
      workspace_id, sale_id, category, description, amount
    ) values (
      p_workspace_id,
      v_sale.id,
      v_cost_entry ->> 'category',
      nullif(trim(v_cost_entry ->> 'description'), ''),
      (v_cost_entry ->> 'amount')::numeric
    );
  end loop;

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(v_input_line ->> 'catalog_product_id', ''),
        nullif(v_input_line ->> 'inventory_item_id', '')
      ) <> 1 then
      raise exception using errcode = '22023', message = 'Eine Verkaufsposition ist ungültig.';
    end if;

    v_catalog_product_id := nullif(v_input_line ->> 'catalog_product_id', '')::uuid;
    v_inventory_item_id := nullif(v_input_line ->> 'inventory_item_id', '')::uuid;
    v_quantity := (v_input_line ->> 'quantity')::integer;
    v_unit_sale_price := (v_input_line ->> 'unit_sale_price')::numeric(12, 2);
    v_line_total := v_quantity * v_unit_sale_price;
    v_line_cogs := 0;
    v_line_tax_costs := array[]::numeric[];
    v_tax_unknown := false;

    if v_catalog_product_id is not null then
      select * into v_catalog_product
      from public.catalog_products
      where id = v_catalog_product_id
        and workspace_id = p_workspace_id;

      if not found then
        raise exception using errcode = '22023', message = 'Der Mengenartikel ist ungültig.';
      end if;

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        catalog_product_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
        tax_mode
      ) values (
        p_workspace_id,
        v_sale.id,
        v_catalog_product.id,
        coalesce(nullif(trim(v_input_line ->> 'title_snapshot'), ''), v_catalog_product.title),
        v_quantity,
        v_unit_sale_price,
        v_line_total,
        0,
        v_workspace.tax_mode
      )
      returning * into v_sale_line;

      v_remaining_quantity := v_quantity;
      for v_stock_lot in
        select lot.*
        from public.stock_lots as lot
        join public.purchases as purchase
          on purchase.workspace_id = lot.workspace_id
          and purchase.id = lot.purchase_id
        where lot.workspace_id = p_workspace_id
          and lot.catalog_product_id = v_catalog_product.id
          and lot.remaining_quantity > 0
          and purchase.id = any(v_locked_purchase_ids)
          and purchase.entry_status = 'finalized'
        order by lot.received_at, lot.id
        for update of lot
      loop
        exit when v_remaining_quantity = 0;

        v_allocated_quantity := least(v_remaining_quantity, v_stock_lot.remaining_quantity);

        select
          coalesce(pg_catalog.sum(coalesce(
            allocation.active_allocated_cost,
            case
              when movement_state.restocked_quantity = allocation.quantity then 0
              when movement_state.restocked_quantity = 0 then allocation.allocated_cost
              else null
            end
          )), 0),
          pg_catalog.count(*) filter (
            where allocation.active_allocated_cost is null
              and movement_state.restocked_quantity not in (0, allocation.quantity)
          )::integer,
          coalesce(pg_catalog.sum(
            allocation.quantity - movement_state.restocked_quantity
          ), 0)::integer,
          pg_catalog.count(*) filter (
            where movement_state.restocked_quantity < 0
              or movement_state.restocked_quantity > allocation.quantity
          )::integer
        into
          v_previously_allocated_cost,
          v_ambiguous_active_cost_count,
          v_previously_active_quantity,
          v_invalid_restocked_quantity_count
        from public.sale_line_lot_allocations as allocation
        left join lateral (
          select coalesce(pg_catalog.sum(
            case
              when movement.direction = 'in' and movement.reason = 'return'
                then movement.quantity
              when movement.direction = 'out' and movement.reason = 'damage'
                then -movement.quantity
              else 0
            end
          ), 0)::integer as restocked_quantity
          from public.stock_movements as movement
          where movement.workspace_id = allocation.workspace_id
            and movement.stock_lot_id = allocation.stock_lot_id
            and movement.sale_line_id = allocation.sale_line_id
        ) as movement_state on true
        where allocation.stock_lot_id = v_stock_lot.id;

        if v_ambiguous_active_cost_count <> 0 then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten einer historischen Teilretoure müssen vor dem Verkauf geprüft werden.';
        end if;

        if v_invalid_restocked_quantity_count <> 0
          or v_stock_lot.remaining_quantity + v_previously_active_quantity
            <> v_stock_lot.received_quantity then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Mengen eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        if v_stock_lot.unit_cost is null
          or v_stock_lot.unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        -- A purchase-backed lot owns one exact cent pool. Repeated partial
        -- sales consume the leading deterministic cents from the currently
        -- remaining pool instead of rounding the average unit cost anew.
        v_lot_total_cost := pg_catalog.round(
          v_stock_lot.unit_cost * v_stock_lot.received_quantity,
          2
        );
        v_remaining_lot_cost := v_lot_total_cost - v_previously_allocated_cost;

        if v_remaining_lot_cost < 0
          or v_remaining_lot_cost <> pg_catalog.round(v_remaining_lot_cost, 2) then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        v_remaining_cost_cents := pg_catalog.round(v_remaining_lot_cost * 100)::bigint;
        v_allocation_cost := (
          v_allocated_quantity::bigint
            * (v_remaining_cost_cents / v_stock_lot.remaining_quantity::bigint)
          + least(
              v_allocated_quantity::bigint,
              pg_catalog.mod(
                v_remaining_cost_cents,
                v_stock_lot.remaining_quantity::bigint
              )
            )
        )::numeric / 100;

        v_business_unit_costs := v_stock_lot.remaining_unit_costs[1:v_allocated_quantity];
        if v_stock_lot.remaining_unit_costs is not null then
          if pg_catalog.cardinality(v_business_unit_costs) <> v_allocated_quantity then
            raise exception using errcode = '22023', message = 'Die Stückkostenfolge des Loses ist unvollständig.';
          end if;
          select pg_catalog.sum(value) into v_allocation_cost from pg_catalog.unnest(v_business_unit_costs) as value;
        end if;
        v_tax_costs := v_stock_lot.remaining_tax_unit_costs[1:v_allocated_quantity];
        if v_tax_costs is null or pg_catalog.cardinality(v_tax_costs) <> v_allocated_quantity then
          v_tax_unknown := true;
        else
          v_line_tax_costs := v_line_tax_costs || v_tax_costs;
        end if;
        update public.stock_lots
        set remaining_tax_unit_costs = v_stock_lot.remaining_tax_unit_costs[(v_allocated_quantity + 1):v_stock_lot.remaining_quantity],
            remaining_unit_costs = v_stock_lot.remaining_unit_costs[(v_allocated_quantity + 1):v_stock_lot.remaining_quantity],
            remaining_quantity = remaining_quantity - v_allocated_quantity
        where id = v_stock_lot.id
          and workspace_id = p_workspace_id;

        select greatest(
          coalesce(pg_catalog.max(allocation.consumption_sequence), 0),
          pg_catalog.count(*)
        ) + 1
        into v_consumption_sequence
        from public.sale_line_lot_allocations as allocation
        where allocation.workspace_id = p_workspace_id
          and allocation.stock_lot_id = v_stock_lot.id;

        insert into public.sale_line_lot_allocations (
          workspace_id,
          sale_line_id,
          stock_lot_id,
          quantity,
          unit_cost,
          allocated_cost,
          consumption_sequence,
          active_allocated_cost, tax_purchase_cost, tax_cost_allocations, active_tax_unit_costs, active_unit_costs
        ) values (
          p_workspace_id,
          v_sale_line.id,
          v_stock_lot.id,
          v_allocated_quantity,
          v_stock_lot.unit_cost,
          v_allocation_cost,
          v_consumption_sequence,
          v_allocation_cost,
          (select pg_catalog.sum(value) from pg_catalog.unnest(v_tax_costs) as value),
          public.tax_cost_allocations(v_tax_costs),
          v_tax_costs,
          v_business_unit_costs
        );

        insert into public.stock_movements (
          workspace_id,
          stock_lot_id,
          sale_line_id,
          direction,
          quantity,
          reason
        ) values (
          p_workspace_id,
          v_stock_lot.id,
          v_sale_line.id,
          'out',
          v_allocated_quantity,
          'sale'
        );

        v_line_cogs := v_line_cogs + v_allocation_cost;
        v_remaining_quantity := v_remaining_quantity - v_allocated_quantity;
        v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);
      end loop;

      if v_remaining_quantity <> 0 then
        raise exception using errcode = 'P0001', message = 'Nicht genügend verfügbarer Bestand';
      end if;

      update public.sale_lines
      set tax_purchase_cost = case when v_tax_unknown then null else (select pg_catalog.sum(value) from pg_catalog.unnest(v_line_tax_costs) as value) end,
          tax_cost_allocations = case when v_tax_unknown then null else public.tax_cost_allocations(v_line_tax_costs) end,
          cost_of_goods_sold = v_line_cogs
      where id = v_sale_line.id
        and workspace_id = p_workspace_id
      returning * into v_sale_line;
    else
      if v_quantity <> 1 then
        raise exception using errcode = '22023', message = 'Einzelartikel können nur einmal verkauft werden.';
      end if;

      select * into v_inventory_item
      from public.inventory_items
      where id = v_inventory_item_id
        and workspace_id = p_workspace_id
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'Der Einzelartikel wurde nicht gefunden.';
      end if;

      if v_inventory_item.status not in ('ready', 'listed')
        or exists (
          select 1
          from public.sales as existing_sale
          left join public.sale_lines as existing_line
            on existing_line.workspace_id = existing_sale.workspace_id
           and existing_line.sale_id = existing_sale.id
          where existing_sale.workspace_id = p_workspace_id
            and existing_sale.id <> v_sale.id
            and existing_sale.returned_at is null
            and existing_sale.voided_at is null
            and (
              existing_sale.inventory_item_id = v_inventory_item.id
              or existing_line.inventory_item_id = v_inventory_item.id
            )
        ) then
        raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
      end if;

      perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

      update public.inventory_items
      set status = 'sold',
          updated_at = now()
      where id = v_inventory_item.id
        and workspace_id = p_workspace_id;

      v_line_cogs := v_inventory_item.allocated_purchase_cost + coalesce((
        select pg_catalog.sum(cost.amount) from public.item_costs as cost
        where cost.inventory_item_id = v_inventory_item.id
      ), 0);

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        inventory_item_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
        tax_purchase_cost, tax_cost_allocations,
        tax_mode
      ) values (
        p_workspace_id,
        v_sale.id,
        v_inventory_item.id,
        coalesce(nullif(trim(v_input_line ->> 'title_snapshot'), ''), v_inventory_item.title),
        1,
        v_unit_sale_price,
        v_line_total,
        v_line_cogs,
        v_inventory_item.tax_purchase_cost,
        public.tax_cost_allocations(case when v_inventory_item.tax_purchase_cost is null then null else array[v_inventory_item.tax_purchase_cost] end),
        v_workspace.tax_mode
      )
      returning * into v_sale_line;
    end if;

    v_sale_total := v_sale_total + v_line_total;
    v_sale_line_ids := array_append(v_sale_line_ids, v_sale_line.id);
  end loop;

  update public.sales
  set sale_price = v_sale_total + v_shipping_revenue,
      sale_price_total = v_sale_total + v_shipping_revenue
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    p_workspace_id,
    'sale',
    v_sale.id,
    'sale_recorded',
    (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'financials', pg_catalog.jsonb_build_object(
        'before', null,
        'after', pg_catalog.jsonb_build_object(
          'item_revenue', v_sale_total,
          'buyer_shipping_revenue', v_shipping_revenue,
          'total_revenue', v_sale.sale_price_total,
          'cost_of_goods_sold', (
            select case when pg_catalog.count(*) filter (where sale_line.cost_of_goods_sold is null) > 0 then null else coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0) end
            from public.sale_lines as sale_line
            where sale_line.workspace_id = p_workspace_id
              and sale_line.sale_id = v_sale.id
          ),
          'platform_fee', v_sale.platform_fee,
          'seller_shipping_cost', v_sale.shipping_cost,
          'additional_costs', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'category', cost_entry.category,
                'description', cost_entry.description,
                'amount', cost_entry.amount
              ) order by cost_entry.id
            )
            from public.sale_cost_entries as cost_entry
            where cost_entry.workspace_id = p_workspace_id
              and cost_entry.sale_id = v_sale.id
          ), '[]'::jsonb)
        )
      ),
      'sale', pg_catalog.jsonb_build_object(
        'before', null,
        'after', pg_catalog.jsonb_build_object(
          'platform', v_sale.platform,
          'sale_date', v_sale.sale_date,
          'shipping_mode', v_sale.shipping_mode
        )
      )
    )
  )
  returning id into v_business_event_id;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'business_event_id', v_business_event_id,
    'cost_entries', coalesce((
      select jsonb_agg(to_jsonb(cost_entry) order by cost_entry.id)
      from public.sale_cost_entries as cost_entry
      where cost_entry.sale_id = v_sale.id
    ), '[]'::jsonb),
    'sale_lines', coalesce((
      select jsonb_agg(to_jsonb(sale_line) order by sale_line.id)
      from public.sale_lines as sale_line
      where sale_line.id = any(v_sale_line_ids)
    ), '[]'::jsonb),
    'lot_allocations', coalesce((
      select jsonb_agg(to_jsonb(allocation) order by allocation.id)
      from public.sale_line_lot_allocations as allocation
      where allocation.sale_line_id = any(v_sale_line_ids)
    ), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(movement) order by movement.id)
      from public.stock_movements as movement
      where movement.sale_line_id = any(v_sale_line_ids)
        and movement.reason = 'sale'
    ), '[]'::jsonb),
    'stock_quantities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stock_lot_id', stock_lot.id,
        'remaining_quantity', stock_lot.remaining_quantity
      ) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_inventory_item_archived(p_workspace_id uuid, p_item_id uuid, p_archived boolean)
 RETURNS public.inventory_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_item public.inventory_items;
  v_before timestamptz;
  v_workspace_archived_at timestamptz;
  v_sale_state text;
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
  if p_archived then
    select sale_state into v_sale_state from public.inventory_item_sale_states
      where workspace_id = p_workspace_id and inventory_item_id = p_item_id;
    if v_sale_state is null or v_sale_state not in ('sold', 'no_active_sale')
       or (v_sale_state = 'sold' and v_item.status <> 'sold')
       or (v_sale_state = 'no_active_sale' and v_item.status = 'sold') then
      raise exception using errcode = '22023', message = 'Bitte den Verkaufszustand dieses Artikels zuerst klären.';
    end if;
    if v_item.status = 'reserved' then
      raise exception using errcode = '22023', message = 'Bitte die Reservierung zuerst klären.';
    end if;
    if exists (select 1 from public.listings where workspace_id = p_workspace_id
      and inventory_item_id = p_item_id and status <> 'ended') then
      raise exception using errcode = '22023', message = 'Bitte das Inserat zuerst beenden.';
    end if;
    if exists (select 1 from public.store_order_items oi
      join public.store_orders o on o.id = oi.store_order_id
      where o.workspace_id = p_workspace_id and oi.inventory_item_id = p_item_id
        and o.status not in ('completed', 'cancelled')) then
      raise exception using errcode = '22023', message = 'Bitte den offenen Shopauftrag zuerst klären.';
    end if;
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
$function$
;

grant select on table "public"."article_media_cleanup_jobs" to "authenticated";

grant select on table "public"."article_media_cleanup_jobs" to "service_role";

grant update on table "public"."article_media_cleanup_jobs" to "service_role";


  create policy "Eigene Bildbereinigung lesen"
  on "public"."article_media_cleanup_jobs"
  as permissive
  for select
  to authenticated
using (( SELECT public.is_workspace_member(article_media_cleanup_jobs.workspace_id) AS is_workspace_member));


CREATE TRIGGER protect_catalog_product_archive_metadata BEFORE INSERT OR UPDATE ON public.catalog_products FOR EACH ROW EXECUTE FUNCTION public.protect_catalog_product_archive_metadata();

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
create trigger reject_archived_product_purchase_line before insert or update of catalog_product_id, workspace_id
on public.purchase_lines for each row execute function public.reject_archived_product_purchase_line();

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
create trigger reject_archived_product_lot_reservation before insert or update of reason, stock_lot_id, quantity, workspace_id
on public.stock_movements for each row execute function public.reject_archived_product_lot_reservation();

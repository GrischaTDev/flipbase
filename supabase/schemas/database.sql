-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. PROFILES & WORKSPACES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    tax_mode TEXT NOT NULL DEFAULT 'diff_25a',
    min_roi_percent NUMERIC NOT NULL DEFAULT 30.0,
    min_profit_amount NUMERIC NOT NULL DEFAULT 15.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
        CONSTRAINT workspace_members_user_id_profiles_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

-- ==============================================================================
-- 2. SOURCES & SUPPLIERS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'online_marketplace',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_info TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Archivieren statt loeschen: Einkaeufe verweisen auf Lieferanten, und
    -- diese Verweise muessen nachvollziehbar bleiben. Ein archivierter
    -- Lieferant verschwindet nur aus den Auswahllisten.
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ==============================================================================
-- 3. PURCHASES & PURCHASE COSTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('single', 'mystery_pack', 'lot', 'pallet')),
    title TEXT NOT NULL,
    source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    purchase_price NUMERIC NOT NULL DEFAULT 0.00,
    cost_allocation_mode TEXT NOT NULL DEFAULT 'even' CHECK (cost_allocation_mode IN ('manual', 'even', 'value_weighted')),
    original_url TEXT,
    tracking_number TEXT,
    tracking_carrier TEXT,
    tracking_status TEXT NOT NULL DEFAULT 'pending',
    receiving_status text not null default 'received' check (receiving_status in ('draft', 'ordered', 'partially_received', 'received', 'archived')),
    total_purchase_cost NUMERIC NOT NULL DEFAULT 0.00,
    estimated_delivery TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unique (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS public.purchase_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0.00,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. INVENTORY ITEMS & ITEM COSTS & MEDIA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE RESTRICT,
    category TEXT,
    title TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    condition TEXT NOT NULL DEFAULT 'used' CHECK (condition IN ('new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective')),
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'needs_review', 'researched', 'ready', 'listed', 'reserved', 'sold', 'returned', 'archived', 'defective')),
    sku TEXT,
    ean TEXT,
    description TEXT,
    allocated_purchase_cost NUMERIC NOT NULL DEFAULT 0.00,
    expected_value NUMERIC,
    tax_mode_override TEXT,
    is_public_store BOOLEAN NOT NULL DEFAULT FALSE,
    weight_g NUMERIC,
    dimension_length_cm NUMERIC,
    dimension_width_cm NUMERIC,
    dimension_height_cm NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unique (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS public.item_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0.00,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.item_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    file_name TEXT,
    file_size INTEGER,
    mime_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 5. MARKET RESEARCH & COMPARABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.market_research (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    fair_value NUMERIC,
    fast_sale_price NUMERIC,
    recommended_listing_price NUMERIC,
    confidence_score NUMERIC,
    deal_score NUMERIC,
    max_buy_price NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.research_comparables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_id UUID NOT NULL REFERENCES public.market_research(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    external_id TEXT,
    title TEXT NOT NULL,
    price NUMERIC NOT NULL,
    condition TEXT,
    is_sold BOOLEAN NOT NULL DEFAULT FALSE,
    sold_at TIMESTAMPTZ,
    listed_at TIMESTAMPTZ,
    url TEXT,
    similarity_score NUMERIC NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 6. LISTINGS & SALES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.listing_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    platform TEXT NOT NULL,
    sale_price NUMERIC NOT NULL DEFAULT 0.00,
    sale_price_total numeric(12,2),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    platform_fee NUMERIC NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC NOT NULL DEFAULT 0.00,
    packaging_cost NUMERIC NOT NULL DEFAULT 0.00,
    other_costs NUMERIC NOT NULL DEFAULT 0.00,
    external_order_id TEXT,
    external_listing_id TEXT,
    buyer_notes TEXT,
    -- Retoure: gesetzt, sobald der Verkauf zurueckgegeben wurde.
    returned_at TIMESTAMPTZ,
    refund_amount NUMERIC(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at TIMESTAMPTZ,
    voided_by UUID,
    void_reason TEXT,
    CONSTRAINT sales_void_reason_when_voided CHECK (
      (
        voided_at IS NULL
        AND voided_by IS NULL
        AND void_reason IS NULL
      )
      OR (
        voided_at IS NOT NULL
        AND voided_by IS NOT NULL
        AND NULLIF(TRIM(void_reason), '') IS NOT NULL
      )
    ),
    unique (workspace_id, id)
);

-- ==============================================================================
-- 6a. catalog, stock lots & sale lines
-- ==============================================================================

create table public.catalog_products (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    title text not null,
    brand text,
    model text,
    ean text,
    category text,
    tracking_mode text not null check (tracking_mode in ('quantity', 'individual')),
    is_public_store boolean not null default false,
    listing_price numeric(12,2) check (listing_price is null or listing_price > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (workspace_id, ean),
    unique (workspace_id, id)
);

create table public.purchase_lines (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    purchase_id uuid not null references public.purchases(id) on delete restrict,
    catalog_product_id uuid references public.catalog_products(id) on delete restrict,
    title_snapshot text not null,
    line_kind text not null check (line_kind in ('quantity', 'individual')),
    ordered_quantity integer not null check (ordered_quantity > 0 and ordered_quantity::numeric <> 'NaN'::numeric),
    received_quantity integer not null default 0 check (received_quantity >= 0 and received_quantity <= ordered_quantity and received_quantity::numeric <> 'NaN'::numeric),
    unit_purchase_price numeric not null check (unit_purchase_price <> 'NaN'::numeric and unit_purchase_price >= 0 and scale(unit_purchase_price) <= 2),
    line_total numeric not null check (line_total <> 'NaN'::numeric and line_total >= 0 and scale(line_total) <= 2),
    allocated_additional_cost numeric(12,2) not null default 0 check (allocated_additional_cost >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((line_kind = 'quantity' and catalog_product_id is not null) or line_kind = 'individual'),
    check (line_total = round(ordered_quantity * unit_purchase_price, 2)),
    unique (workspace_id, id)
);

alter table public.inventory_items
    add column if not exists purchase_line_id uuid references public.purchase_lines(id) on delete restrict;

create table public.stock_lots (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    purchase_id uuid not null references public.purchases(id) on delete restrict,
    purchase_line_id uuid not null references public.purchase_lines(id) on delete restrict,
    catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
    received_quantity integer not null check (received_quantity > 0),
    remaining_quantity integer not null check (remaining_quantity >= 0 and remaining_quantity <= received_quantity),
    unit_cost numeric(18,6) not null check (unit_cost >= 0),
    received_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (workspace_id, id)
);

create table public.sale_lines (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    sale_id uuid not null references public.sales(id) on delete restrict,
    catalog_product_id uuid references public.catalog_products(id) on delete restrict,
    inventory_item_id uuid references public.inventory_items(id) on delete restrict,
    title_snapshot text not null,
    quantity integer not null check (quantity > 0),
    unit_sale_price numeric(12,2) not null check (unit_sale_price >= 0),
    line_total numeric(12,2) not null check (line_total >= 0),
    cost_of_goods_sold numeric(12,2) not null check (cost_of_goods_sold >= 0),
    tax_mode text not null check (tax_mode in ('diff_25a', 'kleinunternehmer_19', 'regular_19')),
    created_at timestamptz not null default now(),
    check (num_nonnulls(catalog_product_id, inventory_item_id) = 1),
    unique (workspace_id, id)
);

create table public.stock_movements (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    stock_lot_id uuid not null references public.stock_lots(id) on delete restrict,
    sale_line_id uuid references public.sale_lines(id) on delete restrict,
    direction text not null check (direction in ('in', 'out')),
    quantity integer not null check (quantity > 0),
    reason text not null check (reason in ('receipt', 'sale', 'return', 'correction', 'damage', 'loss', 'reservation', 'reservation_release')),
    created_at timestamptz not null default now()
);

create table public.sale_line_lot_allocations (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    sale_line_id uuid not null references public.sale_lines(id) on delete restrict,
    stock_lot_id uuid not null references public.stock_lots(id) on delete restrict,
    quantity integer not null check (quantity > 0),
    unit_cost numeric(18,6) not null check (unit_cost >= 0),
    allocated_cost numeric(12,2) not null default 0 check (allocated_cost >= 0),
    created_at timestamptz not null default now(),
    unique (sale_line_id, stock_lot_id)
);

alter table public.inventory_items add constraint inventory_items_workspace_purchase_line_fkey
    foreign key (workspace_id, purchase_line_id) references public.purchase_lines(workspace_id, id) on delete restrict;
alter table public.purchase_lines add constraint purchase_lines_workspace_purchase_fkey
    foreign key (workspace_id, purchase_id) references public.purchases(workspace_id, id) on delete restrict;
alter table public.purchase_lines add constraint purchase_lines_workspace_catalog_product_fkey
    foreign key (workspace_id, catalog_product_id) references public.catalog_products(workspace_id, id) on delete restrict;
alter table public.stock_lots add constraint stock_lots_workspace_purchase_fkey
    foreign key (workspace_id, purchase_id) references public.purchases(workspace_id, id) on delete restrict;
alter table public.stock_lots add constraint stock_lots_workspace_purchase_line_fkey
    foreign key (workspace_id, purchase_line_id) references public.purchase_lines(workspace_id, id) on delete restrict;
alter table public.stock_lots add constraint stock_lots_workspace_catalog_product_fkey
    foreign key (workspace_id, catalog_product_id) references public.catalog_products(workspace_id, id) on delete restrict;
alter table public.sale_lines add constraint sale_lines_workspace_sale_fkey
    foreign key (workspace_id, sale_id) references public.sales(workspace_id, id) on delete restrict;
alter table public.sale_lines add constraint sale_lines_workspace_catalog_product_fkey
    foreign key (workspace_id, catalog_product_id) references public.catalog_products(workspace_id, id) on delete restrict;
alter table public.sale_lines add constraint sale_lines_workspace_inventory_item_fkey
    foreign key (workspace_id, inventory_item_id) references public.inventory_items(workspace_id, id) on delete restrict;
alter table public.stock_movements add constraint stock_movements_workspace_stock_lot_fkey
    foreign key (workspace_id, stock_lot_id) references public.stock_lots(workspace_id, id) on delete restrict;
alter table public.stock_movements add constraint stock_movements_workspace_sale_line_fkey
    foreign key (workspace_id, sale_line_id) references public.sale_lines(workspace_id, id) on delete restrict;
alter table public.sale_line_lot_allocations add constraint sale_line_lot_allocations_workspace_sale_line_fkey
    foreign key (workspace_id, sale_line_id) references public.sale_lines(workspace_id, id) on delete restrict;
alter table public.sale_line_lot_allocations add constraint sale_line_lot_allocations_workspace_stock_lot_fkey
    foreign key (workspace_id, stock_lot_id) references public.stock_lots(workspace_id, id) on delete restrict;

-- Bestehende Einzelartikel-Verkaeufe bleiben unveraendert lesbar. Fuer jeden
-- historischen Verkaufsheader ohne Position wird genau eine Positionszeile
-- angelegt; historische Mengenlose und Bewegungen werden bewusst nicht erfunden.
insert into public.sale_lines (
  workspace_id,
  sale_id,
  inventory_item_id,
  title_snapshot,
  quantity,
  unit_sale_price,
  line_total,
  cost_of_goods_sold,
  tax_mode
)
select
  sale.workspace_id,
  sale.id,
  item.id,
  item.title,
  1,
  sale.sale_price,
  sale.sale_price,
  item.allocated_purchase_cost,
  case
    when item.tax_mode_override in ('diff_25a', 'kleinunternehmer_19', 'regular_19')
      then item.tax_mode_override
    when workspace.tax_mode in ('diff_25a', 'kleinunternehmer_19', 'regular_19')
      then workspace.tax_mode
    else 'diff_25a'
  end
from public.sales as sale
join public.inventory_items as item
  on item.id = sale.inventory_item_id
 and item.workspace_id = sale.workspace_id
join public.workspaces as workspace
  on workspace.id = sale.workspace_id
where not exists (
  select 1
  from public.sale_lines as sale_line
  where sale_line.sale_id = sale.id
);

comment on table public.catalog_products is 'Artikelstamm je Workspace.';
comment on table public.purchase_lines is 'Einkaufspositionen je Workspace.';
comment on table public.stock_lots is 'Bestandslose mit FIFO-Kosten.';
comment on table public.stock_movements is 'Unveraenderbare Bestandsbewegungen.';
comment on table public.sale_lines is 'Verkaufspositionen mit Kosten-Snapshot.';
comment on table public.sale_line_lot_allocations is 'Loszuordnungen mit Kosten-Snapshot.';

create or replace view public.inventory_item_sale_states
with (security_invoker = true)
as
with active_line_sales as (
  select
    sale_line.workspace_id,
    sale_line.inventory_item_id,
    sale.id as sale_id
  from public.sale_lines as sale_line
  join public.sales as sale
    on sale.workspace_id = sale_line.workspace_id
   and sale.id = sale_line.sale_id
  where sale_line.inventory_item_id is not null
    and sale.returned_at is null
    and sale.voided_at is null
),
active_legacy_header_sales as (
  select
    sale.workspace_id,
    sale.inventory_item_id,
    sale.id as sale_id
  from public.sales as sale
  where sale.inventory_item_id is not null
    and sale.returned_at is null
    and sale.voided_at is null
),
active_item_sales as (
  select workspace_id, inventory_item_id, sale_id
  from active_line_sales
  union
  select workspace_id, inventory_item_id, sale_id
  from active_legacy_header_sales
),
active_item_sale_summaries as (
  select
    active_item_sale.workspace_id,
    active_item_sale.inventory_item_id,
    count(*) as active_sale_count,
    case
      when count(*) = 1 then (array_agg(active_item_sale.sale_id))[1]
      else null
    end as active_sale_id
  from active_item_sales as active_item_sale
  group by active_item_sale.workspace_id, active_item_sale.inventory_item_id
),
legacy_headers_without_line as (
  select distinct
    active_legacy_header_sale.workspace_id,
    active_legacy_header_sale.inventory_item_id
  from active_legacy_header_sales as active_legacy_header_sale
  where not exists (
    select 1
    from public.sale_lines as sale_line
    where sale_line.workspace_id = active_legacy_header_sale.workspace_id
      and sale_line.sale_id = active_legacy_header_sale.sale_id
      and sale_line.inventory_item_id = active_legacy_header_sale.inventory_item_id
  )
)
select
  inventory_item.id as inventory_item_id,
  inventory_item.workspace_id,
  coalesce(active_item_sale_summary.active_sale_count, 0) as active_sale_count,
  active_item_sale_summary.active_sale_id,
  case
    when coalesce(active_item_sale_summary.active_sale_count, 0) > 1
      then 'multiple_active_sales'
    when legacy_header_without_line.inventory_item_id is not null
      then 'legacy_sale_header_without_line'
    when inventory_item.status = 'sold'
      and coalesce(active_item_sale_summary.active_sale_count, 0) = 0
      then 'legacy_sold_unverified'
    when inventory_item.status <> 'sold'
      and coalesce(active_item_sale_summary.active_sale_count, 0) > 0
      then 'sale_status_conflict'
    when active_item_sale_summary.active_sale_count = 1 then 'sold'
    else 'no_active_sale'
  end as sale_state
from public.inventory_items as inventory_item
left join active_item_sale_summaries as active_item_sale_summary
  on active_item_sale_summary.workspace_id = inventory_item.workspace_id
 and active_item_sale_summary.inventory_item_id = inventory_item.id
left join legacy_headers_without_line as legacy_header_without_line
  on legacy_header_without_line.workspace_id = inventory_item.workspace_id
 and legacy_header_without_line.inventory_item_id = inventory_item.id;

comment on view public.inventory_item_sale_states is
  'Klassifiziert den bestandswirksamen Verkaufszustand sichtbarer Einzelartikel.';

create table public.inventory_reconciliation_events (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete restrict,
    inventory_item_id uuid not null,
    actor_id uuid not null references auth.users(id) on delete restrict,
    event_type text not null check (event_type in ('restore_stock', 'record_legacy_sale')),
    previous_status text not null,
    new_status text not null,
    reason text not null check (nullif(trim(reason), '') is not null),
    created_at timestamptz not null default now(),
    foreign key (workspace_id, inventory_item_id)
      references public.inventory_items(workspace_id, id) on delete restrict
);

comment on table public.inventory_reconciliation_events is
  'Unveraenderliches Journal fuer ausdrueckliche Klaerungen historischer Inventarzustaende.';

create index inventory_reconciliation_events_workspace_id_idx
  on public.inventory_reconciliation_events(workspace_id);
create index inventory_reconciliation_events_inventory_item_id_idx
  on public.inventory_reconciliation_events(inventory_item_id);

-- ==============================================================================
-- 7. ACTIVITY LOGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. RETURNS & CREDIT NOTES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    credit_note_number TEXT NOT NULL,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT NOT NULL,
    refund_amount NUMERIC NOT NULL DEFAULT 0.00,
    is_full_refund BOOLEAN NOT NULL DEFAULT TRUE,
    restock_action TEXT NOT NULL DEFAULT 'restock_ready',
    buyer_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 9. INVOICES, INVOICE ITEMS & EMAIL CONFIRMATIONS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    order_number TEXT NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
    seller JSONB NOT NULL DEFAULT '{}'::jsonb,
    buyer JSONB NOT NULL DEFAULT '{}'::jsonb,
    subtotal NUMERIC NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC NOT NULL DEFAULT 0.00,
    total NUMERIC NOT NULL DEFAULT 0.00,
    tax_mode TEXT NOT NULL DEFAULT 'diff_25a',
    tax_clause TEXT,
    payment_method TEXT,
    payment_status TEXT NOT NULL DEFAULT 'paid',
    payment_due_date DATE,
    notes TEXT,
    sale_id UUID REFERENCES public.sales(id) ON DELETE RESTRICT,
    store_order_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    sku TEXT,
    title TEXT NOT NULL,
    condition TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL DEFAULT 0.00,
    total_price NUMERIC NOT NULL DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS public.email_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'sent',
    invoice_number TEXT,
    order_number TEXT
);

-- ==============================================================================
-- 10. SHIPPING ORDERS & CARRIER CONFIGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.shipping_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.sales(id) ON DELETE RESTRICT,
    order_number TEXT NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    platform TEXT NOT NULL,
    item_title TEXT NOT NULL,
    item_sku TEXT,
    item_condition TEXT,
    sale_price NUMERIC NOT NULL DEFAULT 0.00,
    customer JSONB NOT NULL DEFAULT '{}'::jsonb,
    carrier TEXT NOT NULL DEFAULT 'dhl',
    package_type TEXT NOT NULL,
    tracking_number TEXT,
    tracking_url TEXT,
    status TEXT NOT NULL DEFAULT 'ready_to_pack',
    notes TEXT,
    label_price NUMERIC,
    carrier_transaction_id TEXT,
    is_bundled BOOLEAN NOT NULL DEFAULT FALSE,
    bundled_order_ids TEXT[] DEFAULT '{}',
    bundled_item_titles TEXT[] DEFAULT '{}',
    shipped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    bundled_orders_snapshot JSONB
);

CREATE TABLE IF NOT EXISTS public.carrier_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
    dhl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    dhl_ekp TEXT,
    dhl_api_key TEXT,
    hermes_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    hermes_client_id TEXT,
    hermes_api_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 11. STORE ORDERS, ORDER ITEMS & SETTINGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.store_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    customer JSONB NOT NULL DEFAULT '{}'::jsonb,
    subtotal NUMERIC NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC NOT NULL DEFAULT 0.00,
    total NUMERIC NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
    payment_status TEXT NOT NULL DEFAULT 'pending',
    payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_order_id UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE RESTRICT,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
    catalog_product_id UUID REFERENCES public.catalog_products(id) ON DELETE RESTRICT,
    item_title TEXT NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0.00,
    quantity INTEGER NOT NULL DEFAULT 1,
    check (num_nonnulls(catalog_product_id, inventory_item_id) = 1)
);

alter table public.store_order_items
  add column if not exists catalog_product_id uuid references public.catalog_products(id) on delete restrict;

alter table public.invoices
  drop constraint if exists invoices_store_order_id_fkey,
  add constraint invoices_store_order_id_fkey foreign key (store_order_id)
    references public.store_orders(id) on delete restrict;

CREATE TABLE IF NOT EXISTS public.store_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
    store_name TEXT NOT NULL DEFAULT 'Flipbase Store',
    tagline TEXT,
    banner_url TEXT,
    shipping_flat_rate NUMERIC NOT NULL DEFAULT 4.99,
    free_shipping_threshold NUMERIC NOT NULL DEFAULT 50.00,
    currency TEXT NOT NULL DEFAULT 'EUR',
    payments JSONB NOT NULL DEFAULT '{}'::jsonb,
    imprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    notice_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 12. BANK RECONCILIATION
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    value_date DATE,
    counterparty_name TEXT NOT NULL,
    counterparty_iban TEXT,
    purpose TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    source_format TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    match_json JSONB,
    booked_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 13. PRICE TRACKER & COMPETITOR RADAR
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.price_tracked_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    category TEXT,
    current_our_price NUMERIC NOT NULL DEFAULT 0.00,
    current_market_average NUMERIC NOT NULL DEFAULT 0.00,
    current_market_lowest NUMERIC NOT NULL DEFAULT 0.00,
    recommended_price NUMERIC NOT NULL DEFAULT 0.00,
    lowest_competitor_url TEXT,
    lowest_competitor_title TEXT,
    lowest_competitor_platform TEXT,
    price_trend TEXT NOT NULL DEFAULT 'stable',
    price_difference_percent NUMERIC NOT NULL DEFAULT 0.00,
    price_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    alert_triggered TEXT NOT NULL DEFAULT 'none',
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_tracking_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 14. NOTIFICATIONS & WEBHOOKS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'system',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.webhook_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
    discord_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    discord_webhook_url TEXT,
    telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,
    custom_webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    custom_webhook_url TEXT,
    notify_on_sale BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_purchase BOOLEAN NOT NULL DEFAULT TRUE,
    notify_on_low_margin BOOLEAN NOT NULL DEFAULT TRUE,
    sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 15. OFFLINE SOURCING & CASH WALLET
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.offline_purchase_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    purchase_price NUMERIC NOT NULL DEFAULT 0.00,
    estimated_resale_price NUMERIC NOT NULL DEFAULT 0.00,
    location_name TEXT NOT NULL DEFAULT 'Flohmarkt',
    category TEXT,
    condition TEXT,
    notes TEXT,
    photo_data_url TEXT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_wallet_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    start_cash NUMERIC NOT NULL DEFAULT 0.00,
    current_cash NUMERIC NOT NULL DEFAULT 0.00,
    total_spent NUMERIC NOT NULL DEFAULT 0.00,
    estimated_total_resale NUMERIC NOT NULL DEFAULT 0.00,
    items_count INTEGER NOT NULL DEFAULT 0,
    location_name TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 16. TAX ADVISOR CONFIGURATION
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tax_advisor_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
    firm_name TEXT,
    advisor_email TEXT,
    client_number TEXT,
    consultant_number TEXT,
    skr_standard TEXT NOT NULL DEFAULT 'SKR03',
    auto_send_on_first_of_month BOOLEAN NOT NULL DEFAULT FALSE,
    include_diff_tax_journal BOOLEAN NOT NULL DEFAULT TRUE,
    include_datev_booking_stack BOOLEAN NOT NULL DEFAULT TRUE,
    include_pdf_report BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 17. MARKET RESEARCH QUERY LOGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.research_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ebay_sold,kleinanzeigen,vinted',
    result_count INTEGER NOT NULL DEFAULT 0,
    min_price NUMERIC NOT NULL DEFAULT 0.00,
    max_price NUMERIC NOT NULL DEFAULT 0.00,
    avg_price NUMERIC NOT NULL DEFAULT 0.00,
    median_price NUMERIC NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- ROW LEVEL SECURITY
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
alter table public.inventory_reconciliation_events enable row level security;
ALTER TABLE public.item_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_comparables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
alter table public.catalog_products enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.stock_lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sale_lines enable row level security;
alter table public.sale_line_lot_allocations enable row level security;
revoke all on table public.catalog_products, public.purchase_lines, public.stock_lots,
    public.stock_movements, public.sale_lines, public.sale_line_lot_allocations
    from anon, public;
revoke all on table public.catalog_products, public.purchase_lines, public.stock_lots,
    public.stock_movements, public.sale_lines, public.sale_line_lot_allocations
    from authenticated;
grant select, insert, update, delete on table public.catalog_products, public.purchase_lines
    to authenticated;
grant select on table public.stock_lots, public.stock_movements, public.sale_lines,
    public.sale_line_lot_allocations to authenticated;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_tracked_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_purchase_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_wallet_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_advisor_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_queries ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- HELPER FUNCTIONS
-- ------------------------------------------------------------------------------

create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_admin(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

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

  insert into public.workspaces (name)
  values (coalesce(nullif(trim(p_name), ''), 'Mein Workspace'))
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, caller_id, 'owner');

  return new_ws_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_ws_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', 'Reseller'));

  insert into public.workspaces (name, min_roi_percent, min_profit_amount)
  values ('Mein Workspace', 30.0, 15.0)
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, new.id, 'owner');

  insert into public.sources (workspace_id, name, is_default)
  values
    (new_ws_id, 'Kleinanzeigen', true),
    (new_ws_id, 'eBay', false),
    (new_ws_id, 'Vinted', false),
    (new_ws_id, 'Flohmarkt', false),
    (new_ws_id, 'meinePacks', false),
    (new_ws_id, 'B-Stock / Retouren', false),
    (new_ws_id, 'Grosshaendler / Palette', false);

  return new;
end;
$$;

create or replace function public.prevent_workspace_with_business_data_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.purchases where workspace_id = old.id)
    or exists (select 1 from public.inventory_items where workspace_id = old.id)
    or exists (select 1 from public.sales where workspace_id = old.id)
    or exists (select 1 from public.inventory_reconciliation_events where workspace_id = old.id)
    or exists (select 1 from public.activity_logs where workspace_id = old.id)
    or exists (select 1 from public.returns where workspace_id = old.id)
    or exists (select 1 from public.invoices where workspace_id = old.id)
    or exists (select 1 from public.email_confirmations where workspace_id = old.id)
    or exists (select 1 from public.shipping_orders where workspace_id = old.id)
    or exists (select 1 from public.store_orders where workspace_id = old.id)
    or exists (select 1 from public.bank_transactions where workspace_id = old.id)
    or exists (select 1 from public.offline_purchase_entries where workspace_id = old.id)
    or exists (select 1 from public.cash_wallet_sessions where workspace_id = old.id) then
    raise exception using
      errcode = 'P0001',
      message = 'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.';
  end if;

  return old;
end;
$$;

create trigger prevent_workspace_with_business_data_deletion
before delete on public.workspaces
for each row execute function public.prevent_workspace_with_business_data_deletion();

-- ------------------------------------------------------------------------------
-- POLICIES
-- ------------------------------------------------------------------------------

-- profiles
create policy "Eigenes Profil lesen"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Eigenes Profil aendern"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- workspaces
create policy "Workspace lesen"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

create policy "Workspace aendern"
on public.workspaces for update to authenticated
using (public.is_workspace_admin(id))
with check (public.is_workspace_admin(id));

create policy "Workspace loeschen"
on public.workspaces for delete to authenticated
using (public.is_workspace_admin(id));

-- workspace_members
create policy "Mitgliedschaften lesen"
on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Mitglied hinzufuegen"
on public.workspace_members for insert to authenticated
with check (public.is_workspace_admin(workspace_id));

create policy "Mitgliedsrolle aendern"
on public.workspace_members for update to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "Mitglied entfernen"
on public.workspace_members for delete to authenticated
using (
  public.is_workspace_admin(workspace_id)
  or user_id = (select auth.uid())
);

-- sources
create policy "Quellen lesen"
on public.sources for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Quelle anlegen"
on public.sources for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "Quelle aendern"
on public.sources for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Quelle loeschen"
on public.sources for delete to authenticated
using (public.is_workspace_member(workspace_id));

-- suppliers
create policy "Lieferanten lesen"
on public.suppliers for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Lieferant anlegen"
on public.suppliers for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "Lieferant aendern"
on public.suppliers for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Lieferant loeschen"
on public.suppliers for delete to authenticated
using (public.is_workspace_member(workspace_id));

-- purchases
create policy "Einkaeufe lesen"
on public.purchases for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Einkauf anlegen"
on public.purchases for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "Einkauf aendern"
on public.purchases for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Einkauf loeschen"
on public.purchases for delete to authenticated
using (public.is_workspace_member(workspace_id));

-- purchase_costs
create policy "Einkaufsnebenkosten lesen"
on public.purchase_costs for select to authenticated
using (
  exists (
    select 1 from public.purchases p
    where p.id = purchase_id and public.is_workspace_member(p.workspace_id)
  )
);

create policy "Einkaufsnebenkosten anlegen"
on public.purchase_costs for insert to authenticated
with check (
  exists (
    select 1 from public.purchases p
    where p.id = purchase_id and public.is_workspace_member(p.workspace_id)
  )
);

create policy "Einkaufsnebenkosten aendern"
on public.purchase_costs for update to authenticated
using (
  exists (
    select 1 from public.purchases p
    where p.id = purchase_id and public.is_workspace_member(p.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.purchases p
    where p.id = purchase_id and public.is_workspace_member(p.workspace_id)
  )
);

create policy "Einkaufsnebenkosten loeschen"
on public.purchase_costs for delete to authenticated
using (
  exists (
    select 1 from public.purchases p
    where p.id = purchase_id and public.is_workspace_member(p.workspace_id)
  )
);

-- inventory_items
create policy "Inventar lesen"
on public.inventory_items for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Artikel anlegen"
on public.inventory_items for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "Artikel aendern"
on public.inventory_items for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Artikel loeschen"
on public.inventory_items for delete to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Inventarklaerungen lesen"
  on public.inventory_reconciliation_events for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- item_costs
create policy "Artikelkosten lesen"
on public.item_costs for select to authenticated
using (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

create policy "Artikelkosten anlegen"
on public.item_costs for insert to authenticated
with check (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

create policy "Artikelkosten aendern"
on public.item_costs for update to authenticated
using (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

create policy "Artikelkosten loeschen"
on public.item_costs for delete to authenticated
using (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

-- item_media
create policy "Artikelbilder lesen"
on public.item_media for select to authenticated
using (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

create policy "Artikelbild anlegen"
on public.item_media for insert to authenticated
with check (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

create policy "Artikelbild aendern"
on public.item_media for update to authenticated
using (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

create policy "Artikelbild loeschen"
on public.item_media for delete to authenticated
using (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

-- market_research
create policy "Recherchen lesen"
on public.market_research for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Recherche anlegen"
on public.market_research for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "Recherche aendern"
on public.market_research for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Recherche loeschen"
on public.market_research for delete to authenticated
using (public.is_workspace_member(workspace_id));

-- research_comparables
create policy "Vergleichsangebote lesen"
on public.research_comparables for select to authenticated
using (
  exists (
    select 1 from public.market_research r
    where r.id = research_id and public.is_workspace_member(r.workspace_id)
  )
);

create policy "Vergleichsangebot anlegen"
on public.research_comparables for insert to authenticated
with check (
  exists (
    select 1 from public.market_research r
    where r.id = research_id and public.is_workspace_member(r.workspace_id)
  )
);

create policy "Vergleichsangebot aendern"
on public.research_comparables for update to authenticated
using (
  exists (
    select 1 from public.market_research r
    where r.id = research_id and public.is_workspace_member(r.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.market_research r
    where r.id = research_id and public.is_workspace_member(r.workspace_id)
  )
);

create policy "Vergleichsangebot loeschen"
on public.research_comparables for delete to authenticated
using (
  exists (
    select 1 from public.market_research r
    where r.id = research_id and public.is_workspace_member(r.workspace_id)
  )
);

-- listing_drafts
create policy "Inseratsentwuerfe lesen"
on public.listing_drafts for select to authenticated
using (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

create policy "Inseratsentwurf anlegen"
on public.listing_drafts for insert to authenticated
with check (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

create policy "Inseratsentwurf aendern"
on public.listing_drafts for update to authenticated
using (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

create policy "Inseratsentwurf loeschen"
on public.listing_drafts for delete to authenticated
using (
  exists (
    select 1 from public.inventory_items i
    where i.id = inventory_item_id and public.is_workspace_member(i.workspace_id)
  )
);

-- sales
create policy "Verkaeufe lesen"
on public.sales for select to authenticated
using (public.is_workspace_member(workspace_id));

-- catalog_products
create policy "Artikelstamm lesen" on public.catalog_products for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Artikelstamm anlegen" on public.catalog_products for insert to authenticated
with check (public.is_workspace_member(workspace_id));
create policy "Artikelstamm aendern" on public.catalog_products for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Artikelstamm loeschen" on public.catalog_products for delete to authenticated
using (public.is_workspace_member(workspace_id));

-- purchase_lines
create policy "Einkaufspositionen lesen" on public.purchase_lines for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Einkaufspositionen anlegen" on public.purchase_lines for insert to authenticated
with check (public.is_workspace_member(workspace_id));
create policy "Einkaufspositionen aendern" on public.purchase_lines for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Einkaufspositionen loeschen" on public.purchase_lines for delete to authenticated
using (public.is_workspace_member(workspace_id));

-- stock_lots
create policy "Bestandslose lesen" on public.stock_lots for select to authenticated
using (public.is_workspace_member(workspace_id));

-- stock_movements
create policy "Bestandsbewegungen lesen" on public.stock_movements for select to authenticated
using (public.is_workspace_member(workspace_id));

-- sale_lines
create policy "Verkaufspositionen lesen" on public.sale_lines for select to authenticated
using (public.is_workspace_member(workspace_id));

-- sale_line_lot_allocations
create policy "Loszuordnungen lesen" on public.sale_line_lot_allocations for select to authenticated
using (public.is_workspace_member(workspace_id));

-- activity_logs
create policy "Verlauf lesen"
on public.activity_logs for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Verlaufseintrag anlegen"
on public.activity_logs for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "Verlaufseintrag loeschen"
on public.activity_logs for delete to authenticated
using (public.is_workspace_member(workspace_id));

-- returns
CREATE POLICY returns_select ON public.returns FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
-- invoices
CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY invoices_update ON public.invoices FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
-- invoice_items
CREATE POLICY invoice_items_select ON public.invoice_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_workspace_member(i.workspace_id)));
CREATE POLICY invoice_items_insert ON public.invoice_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_workspace_member(i.workspace_id)));
CREATE POLICY invoice_items_update ON public.invoice_items FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_workspace_member(i.workspace_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_workspace_member(i.workspace_id)));
-- email_confirmations
CREATE POLICY email_confirmations_select ON public.email_confirmations FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY email_confirmations_insert ON public.email_confirmations FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY email_confirmations_update ON public.email_confirmations FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY email_confirmations_delete ON public.email_confirmations FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- shipping_orders
CREATE POLICY shipping_orders_select ON public.shipping_orders FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY shipping_orders_insert ON public.shipping_orders FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY shipping_orders_update ON public.shipping_orders FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY shipping_orders_delete ON public.shipping_orders FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- carrier_configs
CREATE POLICY carrier_configs_select ON public.carrier_configs FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY carrier_configs_insert ON public.carrier_configs FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY carrier_configs_update ON public.carrier_configs FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY carrier_configs_delete ON public.carrier_configs FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- store_orders
CREATE POLICY store_orders_select ON public.store_orders FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY store_orders_insert ON public.store_orders FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY store_orders_update ON public.store_orders FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
-- store_order_items
CREATE POLICY store_order_items_select ON public.store_order_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.store_orders o WHERE o.id = store_order_items.store_order_id AND public.is_workspace_member(o.workspace_id)));
CREATE POLICY store_order_items_insert ON public.store_order_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.store_orders o WHERE o.id = store_order_items.store_order_id AND public.is_workspace_member(o.workspace_id)));
CREATE POLICY store_order_items_update ON public.store_order_items FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.store_orders o WHERE o.id = store_order_items.store_order_id AND public.is_workspace_member(o.workspace_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.store_orders o WHERE o.id = store_order_items.store_order_id AND public.is_workspace_member(o.workspace_id)));
-- store_settings
CREATE POLICY store_settings_select ON public.store_settings FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY store_settings_insert ON public.store_settings FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY store_settings_update ON public.store_settings FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY store_settings_delete ON public.store_settings FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- bank_transactions
CREATE POLICY bank_transactions_select ON public.bank_transactions FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY bank_transactions_insert ON public.bank_transactions FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY bank_transactions_update ON public.bank_transactions FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY bank_transactions_delete ON public.bank_transactions FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- price_tracked_items
CREATE POLICY price_tracked_items_select ON public.price_tracked_items FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY price_tracked_items_insert ON public.price_tracked_items FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY price_tracked_items_update ON public.price_tracked_items FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY price_tracked_items_delete ON public.price_tracked_items FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- app_notifications
CREATE POLICY app_notifications_select ON public.app_notifications FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY app_notifications_insert ON public.app_notifications FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY app_notifications_update ON public.app_notifications FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY app_notifications_delete ON public.app_notifications FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- webhook_configs
CREATE POLICY webhook_configs_select ON public.webhook_configs FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY webhook_configs_insert ON public.webhook_configs FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY webhook_configs_update ON public.webhook_configs FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY webhook_configs_delete ON public.webhook_configs FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- offline_purchase_entries
CREATE POLICY offline_purchase_entries_select ON public.offline_purchase_entries FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY offline_purchase_entries_insert ON public.offline_purchase_entries FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY offline_purchase_entries_update ON public.offline_purchase_entries FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY offline_purchase_entries_delete ON public.offline_purchase_entries FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- cash_wallet_sessions
CREATE POLICY cash_wallet_sessions_select ON public.cash_wallet_sessions FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY cash_wallet_sessions_insert ON public.cash_wallet_sessions FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY cash_wallet_sessions_update ON public.cash_wallet_sessions FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY cash_wallet_sessions_delete ON public.cash_wallet_sessions FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- tax_advisor_configs
CREATE POLICY tax_advisor_configs_select ON public.tax_advisor_configs FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY tax_advisor_configs_insert ON public.tax_advisor_configs FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY tax_advisor_configs_update ON public.tax_advisor_configs FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY tax_advisor_configs_delete ON public.tax_advisor_configs FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- research_queries
CREATE POLICY research_queries_select ON public.research_queries FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY research_queries_insert ON public.research_queries FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY research_queries_delete ON public.research_queries FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ------------------------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------------------------

create index if not exists idx_workspace_members_user_id
  on public.workspace_members (user_id);
create index if not exists idx_workspace_members_workspace_user
  on public.workspace_members (workspace_id, user_id);
create index if not exists idx_sources_workspace_id
  on public.sources (workspace_id);
create index if not exists idx_suppliers_workspace_id
  on public.suppliers (workspace_id);
create index if not exists idx_purchases_workspace_id
  on public.purchases (workspace_id);
create index if not exists idx_purchase_costs_purchase_id
  on public.purchase_costs (purchase_id);
create index if not exists idx_inventory_items_workspace_id
  on public.inventory_items (workspace_id);
create index if not exists idx_inventory_items_purchase_id
  on public.inventory_items (purchase_id);
create index if not exists idx_inventory_items_purchase_line_id
  on public.inventory_items (purchase_line_id);
create index if not exists idx_item_costs_item_id
  on public.item_costs (inventory_item_id);
create index if not exists idx_item_media_item_id
  on public.item_media (inventory_item_id);
create index if not exists idx_market_research_workspace_id
  on public.market_research (workspace_id);
create index if not exists idx_research_comparables_research_id
  on public.research_comparables (research_id);
create index if not exists idx_listing_drafts_item_id
  on public.listing_drafts (inventory_item_id);
create index if not exists idx_sales_workspace_id
  on public.sales (workspace_id);
create index if not exists idx_sales_item_id
  on public.sales (inventory_item_id);
create index if not exists idx_catalog_products_workspace_id
  on public.catalog_products (workspace_id);
create index if not exists idx_purchase_lines_workspace_id
  on public.purchase_lines (workspace_id);
create index if not exists idx_purchase_lines_purchase_id
  on public.purchase_lines (purchase_id);
create index if not exists idx_purchase_lines_catalog_product_id
  on public.purchase_lines (catalog_product_id);
create index if not exists idx_stock_lots_workspace_id
  on public.stock_lots (workspace_id);
create index if not exists idx_stock_lots_purchase_id
  on public.stock_lots (purchase_id);
create index if not exists idx_stock_lots_purchase_line_id
  on public.stock_lots (purchase_line_id);
create index if not exists idx_stock_lots_catalog_product_id
  on public.stock_lots (catalog_product_id);
create index if not exists idx_stock_lots_workspace_catalog_received
  on public.stock_lots (workspace_id, catalog_product_id, received_at, id);
create index if not exists idx_stock_movements_workspace_id
  on public.stock_movements (workspace_id);
create index if not exists idx_stock_movements_stock_lot_id
  on public.stock_movements (stock_lot_id);
create index if not exists idx_stock_movements_sale_line_id
  on public.stock_movements (sale_line_id);
create index if not exists idx_stock_movements_workspace_created
  on public.stock_movements (workspace_id, created_at desc);
create index if not exists idx_sale_lines_workspace_id
  on public.sale_lines (workspace_id);
create index if not exists idx_sale_lines_sale_id
  on public.sale_lines (sale_id);
create index if not exists idx_sale_lines_catalog_product_id
  on public.sale_lines (catalog_product_id);
create index if not exists idx_sale_lines_inventory_item_id
  on public.sale_lines (inventory_item_id);
create index if not exists idx_sale_line_lot_allocations_workspace_id
  on public.sale_line_lot_allocations (workspace_id);
create index if not exists idx_sale_line_lot_allocations_sale_line_id
  on public.sale_line_lot_allocations (sale_line_id);
create index if not exists idx_sale_line_lot_allocations_stock_lot_id
  on public.sale_line_lot_allocations (stock_lot_id);
create index if not exists idx_activity_logs_workspace_id
  on public.activity_logs (workspace_id);
create index if not exists idx_activity_logs_item_id
  on public.activity_logs (inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_returns_workspace_id ON public.returns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_item_id ON public.returns(inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_id ON public.invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
create unique index if not exists idx_invoices_workspace_sale
  on public.invoices (workspace_id, sale_id)
  where sale_id is not null;
create unique index if not exists idx_invoices_workspace_store_order
  on public.invoices (workspace_id, store_order_id)
  where store_order_id is not null;
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_email_confirmations_workspace_id ON public.email_confirmations(workspace_id);

CREATE INDEX IF NOT EXISTS idx_shipping_orders_workspace_id ON public.shipping_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_shipping_orders_sale_id ON public.shipping_orders(sale_id);
CREATE INDEX IF NOT EXISTS idx_carrier_configs_workspace_id ON public.carrier_configs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_store_orders_workspace_id ON public.store_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_store_order_items_order_id ON public.store_order_items(store_order_id);
CREATE INDEX IF NOT EXISTS idx_store_order_items_catalog_product_id ON public.store_order_items(catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_store_settings_workspace_id ON public.store_settings(workspace_id);

create unique index if not exists idx_store_orders_workspace_order_number
  on public.store_orders (workspace_id, order_number);
create unique index if not exists idx_sales_store_order_item
  on public.sales (workspace_id, external_order_id, inventory_item_id, platform)
  where external_order_id is not null;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_workspace_id ON public.bank_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_price_tracked_items_workspace_id ON public.price_tracked_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_app_notifications_workspace_id ON public.app_notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_workspace_id ON public.webhook_configs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_offline_purchase_entries_workspace_id ON public.offline_purchase_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cash_wallet_sessions_workspace_id ON public.cash_wallet_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tax_advisor_configs_workspace_id ON public.tax_advisor_configs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_research_queries_workspace_id ON public.research_queries(workspace_id);

-- ------------------------------------------------------------------------------
-- STORAGE BUCKET
-- ------------------------------------------------------------------------------

update storage.buckets
set public = false
where id = 'item-media';

create policy "Artikelmedien lesen"
on storage.objects for select to authenticated
using (bucket_id = 'item-media');

create policy "Artikelmedien hochladen"
on storage.objects for insert to authenticated
with check (bucket_id = 'item-media');

create policy "Artikelmedien aendern"
on storage.objects for update to authenticated
using (bucket_id = 'item-media')
with check (bucket_id = 'item-media');

create policy "Artikelmedien loeschen"
on storage.objects for delete to authenticated
using (bucket_id = 'item-media');

-- ------------------------------------------------------------------------------
-- COMMENTS
-- ------------------------------------------------------------------------------

comment on function public.is_workspace_member(uuid) is
  'Prueft, ob der aufrufende Nutzer Mitglied des Workspace ist. Basis aller RLS-Policies.';
comment on function public.is_workspace_admin(uuid) is
  'Prueft, ob der aufrufende Nutzer den Workspace verwalten darf (Rolle owner oder admin).';
comment on function public.create_workspace(text) is
  'Legt einen Workspace an und traegt den Aufrufer als Eigentuemer ein. Einziger erlaubter Weg, einen Workspace zu erzeugen.';

comment on column public.shipping_orders.bundled_orders_snapshot is
  'Atomarer Snapshot der ursprünglichen Sendungen eines Sammelpakets für dessen Wiederherstellung.';

-- ------------------------------------------------------------------------------
-- ATOMARE SAMMELPAKETE
-- ------------------------------------------------------------------------------

create or replace function public.bundle_shipping_orders(
  p_workspace_id uuid,
  p_order_ids uuid[],
  p_order_number text,
  p_order_date date,
  p_platform text,
  p_item_title text,
  p_item_sku text,
  p_item_condition text,
  p_sale_price numeric,
  p_customer jsonb,
  p_carrier text,
  p_package_type text,
  p_bundled_item_titles text[],
  p_notes text
)
returns public.shipping_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_bundled_order public.shipping_orders;
  v_found_count integer;
  v_non_null_sale_count integer;
  v_distinct_sale_count integer;
  v_sale_id uuid;
  v_sale_ids uuid[];
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if coalesce(cardinality(p_order_ids), 0) < 2
    or cardinality(p_order_ids) <> (select count(distinct id) from unnest(p_order_ids) as id) then
    raise exception using errcode = '22023', message = 'Ein Sammelpaket braucht mindestens zwei unterschiedliche Sendungen.';
  end if;

  with source_orders as (
    select *
    from public.shipping_orders
    where workspace_id = p_workspace_id
      and id = any(p_order_ids)
    for update
  )
  select
    count(*),
    coalesce(jsonb_agg(to_jsonb(source_orders)), '[]'::jsonb),
    count(sale_id),
    count(distinct sale_id),
    array_agg(sale_id)
  into v_found_count, v_snapshot, v_non_null_sale_count, v_distinct_sale_count, v_sale_ids
  from source_orders;

  if v_found_count <> cardinality(p_order_ids) then
    raise no_data_found using message = 'Mindestens eine Sendung wurde nicht gefunden.';
  end if;

  if v_non_null_sale_count <> v_found_count or v_distinct_sale_count <> 1 then
    v_sale_id := null;
  else
    v_sale_id := v_sale_ids[1];
  end if;

  insert into public.shipping_orders (
    workspace_id,
    sale_id,
    order_number,
    order_date,
    platform,
    item_title,
    item_sku,
    item_condition,
    sale_price,
    customer,
    carrier,
    package_type,
    status,
    notes,
    is_bundled,
    bundled_order_ids,
    bundled_item_titles,
    bundled_orders_snapshot
  )
  values (
    p_workspace_id,
    v_sale_id,
    p_order_number,
    p_order_date,
    p_platform,
    p_item_title,
    p_item_sku,
    p_item_condition,
    p_sale_price,
    p_customer,
    p_carrier,
    p_package_type,
    'ready_to_pack',
    p_notes,
    true,
    p_order_ids::text[],
    p_bundled_item_titles,
    v_snapshot
  )
  returning * into v_bundled_order;

  delete from public.shipping_orders
  where workspace_id = p_workspace_id
    and id = any(p_order_ids);

  return v_bundled_order;
end;
$$;

create or replace function public.unbundle_shipping_order(
  p_workspace_id uuid,
  p_bundled_order_id uuid
)
returns setof public.shipping_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_expected_ids text[];
  v_snapshot_ids text[];
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  select bundled_orders_snapshot, bundled_order_ids
  into v_snapshot, v_expected_ids
  from public.shipping_orders
  where id = p_bundled_order_id
    and workspace_id = p_workspace_id
    and is_bundled = true
  for update;

  if not found then
    raise no_data_found using message = 'Das Sammelpaket wurde nicht gefunden.';
  end if;

  if jsonb_typeof(v_snapshot) <> 'array' or jsonb_array_length(v_snapshot) = 0 then
    raise exception using errcode = '22023', message = 'Das Sammelpaket enthält keinen wiederherstellbaren Snapshot.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_snapshot) as snapshot(order_row)
    where jsonb_typeof(snapshot.order_row) <> 'object'
      or jsonb_typeof(snapshot.order_row -> 'id') <> 'string'
      or jsonb_typeof(snapshot.order_row -> 'workspace_id') <> 'string'
      or snapshot.order_row ->> 'workspace_id' <> p_workspace_id::text
      or not (snapshot.order_row ->> 'id' = any(v_expected_ids))
  ) then
    raise exception using errcode = '22023', message = 'Der Snapshot des Sammelpakets ist ungültig.';
  end if;

  select array_agg(snapshot.order_row ->> 'id' order by snapshot.order_row ->> 'id')
  into v_snapshot_ids
  from jsonb_array_elements(v_snapshot) as snapshot(order_row);

  if v_snapshot_ids is distinct from (
    select array_agg(expected_id order by expected_id)
    from unnest(v_expected_ids) as expected_id
  ) then
    raise exception using errcode = '22023', message = 'Der Snapshot passt nicht zu den gebündelten Sendungen.';
  end if;

  delete from public.shipping_orders
  where id = p_bundled_order_id
    and workspace_id = p_workspace_id;

  return query
  insert into public.shipping_orders
  select (jsonb_populate_record(null::public.shipping_orders, snapshot.order_row)).*
  from jsonb_array_elements(v_snapshot) as snapshot(order_row)
  returning *;
end;
$$;

-- ------------------------------------------------------------------------------
-- ATOMARER SHOP-CHECKOUT UND BANKABGLEICH
-- ------------------------------------------------------------------------------

create or replace function public.refresh_purchase_receiving_status(
  p_workspace_id uuid,
  p_purchase_id uuid
)
returns public.purchases
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase public.purchases;
begin
  update public.purchases
  set receiving_status = case
        when exists (
          select 1 from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity < ordered_quantity
        ) and exists (
          select 1 from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity > 0
        ) then 'partially_received'
        when exists (
          select 1 from public.purchase_lines
          where workspace_id = p_workspace_id
            and purchase_id = p_purchase_id
            and received_quantity < ordered_quantity
        ) then 'ordered'
        else 'received'
      end,
      updated_at = now()
  where id = p_purchase_id
    and workspace_id = p_workspace_id
  returning * into v_purchase;

  return v_purchase;
end;
$$;

create or replace function public.sync_purchase_receiving_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.refresh_purchase_receiving_status(
    coalesce(new.workspace_id, old.workspace_id),
    coalesce(new.purchase_id, old.purchase_id)
  );
  return null;
end;
$$;

create trigger purchase_lines_sync_receiving_status
after insert or update of ordered_quantity, received_quantity or delete
on public.purchase_lines
for each row execute function public.sync_purchase_receiving_status();

create or replace function public.create_purchase(
  p_workspace_id uuid,
  p_purchase jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_expense jsonb;
  v_line jsonb;
  v_line_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_total_expense_cents bigint;
  v_manual_cents bigint;
  v_mode text;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_purchase) <> 'object'
    or jsonb_typeof(p_expenses) <> 'array'
    or jsonb_typeof(p_lines) <> 'array'
    or nullif(btrim(p_purchase ->> 'title'), '') is null then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  v_mode := coalesce(nullif(p_purchase ->> 'cost_allocation_mode', ''), 'even');
  if v_mode not in ('manual', 'even', 'value_weighted') then
    raise exception using errcode = '22023', message = 'Die Kostenverteilung ist ungültig.';
  end if;

  insert into public.purchases (
    workspace_id, source_id, supplier_id, type, title, purchase_date,
    purchase_price, cost_allocation_mode, notes, tracking_number,
    tracking_carrier, tracking_status, original_url, receiving_status,
    total_purchase_cost
  ) values (
    p_workspace_id,
    nullif(p_purchase ->> 'source_id', '')::uuid,
    nullif(p_purchase ->> 'supplier_id', '')::uuid,
    p_purchase ->> 'type',
    btrim(p_purchase ->> 'title'),
    (p_purchase ->> 'purchase_date')::date,
    coalesce((p_purchase ->> 'purchase_price')::numeric, 0),
    v_mode,
    nullif(btrim(p_purchase ->> 'notes'), ''),
    nullif(btrim(p_purchase ->> 'tracking_number'), ''),
    nullif(p_purchase ->> 'tracking_carrier', ''),
    coalesce(nullif(p_purchase ->> 'tracking_status', ''), 'pending'),
    nullif(p_purchase ->> 'original_url', ''),
    case when jsonb_array_length(p_lines) > 0 then 'ordered' else 'received' end,
    coalesce((p_purchase ->> 'total_purchase_cost')::numeric,
      coalesce((p_purchase ->> 'purchase_price')::numeric, 0))
  ) returning * into v_purchase;

  for v_expense in select value from jsonb_array_elements(p_expenses) loop
    if coalesce((v_expense ->> 'amount')::numeric, 0) <= 0 then
      raise exception using errcode = '22023', message = 'Zusatzkosten müssen positiv sein.';
    end if;
    insert into public.purchase_costs (purchase_id, type, amount, description)
    values (
      v_purchase.id,
      coalesce(nullif(btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(btrim(v_expense ->> 'description'), '')
    );
  end loop;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.purchase_lines (
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost
    ) values (
      p_workspace_id,
      v_purchase.id,
      nullif(v_line ->> 'catalog_product_id', '')::uuid,
      btrim(v_line ->> 'title_snapshot'),
      v_line ->> 'line_kind',
      (v_line ->> 'ordered_quantity')::integer,
      0,
      (v_line ->> 'unit_purchase_price')::numeric,
      (v_line ->> 'line_total')::numeric,
      case when v_mode = 'manual'
        then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
        else 0
      end
    ) returning id into v_line_id;
    v_line_ids := array_append(v_line_ids, v_line_id);
  end loop;

  select coalesce(round(sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.purchase_id = v_purchase.id;

  if cardinality(v_line_ids) = 0 then
    null;
  elsif v_mode = 'manual' then
    select coalesce(round(sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using errcode = '22023', message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
    end if;
  elsif v_total_expense_cents > 0 then
    with weights as (
      select
        line.id,
        ids.ordinality,
        case
          when v_mode = 'value_weighted' and totals.value_total > 0 then line.line_total
          else line.ordered_quantity::numeric
        end as weight
      from unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
      cross join (
        select sum(candidate.line_total) as value_total
        from public.purchase_lines as candidate
        where candidate.id = any(v_line_ids)
      ) as totals
    ), shares as (
      select
        weights.*,
        v_total_expense_cents::numeric * weight / nullif(sum(weight) over (), 0) as exact_cents
      from weights
    ), ranked as (
      select
        shares.*,
        floor(exact_cents)::bigint as floor_cents,
        row_number() over (order by exact_cents - floor(exact_cents) desc, ordinality) as remainder_rank,
        v_total_expense_cents - sum(floor(exact_cents)::bigint) over () as remainder_cents
      from shares
    )
    update public.purchase_lines as line
    set allocated_additional_cost = (
      ranked.floor_cents + case when ranked.remainder_rank <= ranked.remainder_cents then 1 else 0 end
    )::numeric / 100
    from ranked
    where line.id = ranked.id;
  end if;

  return jsonb_build_object(
    'purchase', to_jsonb(v_purchase),
    'purchase_costs', coalesce((
      select jsonb_agg(to_jsonb(cost) order by cost.created_at, cost.id)
      from public.purchase_costs as cost where cost.purchase_id = v_purchase.id
    ), '[]'::jsonb),
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(line) order by ids.ordinality)
      from unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_purchase(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_purchase(uuid, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.add_purchase_lines(
  p_workspace_id uuid,
  p_purchase_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_line jsonb;
  v_line_id uuid;
  v_inserted_ids uuid[] := array[]::uuid[];
  v_all_line_ids uuid[];
  v_total_expense_cents bigint;
  v_manual_cents bigint;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_purchase_id is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if exists (
    select 1 from public.purchase_lines
    where purchase_id = p_purchase_id and workspace_id = p_workspace_id
      and received_quantity > 0
  ) then
    raise exception using errcode = '22023', message = 'Nach dem ersten Wareneingang können keine Positionen ergänzt werden.';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.purchase_lines (
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost
    ) values (
      p_workspace_id,
      p_purchase_id,
      nullif(v_line ->> 'catalog_product_id', '')::uuid,
      btrim(v_line ->> 'title_snapshot'),
      v_line ->> 'line_kind',
      (v_line ->> 'ordered_quantity')::integer,
      0,
      (v_line ->> 'unit_purchase_price')::numeric,
      (v_line ->> 'line_total')::numeric,
      case when v_purchase.cost_allocation_mode = 'manual'
        then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
        else 0
      end
    ) returning id into v_line_id;
    v_inserted_ids := array_append(v_inserted_ids, v_line_id);
  end loop;

  select array_agg(line.id order by line.created_at, line.id)
  into v_all_line_ids
  from public.purchase_lines as line
  where line.purchase_id = p_purchase_id and line.workspace_id = p_workspace_id;
  select coalesce(round(sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.purchase_id = p_purchase_id;

  if v_purchase.cost_allocation_mode = 'manual' then
    select coalesce(round(sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_all_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using errcode = '22023', message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
    end if;
  else
    update public.purchase_lines
    set allocated_additional_cost = 0
    where id = any(v_all_line_ids);

    if v_total_expense_cents > 0 then
      with weights as (
        select
          line.id,
          ids.ordinality,
          case
            when v_purchase.cost_allocation_mode = 'value_weighted'
              and totals.value_total > 0 then line.line_total
            else line.ordered_quantity::numeric
          end as weight
        from unnest(v_all_line_ids) with ordinality as ids(id, ordinality)
        join public.purchase_lines as line on line.id = ids.id
        cross join (
          select sum(candidate.line_total) as value_total
          from public.purchase_lines as candidate
          where candidate.id = any(v_all_line_ids)
        ) as totals
      ), shares as (
        select weights.*,
          v_total_expense_cents::numeric * weight / nullif(sum(weight) over (), 0) as exact_cents
        from weights
      ), ranked as (
        select shares.*,
          floor(exact_cents)::bigint as floor_cents,
          row_number() over (order by exact_cents - floor(exact_cents) desc, ordinality) as remainder_rank,
          v_total_expense_cents - sum(floor(exact_cents)::bigint) over () as remainder_cents
        from shares
      )
      update public.purchase_lines as line
      set allocated_additional_cost = (
        ranked.floor_cents + case when ranked.remainder_rank <= ranked.remainder_cents then 1 else 0 end
      )::numeric / 100
      from ranked
      where line.id = ranked.id;
    end if;
  end if;

  return jsonb_build_object(
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(line) order by line.created_at, line.id)
      from public.purchase_lines as line
      where line.id = any(v_inserted_ids)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.add_purchase_lines(uuid, uuid, jsonb) from public;
grant execute on function public.add_purchase_lines(uuid, uuid, jsonb) to authenticated;

create or replace function public.receive_purchase_lines(
  p_workspace_id uuid,
  p_purchase_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input_line jsonb;
  v_purchase public.purchases;
  v_purchase_line public.purchase_lines;
  v_stock_lot public.stock_lots;
  v_purchase_line_id uuid;
  v_received_quantity integer;
  v_received_at timestamptz;
  v_purchase_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'Die Wareneingangsdaten sind ungültig.';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'purchase_line_id') <> 'string'
      or jsonb_typeof(v_input_line -> 'received_quantity') <> 'number'
      or (v_input_line ->> 'received_quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'received_at') <> 'string' then
      raise exception using errcode = '22023', message = 'Eine Wareneingangsposition ist ungültig.';
    end if;

    v_purchase_line_id := (v_input_line ->> 'purchase_line_id')::uuid;
    v_received_quantity := (v_input_line ->> 'received_quantity')::integer;
    v_received_at := (v_input_line ->> 'received_at')::timestamptz;

    select * into v_purchase_line
    from public.purchase_lines
    where id = v_purchase_line_id
      and workspace_id = p_workspace_id
      and purchase_id = p_purchase_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Die Einkaufsposition wurde nicht gefunden.';
    end if;

    if v_purchase_line.line_kind = 'individual' then
      raise exception using errcode = '22023', message = 'Einzelartikel werden über den expliziten Einzelartikelpfad eingebucht.';
    end if;

    if v_purchase_line.received_quantity + v_received_quantity > v_purchase_line.ordered_quantity then
      raise exception using errcode = '22023', message = 'Die empfangene Menge überschreitet die bestellte Menge.';
    end if;

    update public.purchase_lines
    set received_quantity = received_quantity + v_received_quantity,
        updated_at = now()
    where id = v_purchase_line.id
      and workspace_id = p_workspace_id
    returning * into v_purchase_line;

    insert into public.stock_lots (
      workspace_id,
      purchase_id,
      purchase_line_id,
      catalog_product_id,
      received_quantity,
      remaining_quantity,
      unit_cost,
      received_at
    ) values (
      p_workspace_id,
      p_purchase_id,
      v_purchase_line.id,
      v_purchase_line.catalog_product_id,
      v_received_quantity,
      v_received_quantity,
      (v_purchase_line.line_total + v_purchase_line.allocated_additional_cost)
        / v_purchase_line.ordered_quantity,
      v_received_at
    )
    returning * into v_stock_lot;

    insert into public.stock_movements (
      workspace_id,
      stock_lot_id,
      direction,
      quantity,
      reason
    ) values (
      p_workspace_id,
      v_stock_lot.id,
      'in',
      v_received_quantity,
      'receipt'
    );

    v_purchase_line_ids := array_append(v_purchase_line_ids, v_purchase_line.id);
    v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);
  end loop;

  perform public.refresh_purchase_receiving_status(p_workspace_id, p_purchase_id);

  return jsonb_build_object(
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(purchase_line) order by purchase_line.id)
      from public.purchase_lines as purchase_line
      where purchase_line.id = any(v_purchase_line_ids)
    ), '[]'::jsonb),
    'stock_lots', coalesce((
      select jsonb_agg(to_jsonb(stock_lot) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.receive_purchase_lines(uuid, uuid, jsonb) from public;
grant execute on function public.receive_purchase_lines(uuid, uuid, jsonb) to authenticated;

create or replace function public.receive_individual_purchase_line(
  p_workspace_id uuid,
  p_purchase_id uuid,
  p_purchase_line_id uuid,
  p_item jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_purchase_line public.purchase_lines;
  v_inventory_item public.inventory_items;
  v_title text;
  v_condition text;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or p_purchase_line_id is null
    or jsonb_typeof(p_item) <> 'object'
    or jsonb_typeof(p_item -> 'title') <> 'string'
    or jsonb_typeof(p_item -> 'condition') <> 'string' then
    raise exception using errcode = '22023', message = 'Die Einzelartikel-Wareneingangsdaten sind ungültig.';
  end if;

  v_title := btrim(p_item ->> 'title');
  v_condition := p_item ->> 'condition';
  if v_title = '' or v_condition not in ('new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective') then
    raise exception using errcode = '22023', message = 'Die Einzelartikel-Wareneingangsdaten sind ungültig.';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  select * into v_purchase_line
  from public.purchase_lines
  where id = p_purchase_line_id
    and workspace_id = p_workspace_id
    and purchase_id = p_purchase_id
  for update;
  if not found or v_purchase_line.line_kind <> 'individual' or v_purchase_line.received_quantity <> 0 then
    raise exception using errcode = '22023', message = 'Die Einzelartikelposition ist nicht offen.';
  end if;

  insert into public.inventory_items (
    workspace_id, purchase_id, purchase_line_id, title, condition, status, allocated_purchase_cost
  ) values (
    p_workspace_id, p_purchase_id, p_purchase_line_id, v_title, v_condition, 'received', v_purchase_line.line_total
  ) returning * into v_inventory_item;

  update public.purchase_lines
  set received_quantity = 1, updated_at = now()
  where id = p_purchase_line_id and workspace_id = p_workspace_id
  returning * into v_purchase_line;

  v_purchase := public.refresh_purchase_receiving_status(p_workspace_id, p_purchase_id);
  return jsonb_build_object(
    'purchase_line', to_jsonb(v_purchase_line),
    'inventory_item', to_jsonb(v_inventory_item),
    'purchase', to_jsonb(v_purchase)
  );
end;
$$;

revoke all on function public.receive_individual_purchase_line(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.receive_individual_purchase_line(uuid, uuid, uuid, jsonb) to authenticated;

create or replace function public.protect_inventory_item_sold_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
      (tg_op = 'INSERT' and new.status = 'sold')
      or (tg_op = 'UPDATE' and old.status is distinct from new.status
        and (old.status = 'sold' or new.status = 'sold'))
    ) and not (
      current_user = 'postgres'
      and coalesce(current_setting('flipbase.allow_inventory_sold_transition', true), '') = 'on'
    ) then
    raise exception using
      errcode = '42501',
      message = 'Der Verkaufsstatus darf nur ueber eine gepruefte Buchungsfunktion geaendert werden.';
  end if;

  return new;
end;
$$;

create trigger protect_inventory_item_sold_status
before insert or update of status on public.inventory_items
for each row execute function public.protect_inventory_item_sold_status();

create or replace function public.prevent_inventory_reconciliation_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'Inventarklaerungsereignisse sind unveraenderlich.';
end;
$$;

create trigger prevent_inventory_reconciliation_event_mutation
before update or delete on public.inventory_reconciliation_events
for each row execute function public.prevent_inventory_reconciliation_event_mutation();

create or replace function public.validate_inventory_item_sale_integrity(p_inventory_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_active_line_sale_count bigint;
  v_active_legacy_header_count bigint;
begin
  if p_inventory_item_id is null then
    return;
  end if;

  select inventory_item.status
  into v_status
  from public.inventory_items as inventory_item
  where inventory_item.id = p_inventory_item_id
  for update;

  if not found then
    return;
  end if;

  select count(distinct sale.id)
  into v_active_line_sale_count
  from public.sale_lines as sale_line
  join public.sales as sale
    on sale.id = sale_line.sale_id
   and sale.workspace_id = sale_line.workspace_id
  where sale_line.inventory_item_id = p_inventory_item_id
    and sale.returned_at is null
    and sale.voided_at is null;

  select count(*)
  into v_active_legacy_header_count
  from public.sales as sale
  where sale.inventory_item_id = p_inventory_item_id
    and sale.returned_at is null
    and sale.voided_at is null
    and not exists (
      select 1
      from public.sale_lines as sale_line
      where sale_line.workspace_id = sale.workspace_id
        and sale_line.sale_id = sale.id
        and sale_line.inventory_item_id = p_inventory_item_id
    );

  if v_active_legacy_header_count > 0 then
    raise exception using
      errcode = '23514',
      message = 'Ein bestandswirksamer Verkaufskopf benoetigt eine passende Verkaufsposition.';
  end if;

  if v_active_line_sale_count > 1 then
    raise exception using
      errcode = '23514',
      message = 'Ein Einzelstueck darf nur einen bestandswirksamen Verkauf haben.';
  end if;

  if (v_status = 'sold' and v_active_line_sale_count <> 1)
    or (v_status <> 'sold' and v_active_line_sale_count <> 0) then
    raise exception using
      errcode = '23514',
      message = 'Inventarstatus und bestandswirksame Verkaufsposition stimmen nicht ueberein.';
  end if;
end;
$$;

create or replace function public.check_inventory_item_sale_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.validate_inventory_item_sale_integrity(new.id);
  return new;
end;
$$;

create or replace function public.check_sale_line_inventory_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.validate_inventory_item_sale_integrity(old.inventory_item_id);
  end if;
  if tg_op <> 'DELETE'
    and (tg_op = 'INSERT' or new.inventory_item_id is distinct from old.inventory_item_id) then
    perform public.validate_inventory_item_sale_integrity(new.inventory_item_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.check_sale_inventory_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inventory_item_id uuid;
  v_old_sale_id uuid;
  v_new_sale_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_sale_id := old.id;
    perform public.validate_inventory_item_sale_integrity(old.inventory_item_id);
  end if;
  if tg_op <> 'DELETE' then
    v_new_sale_id := new.id;
    if tg_op = 'INSERT' or new.inventory_item_id is distinct from old.inventory_item_id then
      perform public.validate_inventory_item_sale_integrity(new.inventory_item_id);
    end if;
  end if;

  for v_inventory_item_id in
    select distinct sale_line.inventory_item_id
    from public.sale_lines as sale_line
    where sale_line.inventory_item_id is not null
      and sale_line.sale_id in (v_old_sale_id, v_new_sale_id)
  loop
    perform public.validate_inventory_item_sale_integrity(v_inventory_item_id);
  end loop;

  return coalesce(new, old);
end;
$$;

create constraint trigger inventory_item_sale_integrity_on_insert
after insert on public.inventory_items
deferrable initially deferred
for each row execute function public.check_inventory_item_sale_integrity();

create constraint trigger inventory_item_sale_integrity_on_status
after update of status on public.inventory_items
deferrable initially deferred
for each row execute function public.check_inventory_item_sale_integrity();

create constraint trigger inventory_item_sale_integrity_on_sale_line
after insert or update or delete on public.sale_lines
deferrable initially deferred
for each row execute function public.check_sale_line_inventory_integrity();

create constraint trigger inventory_item_sale_integrity_on_sale
after insert or delete or update of workspace_id, inventory_item_id, returned_at, voided_at
on public.sales
deferrable initially deferred
for each row execute function public.check_sale_inventory_integrity();

revoke execute on function public.protect_inventory_item_sold_status() from public, anon, authenticated;
revoke execute on function public.prevent_inventory_reconciliation_event_mutation() from public, anon, authenticated;
revoke execute on function public.validate_inventory_item_sale_integrity(uuid) from public, anon, authenticated;
revoke execute on function public.check_inventory_item_sale_integrity() from public, anon, authenticated;
revoke execute on function public.check_sale_line_inventory_integrity() from public, anon, authenticated;
revoke execute on function public.check_sale_inventory_integrity() from public, anon, authenticated;

create or replace function public.resolve_legacy_sold_item(
  p_workspace_id uuid,
  p_inventory_item_id uuid,
  p_action text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_inventory_item public.inventory_items;
  v_event public.inventory_reconciliation_events;
  v_sale_state text;
begin
  if v_actor_id is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_action <> 'restore_stock'
    or nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Aktion und Begruendung sind erforderlich.';
  end if;

  select *
  into v_inventory_item
  from public.inventory_items
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Der Inventarartikel wurde nicht gefunden.';
  end if;

  select sale_state
  into v_sale_state
  from public.inventory_item_sale_states
  where inventory_item_id = p_inventory_item_id
    and workspace_id = p_workspace_id;

  if v_sale_state = 'legacy_sale_header_without_line' then
    raise exception using errcode = '22023', message = 'Korrektur erforderlich: Der Verkaufskopf besitzt keine passende Position.';
  end if;

  if v_sale_state <> 'legacy_sold_unverified' then
    raise exception using errcode = '22023', message = 'Nur ungepruefter verkaufter Altbestand kann zurueckgesetzt werden.';
  end if;

  perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

  update public.inventory_items
  set status = 'ready', updated_at = now()
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  returning * into v_inventory_item;

  insert into public.inventory_reconciliation_events (
    workspace_id, inventory_item_id, actor_id, event_type,
    previous_status, new_status, reason
  ) values (
    p_workspace_id, p_inventory_item_id, v_actor_id, 'restore_stock',
    'sold', 'ready', trim(p_reason)
  )
  returning * into v_event;

  return jsonb_build_object(
    'inventory_item', to_jsonb(v_inventory_item),
    'event', to_jsonb(v_event)
  );
end;
$$;

revoke execute on function public.resolve_legacy_sold_item(uuid, uuid, text, text)
  from public, anon, service_role;
grant execute on function public.resolve_legacy_sold_item(uuid, uuid, text, text)
  to authenticated;

create or replace function public.record_legacy_inventory_sale(
  p_workspace_id uuid,
  p_inventory_item_id uuid,
  p_sale jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_inventory_item public.inventory_items;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_event public.inventory_reconciliation_events;
  v_sale_state text;
  v_unit_sale_price numeric(12, 2);
  v_workspace_tax_mode text;
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
    or (p_sale ->> 'unit_sale_price')::numeric <= 0 then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungueltig.';
  end if;

  select *
  into v_inventory_item
  from public.inventory_items
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Der Inventarartikel wurde nicht gefunden.';
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
    platform_fee, shipping_cost, packaging_cost, other_costs,
    external_order_id, external_listing_id, buyer_notes
  ) values (
    p_workspace_id, null, trim(p_sale ->> 'platform'),
    v_unit_sale_price, v_unit_sale_price, (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    coalesce((p_sale ->> 'packaging_cost')::numeric, 0),
    coalesce((p_sale ->> 'other_costs')::numeric, 0),
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), '')
  ) returning * into v_sale;

  insert into public.sale_lines (
    workspace_id, sale_id, inventory_item_id, title_snapshot, quantity,
    unit_sale_price, line_total, cost_of_goods_sold, tax_mode
  ) values (
    p_workspace_id, v_sale.id, p_inventory_item_id,
    coalesce(nullif(trim(p_sale ->> 'title_snapshot'), ''), v_inventory_item.title),
    1, v_unit_sale_price, v_unit_sale_price,
    v_inventory_item.allocated_purchase_cost, v_workspace_tax_mode
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
    'sale_lines', jsonb_build_array(to_jsonb(v_sale_line)),
    'lot_allocations', '[]'::jsonb,
    'stock_movements', '[]'::jsonb,
    'event', to_jsonb(v_event)
  );
end;
$$;

revoke execute on function public.record_legacy_inventory_sale(uuid, uuid, jsonb, text)
  from public, anon, service_role;
grant execute on function public.record_legacy_inventory_sale(uuid, uuid, jsonb, text)
  to authenticated;

create or replace function public.record_sale(
  p_workspace_id uuid,
  p_sale jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  v_quantity integer;
  v_unit_sale_price numeric(12, 2);
  v_line_total numeric(12, 2);
  v_line_cogs numeric(12, 2);
  v_remaining_quantity integer;
  v_allocated_quantity integer;
  v_allocation_cost numeric(12,2);
  v_previously_allocated_cost numeric(12,2);
  v_sale_total numeric(12, 2) := 0;
  v_sale_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_sale_state text;
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

  -- Resolve unique UUIDs first and lock them in one stable order. This avoids
  -- client-controlled lock ordering for multi-item sales.
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
    external_order_id,
    external_listing_id,
    buyer_notes
  ) values (
    p_workspace_id,
    v_header_inventory_item_id,
    trim(p_sale ->> 'platform'),
    0,
    0,
    (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    coalesce((p_sale ->> 'packaging_cost')::numeric, 0),
    coalesce((p_sale ->> 'other_costs')::numeric, 0),
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), '')
  )
  returning * into v_sale;

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
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

    if v_catalog_product_id is not null then
      select * into v_catalog_product
      from public.catalog_products
      where id = v_catalog_product_id
        and workspace_id = p_workspace_id;

      if not found or v_catalog_product.tracking_mode <> 'quantity' then
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
        select *
        from public.stock_lots
        where workspace_id = p_workspace_id
          and catalog_product_id = v_catalog_product.id
          and remaining_quantity > 0
        order by received_at, id
        for update
      loop
        exit when v_remaining_quantity = 0;

        v_allocated_quantity := least(v_remaining_quantity, v_stock_lot.remaining_quantity);

        select coalesce(sum(allocation.allocated_cost), 0)
        into v_previously_allocated_cost
        from public.sale_line_lot_allocations as allocation
        where allocation.stock_lot_id = v_stock_lot.id;

        v_allocation_cost := case
          when v_allocated_quantity = v_stock_lot.remaining_quantity then
            round(v_stock_lot.unit_cost * v_stock_lot.received_quantity, 2)
              - v_previously_allocated_cost
          else round(v_allocated_quantity * v_stock_lot.unit_cost, 2)
        end;

        update public.stock_lots
        set remaining_quantity = remaining_quantity - v_allocated_quantity
        where id = v_stock_lot.id
          and workspace_id = p_workspace_id;

        insert into public.sale_line_lot_allocations (
          workspace_id,
          sale_line_id,
          stock_lot_id,
          quantity,
          unit_cost,
          allocated_cost
        ) values (
          p_workspace_id,
          v_sale_line.id,
          v_stock_lot.id,
          v_allocated_quantity,
          v_stock_lot.unit_cost,
          v_allocation_cost
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
      set cost_of_goods_sold = v_line_cogs
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

      v_line_cogs := v_inventory_item.allocated_purchase_cost;

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        inventory_item_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
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
        v_workspace.tax_mode
      )
      returning * into v_sale_line;
    end if;

    v_sale_total := v_sale_total + v_line_total;
    v_sale_line_ids := array_append(v_sale_line_ids, v_sale_line.id);
  end loop;

  update public.sales
  set sale_price = v_sale_total,
      sale_price_total = v_sale_total
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
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
$$;

revoke all on function public.record_sale(uuid, jsonb, jsonb) from public;
grant execute on function public.record_sale(uuid, jsonb, jsonb) to authenticated;

create or replace function public.record_sale_return(
  p_workspace_id uuid,
  p_sale_id uuid,
  p_refund_amount numeric,
  p_restock boolean,
  p_reason text,
  p_notes text,
  p_restock_action text,
  p_buyer_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_allocation public.sale_line_lot_allocations;
  v_stock_lot public.stock_lots;
  v_inventory_item public.inventory_items;
  v_return_movement_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_movement_id uuid;
  v_return public.returns;
  v_return_inventory_item_id uuid;
  v_restocked_quantity integer := 0;
  v_sale_total numeric;
  v_total_refund numeric;
  v_is_full_refund boolean;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_sale_id is null
    or p_refund_amount is null
    or p_refund_amount < 0
    or p_restock is null
    or nullif(trim(p_reason), '') is null
    or p_restock_action is null
    or p_restock_action not in ('restock_ready', 'restock_repair', 'write_off', 'keep_with_buyer') then
    raise exception using errcode = '22023', message = 'Die Retourendaten sind ungültig.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Verkauf wurde nicht gefunden.';
  end if;

  if v_sale.returned_at is not null then
    raise exception using errcode = '22023', message = 'Der Verkauf wurde bereits retourniert.';
  end if;

  if v_sale.voided_at is not null
    or v_sale.voided_by is not null
    or v_sale.void_reason is not null then
    raise exception using errcode = '22023', message = 'Ein aufgehobener Verkauf kann nicht retourniert werden.';
  end if;

  v_sale_total := coalesce(v_sale.sale_price_total, v_sale.sale_price, 0);
  v_total_refund := least(v_sale_total, coalesce(v_sale.refund_amount, 0) + p_refund_amount);
  v_is_full_refund := v_total_refund >= v_sale_total;

  if v_is_full_refund then
    select sale_line.inventory_item_id into v_return_inventory_item_id
  from public.sale_lines as sale_line
  where sale_line.workspace_id = p_workspace_id
    and sale_line.sale_id = p_sale_id
    and sale_line.inventory_item_id is not null
  order by sale_line.id
  limit 1;

    for v_sale_line in
      select *
      from public.sale_lines
      where workspace_id = p_workspace_id
        and sale_id = p_sale_id
    loop
    if v_sale_line.catalog_product_id is not null then
      for v_allocation in
        select *
        from public.sale_line_lot_allocations
        where workspace_id = p_workspace_id
          and sale_line_id = v_sale_line.id
      loop
        select * into v_stock_lot
        from public.stock_lots
        where id = v_allocation.stock_lot_id
          and workspace_id = p_workspace_id
        for update;

        if not found then
          raise exception using errcode = 'P0002', message = 'Das zugeordnete Bestandslos wurde nicht gefunden.';
        end if;

        if p_restock then
          update public.stock_lots
          set remaining_quantity = remaining_quantity + v_allocation.quantity
          where id = v_stock_lot.id
            and workspace_id = p_workspace_id;
          v_restocked_quantity := v_restocked_quantity + v_allocation.quantity;
        end if;

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
          'in',
          v_allocation.quantity,
          'return'
        )
        returning id into v_movement_id;

        v_return_movement_ids := array_append(v_return_movement_ids, v_movement_id);
        v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);

        if not p_restock then
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
            v_allocation.quantity,
            'damage'
          )
          returning id into v_movement_id;

          v_return_movement_ids := array_append(v_return_movement_ids, v_movement_id);
        end if;
      end loop;
    else
      select * into v_inventory_item
      from public.inventory_items
      where id = v_sale_line.inventory_item_id
        and workspace_id = p_workspace_id
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'Der retournierte Einzelartikel wurde nicht gefunden.';
      end if;

      perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

      update public.inventory_items
      set status = case when p_restock then 'ready' else 'returned' end,
          updated_at = now()
      where id = v_inventory_item.id
        and workspace_id = p_workspace_id;
      if p_restock then
        v_restocked_quantity := v_restocked_quantity + 1;
      end if;
    end if;
    end loop;
  end if;

  update public.sales
  set returned_at = case when v_is_full_refund then now() else null end,
      refund_amount = v_total_refund
  where id = p_sale_id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.returns (
    workspace_id,
    sale_id,
    inventory_item_id,
    credit_note_number,
    return_date,
    reason,
    refund_amount,
    is_full_refund,
    restock_action,
    buyer_name,
    notes
  ) values (
    p_workspace_id,
    p_sale_id,
    v_return_inventory_item_id,
    'GS-' || to_char(current_date, 'YYYY') || '-' || upper(substr(gen_random_uuid()::text, 1, 8)),
    current_date,
    p_reason,
    p_refund_amount,
    v_is_full_refund,
    p_restock_action,
    nullif(trim(p_buyer_name), ''),
    nullif(trim(p_notes), '')
  )
  returning * into v_return;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'return', to_jsonb(v_return),
    'sale_lines', coalesce((
      select jsonb_agg(to_jsonb(sale_line) order by sale_line.id)
      from public.sale_lines as sale_line
      where sale_line.workspace_id = p_workspace_id
        and sale_line.sale_id = p_sale_id
    ), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(movement) order by movement.id)
      from public.stock_movements as movement
      where movement.id = any(v_return_movement_ids)
    ), '[]'::jsonb),
    'lot_allocations', coalesce((
      select jsonb_agg(to_jsonb(allocation) order by allocation.id)
      from public.sale_line_lot_allocations as allocation
      join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
      where sale_line.workspace_id = p_workspace_id
        and sale_line.sale_id = p_sale_id
    ), '[]'::jsonb),
    'stock_quantities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stock_lot_id', stock_lot.id,
        'remaining_quantity', stock_lot.remaining_quantity
      ) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb),
    'reason', p_reason,
    'notes', p_notes,
    'restocked', p_restock,
    'restocked_quantity', v_restocked_quantity
  );
end;
$$;

revoke all on function public.record_sale_return(uuid, uuid, numeric, boolean, text, text, text, text) from public;
grant execute on function public.record_sale_return(uuid, uuid, numeric, boolean, text, text, text, text) to authenticated;

create or replace function public.place_store_order(
  p_workspace_id uuid,
  p_order_id uuid,
  p_order_number text,
  p_customer jsonb,
  p_subtotal numeric,
  p_shipping_cost numeric,
  p_total numeric,
  p_payment_method text,
  p_payment_status text,
  p_payment_id text,
  p_status text,
  p_sale_date date,
  p_buyer_notes text,
  p_items jsonb
)
returns public.store_orders
language plpgsql
security invoker
set search_path = ''
as $$
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
      'shipping_cost', p_shipping_cost,
      'other_costs', coalesce((
        select sum(coalesce((item.value ->> 'payment_fee')::numeric, 0))
        from jsonb_array_elements(p_items) as item(value)
      ), 0),
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
$$;

comment on function public.place_store_order(
  uuid, uuid, text, jsonb, numeric, numeric, numeric, text, text, text, text, date, text, jsonb
) is
  'Speichert Bestellung, Positionen, Artikelstatus und Verkäufe atomar und idempotent.';

create or replace function public.replace_bank_transactions(
  p_workspace_id uuid,
  p_transactions jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected_count integer;
  v_saved_count integer;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if jsonb_typeof(p_transactions) <> 'array' then
    raise exception using errcode = '22023', message = 'Banktransaktionen müssen als Liste übergeben werden.';
  end if;

  select count(*), count(distinct transaction.id)
  into v_expected_count, v_saved_count
  from jsonb_to_recordset(p_transactions) as transaction(
    id uuid,
    booking_date date,
    value_date date,
    counterparty_name text,
    counterparty_iban text,
    purpose text,
    amount numeric,
    currency text,
    source_format text,
    status text,
    match_json jsonb,
    booked_at timestamptz
  );

  if v_expected_count <> v_saved_count then
    raise exception using errcode = '22023', message = 'Banktransaktions-IDs müssen eindeutig sein.';
  end if;

  perform 1
  from public.bank_transactions
  where workspace_id = p_workspace_id
  for update;

  insert into public.bank_transactions (
    id,
    workspace_id,
    booking_date,
    value_date,
    counterparty_name,
    counterparty_iban,
    purpose,
    amount,
    currency,
    source_format,
    status,
    match_json,
    booked_at
  )
  select
    transaction.id,
    p_workspace_id,
    transaction.booking_date,
    transaction.value_date,
    transaction.counterparty_name,
    transaction.counterparty_iban,
    transaction.purpose,
    transaction.amount,
    coalesce(transaction.currency, 'EUR'),
    transaction.source_format,
    coalesce(transaction.status, 'pending'),
    transaction.match_json,
    transaction.booked_at
  from jsonb_to_recordset(p_transactions) as transaction(
    id uuid,
    booking_date date,
    value_date date,
    counterparty_name text,
    counterparty_iban text,
    purpose text,
    amount numeric,
    currency text,
    source_format text,
    status text,
    match_json jsonb,
    booked_at timestamptz
  )
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    booking_date = excluded.booking_date,
    value_date = excluded.value_date,
    counterparty_name = excluded.counterparty_name,
    counterparty_iban = excluded.counterparty_iban,
    purpose = excluded.purpose,
    amount = excluded.amount,
    currency = excluded.currency,
    source_format = excluded.source_format,
    status = excluded.status,
    match_json = excluded.match_json,
    booked_at = excluded.booked_at;

  delete from public.bank_transactions as existing
  where existing.workspace_id = p_workspace_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_transactions) as incoming(id uuid)
      where incoming.id = existing.id
    );

  select count(*) into v_saved_count
  from public.bank_transactions
  where workspace_id = p_workspace_id;

  if v_saved_count <> v_expected_count then
    raise exception using errcode = 'P0001', message = 'Die Banktransaktionen wurden nicht vollständig gespeichert.';
  end if;

  return v_saved_count;
end;
$$;

comment on function public.replace_bank_transactions(uuid, jsonb) is
  'Ersetzt den vollständigen Banktransaktionsbestand eines Workspace atomar.';

create or replace function public.book_bank_transaction(
  p_workspace_id uuid,
  p_transaction_id uuid,
  p_booked_at timestamptz,
  p_store_order_id uuid default null
)
returns public.bank_transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction public.bank_transactions;
  v_order_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  select * into v_transaction
  from public.bank_transactions
  where id = p_transaction_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Die Banktransaktion wurde nicht gefunden.';
  end if;

  if p_store_order_id is not null then
    update public.store_orders
    set payment_status = 'paid', status = 'confirmed'
    where id = p_store_order_id
      and workspace_id = p_workspace_id
    returning id into v_order_id;

    if v_order_id is null then
      raise no_data_found using message = 'Die zugehörige Shop-Bestellung wurde nicht gefunden.';
    end if;
  end if;

  update public.bank_transactions
  set status = 'booked', booked_at = p_booked_at
  where id = p_transaction_id
    and workspace_id = p_workspace_id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

comment on function public.book_bank_transaction(uuid, uuid, timestamptz, uuid) is
  'Bucht eine Banktransaktion und bestätigt eine zugehörige Shop-Zahlung atomar.';

create or replace function public.create_or_get_invoice(
  p_workspace_id uuid,
  p_sale_id uuid,
  p_store_order_id uuid,
  p_invoice jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_created boolean := false;
  v_items jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if (p_sale_id is null) = (p_store_order_id is null) then
    raise exception using errcode = '22023', message = 'Genau eine Rechnungsquelle ist erforderlich.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0
    or exists (
      select 1
      from jsonb_array_elements(p_items) as item(value)
      where nullif(btrim(item.value ->> 'title'), '') is null
        or coalesce((item.value ->> 'quantity')::integer, 0) < 1
        or coalesce((item.value ->> 'unit_price')::numeric, -1) < 0
        or coalesce((item.value ->> 'total_price')::numeric, -1) < 0
    ) then
    raise exception using errcode = '22023', message = 'Mindestens eine Rechnungsposition ist ungültig.';
  end if;

  if p_sale_id is not null and not exists (
    select 1 from public.sales
    where id = p_sale_id and workspace_id = p_workspace_id
  ) then
    raise no_data_found using message = 'Der Verkauf wurde nicht gefunden.';
  end if;

  if p_store_order_id is not null and not exists (
    select 1 from public.store_orders
    where id = p_store_order_id and workspace_id = p_workspace_id
  ) then
    raise no_data_found using message = 'Die Shop-Bestellung wurde nicht gefunden.';
  end if;

  insert into public.invoices (
    workspace_id, invoice_number, order_number, invoice_date, delivery_date,
    seller, buyer, subtotal, shipping_cost, total, tax_mode, tax_clause,
    payment_method, payment_status, payment_due_date, notes, sale_id, store_order_id
  ) values (
    p_workspace_id,
    p_invoice ->> 'invoice_number',
    p_invoice ->> 'order_number',
    (p_invoice ->> 'invoice_date')::date,
    (p_invoice ->> 'delivery_date')::date,
    coalesce(p_invoice -> 'seller', '{}'::jsonb),
    coalesce(p_invoice -> 'buyer', '{}'::jsonb),
    coalesce((p_invoice ->> 'subtotal')::numeric, 0),
    coalesce((p_invoice ->> 'shipping_cost')::numeric, 0),
    coalesce((p_invoice ->> 'total')::numeric, 0),
    coalesce(p_invoice ->> 'tax_mode', 'diff_25a'),
    p_invoice ->> 'tax_clause',
    p_invoice ->> 'payment_method',
    coalesce(p_invoice ->> 'payment_status', 'paid'),
    nullif(p_invoice ->> 'payment_due_date', '')::date,
    p_invoice ->> 'notes',
    p_sale_id,
    p_store_order_id
  )
  on conflict do nothing
  returning * into v_invoice;

  if found then
    v_created := true;
    insert into public.invoice_items (
      invoice_id, sku, title, condition, quantity, unit_price, total_price
    )
    select
      v_invoice.id,
      nullif(item.value ->> 'sku', ''),
      item.value ->> 'title',
      nullif(item.value ->> 'condition', ''),
      (item.value ->> 'quantity')::integer,
      (item.value ->> 'unit_price')::numeric,
      (item.value ->> 'total_price')::numeric
    from jsonb_array_elements(p_items) as item(value);
  else
    select * into v_invoice
    from public.invoices
    where workspace_id = p_workspace_id
      and ((p_sale_id is not null and sale_id = p_sale_id)
        or (p_store_order_id is not null and store_order_id = p_store_order_id));
    if not found then
      raise no_data_found using message = 'Die Rechnung konnte nicht gelesen werden.';
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
  into v_items
  from public.invoice_items as item
  where item.invoice_id = v_invoice.id;

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'items', v_items,
    'created', v_created
  );
end;
$$;

comment on function public.create_or_get_invoice(uuid, uuid, uuid, jsonb, jsonb) is
  'Erstellt Rechnung und Positionen atomar oder liefert den vorhandenen Beleg derselben Quelle.';

-- ------------------------------------------------------------------------------
-- PERMISSIONS & ROLES
-- ------------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

-- Buchungstabellen sind für Clients nur lesbar. Änderungen erfolgen
-- ausschließlich über die validierten, transaktionalen RPC-Funktionen.
revoke insert, update, delete
  on public.sales, public.returns, public.stock_lots, public.stock_movements,
    public.sale_lines, public.sale_line_lot_allocations
  from authenticated;

-- Gebuchte Rechnungen und Store-Bestellungen besitzen noch keinen fachlich
-- belastbaren Entwurfsstatus. Bis zu einem expliziten Korrekturprozess bleiben
-- Kopf und Positionen deshalb vollständig erhalten.
revoke delete
  on public.invoices, public.invoice_items, public.store_orders, public.store_order_items
  from authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.inventory_reconciliation_events
  from authenticated;

grant all
  on all tables in schema public
  to service_role;

revoke all
  on public.inventory_item_sale_states
  from public, anon;
revoke all
  on public.inventory_item_sale_states
  from authenticated;
grant select
  on public.inventory_item_sale_states
  to authenticated;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

grant execute
  on all functions in schema public
  to authenticated, service_role;

revoke execute on function public.protect_inventory_item_sold_status()
  from public, anon, authenticated, service_role;
revoke execute on function public.prevent_inventory_reconciliation_event_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function public.validate_inventory_item_sale_integrity(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.check_inventory_item_sale_integrity()
  from public, anon, authenticated, service_role;
revoke execute on function public.check_sale_line_inventory_integrity()
  from public, anon, authenticated, service_role;
revoke execute on function public.check_sale_inventory_integrity()
  from public, anon, authenticated, service_role;
revoke execute on function public.prevent_workspace_with_business_data_deletion()
  from public, anon, authenticated, service_role;
revoke execute on function public.resolve_legacy_sold_item(uuid, uuid, text, text)
  from public, anon, service_role;
grant execute on function public.resolve_legacy_sold_item(uuid, uuid, text, text)
  to authenticated;

revoke execute on function public.record_legacy_inventory_sale(uuid, uuid, jsonb, text)
  from public, anon, service_role;
grant execute on function public.record_legacy_inventory_sale(uuid, uuid, jsonb, text)
  to authenticated;

revoke execute on function public.record_sale(uuid, jsonb, jsonb)
  from public, anon, service_role;
revoke execute on function public.record_sale_return(uuid, uuid, numeric, boolean, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.record_sale(uuid, jsonb, jsonb)
  to authenticated;
grant execute on function public.record_sale_return(uuid, uuid, numeric, boolean, text, text, text, text)
  to authenticated;

revoke execute on function public.bundle_shipping_orders(
  uuid, uuid[], text, date, text, text, text, text, numeric, jsonb, text, text, text[], text
) from public, anon, service_role;
revoke execute on function public.unbundle_shipping_order(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.bundle_shipping_orders(
  uuid, uuid[], text, date, text, text, text, text, numeric, jsonb, text, text, text[], text
) to authenticated;
grant execute on function public.unbundle_shipping_order(uuid, uuid)
  to authenticated;
revoke execute on function public.place_store_order(
  uuid, uuid, text, jsonb, numeric, numeric, numeric, text, text, text, text, date, text, jsonb
) from public, anon, service_role;
revoke execute on function public.replace_bank_transactions(uuid, jsonb)
  from public, anon, service_role;
revoke execute on function public.book_bank_transaction(uuid, uuid, timestamptz, uuid)
  from public, anon, service_role;
revoke execute on function public.create_or_get_invoice(uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.place_store_order(
  uuid, uuid, text, jsonb, numeric, numeric, numeric, text, text, text, text, date, text, jsonb
) to authenticated;
grant execute on function public.replace_bank_transactions(uuid, jsonb)
  to authenticated;
grant execute on function public.book_bank_transaction(uuid, uuid, timestamptz, uuid)
  to authenticated;
grant execute on function public.create_or_get_invoice(uuid, uuid, uuid, jsonb, jsonb)
  to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- TRIGGER ON auth.users
-- ------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON CONSTRAINT workspace_members_user_id_profiles_fkey ON public.workspace_members IS
  'Ermoeglicht die verknuepfte Abfrage der Mitglieder mit ihren Profildaten ueber PostgREST.';

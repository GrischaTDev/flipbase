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
    min_roi_percent NUMERIC NOT NULL DEFAULT 30.0,
    min_profit_amount NUMERIC NOT NULL DEFAULT 15.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_info TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    sale_price NUMERIC NOT NULL DEFAULT 0.00,
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    platform_fee NUMERIC NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC NOT NULL DEFAULT 0.00,
    packaging_cost NUMERIC NOT NULL DEFAULT 0.00,
    other_costs NUMERIC NOT NULL DEFAULT 0.00,
    external_order_id TEXT,
    external_listing_id TEXT,
    buyer_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

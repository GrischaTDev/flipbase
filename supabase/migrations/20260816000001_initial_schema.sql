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
    type TEXT NOT NULL, -- e.g. shipping, transport, travel, customs, fee, other
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
    type TEXT NOT NULL, -- e.g. repair, cleaning, spare_parts, accessories, packaging, other
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
    platform TEXT NOT NULL, -- ebay, kleinanzeigen, vinted, other
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
    platform TEXT NOT NULL, -- ebay, kleinanzeigen, vinted
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
    platform TEXT NOT NULL, -- ebay, kleinanzeigen, vinted, direct, other
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
    action TEXT NOT NULL, -- received, researched, listed, reserved, sold, returned, archived, etc.
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_comparables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is member of a workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = ws_id AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: User can view and update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- Workspaces: User can view & update workspaces they are member of
CREATE POLICY "Members can view workspace" ON public.workspaces FOR SELECT USING (public.is_workspace_member(id));
CREATE POLICY "Members can update workspace" ON public.workspaces FOR UPDATE USING (public.is_workspace_member(id));
CREATE POLICY "Authenticated users can create workspace" ON public.workspaces FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Workspace Members
CREATE POLICY "Members can view membership" ON public.workspace_members FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members can insert membership" ON public.workspace_members FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id) OR user_id = auth.uid());

-- Sources
CREATE POLICY "Sources access" ON public.sources FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));

-- Suppliers
CREATE POLICY "Suppliers access" ON public.suppliers FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));

-- Purchases
CREATE POLICY "Purchases access" ON public.purchases FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));

-- Purchase Costs
CREATE POLICY "Purchase Costs access" ON public.purchase_costs FOR ALL USING (
    EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND public.is_workspace_member(p.workspace_id))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND public.is_workspace_member(p.workspace_id))
);

-- Inventory Items
CREATE POLICY "Inventory Items access" ON public.inventory_items FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));

-- Item Costs
CREATE POLICY "Item Costs access" ON public.item_costs FOR ALL USING (
    EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = inventory_item_id AND public.is_workspace_member(i.workspace_id))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = inventory_item_id AND public.is_workspace_member(i.workspace_id))
);

-- Item Media
CREATE POLICY "Item Media access" ON public.item_media FOR ALL USING (
    EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = inventory_item_id AND public.is_workspace_member(i.workspace_id))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = inventory_item_id AND public.is_workspace_member(i.workspace_id))
);

-- Market Research
CREATE POLICY "Market Research access" ON public.market_research FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));

-- Research Comparables
CREATE POLICY "Research Comparables access" ON public.research_comparables FOR ALL USING (
    EXISTS (SELECT 1 FROM public.market_research r WHERE r.id = research_id AND public.is_workspace_member(r.workspace_id))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.market_research r WHERE r.id = research_id AND public.is_workspace_member(r.workspace_id))
);

-- Listing Drafts
CREATE POLICY "Listing Drafts access" ON public.listing_drafts FOR ALL USING (
    EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = inventory_item_id AND public.is_workspace_member(i.workspace_id))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.id = inventory_item_id AND public.is_workspace_member(i.workspace_id))
);

-- Sales
CREATE POLICY "Sales access" ON public.sales FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));

-- Activity Logs
CREATE POLICY "Activity Logs access" ON public.activity_logs FOR ALL USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));

-- ==============================================================================
-- 9. AUTOMATIC NEW USER INITIALIZATION TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_ws_id UUID;
BEGIN
    -- 1. Create Profile
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Reseller'));

    -- 2. Create Default Workspace
    INSERT INTO public.workspaces (name, min_roi_percent, min_profit_amount)
    VALUES ('Mein Workspace', 30.0, 15.0)
    RETURNING id INTO new_ws_id;

    -- 3. Add Member as Owner
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (new_ws_id, NEW.id, 'owner');

    -- 4. Create Default Sources for the workspace
    INSERT INTO public.sources (workspace_id, name, is_default)
    VALUES
        (new_ws_id, 'Kleinanzeigen', TRUE),
        (new_ws_id, 'eBay', FALSE),
        (new_ws_id, 'Vinted', FALSE),
        (new_ws_id, 'Flohmarkt', FALSE),
        (new_ws_id, 'meinePacks', FALSE),
        (new_ws_id, 'B-Stock / Retouren', FALSE),
        (new_ws_id, 'Großhändler / Palette', FALSE);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

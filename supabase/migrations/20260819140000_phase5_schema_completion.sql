-- Phase 5 Schema Completion Migration
-- Author: Gemini 3.7 Flash (Antigravity)
-- Context: ReFlip Phase 5 - Data layer hardening & schema completion

-- 1. Alter existing tables to add missing columns
ALTER TABLE public.workspaces
    ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR',
    ADD COLUMN IF NOT EXISTS tax_mode TEXT NOT NULL DEFAULT 'diff_25a';

ALTER TABLE public.sources
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'online_marketplace',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.purchases
    ADD COLUMN IF NOT EXISTS tracking_number TEXT,
    ADD COLUMN IF NOT EXISTS tracking_carrier TEXT,
    ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS total_purchase_cost NUMERIC NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS estimated_delivery TIMESTAMPTZ;

ALTER TABLE public.inventory_items
    ADD COLUMN IF NOT EXISTS tax_mode_override TEXT,
    ADD COLUMN IF NOT EXISTS is_public_store BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS weight_g NUMERIC,
    ADD COLUMN IF NOT EXISTS dimension_length_cm NUMERIC,
    ADD COLUMN IF NOT EXISTS dimension_width_cm NUMERIC,
    ADD COLUMN IF NOT EXISTS dimension_height_cm NUMERIC;

-- 2. Create missing tables

-- Returns & Credit Notes
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
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

-- Invoices & Invoice Items & Email Confirmations
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
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

-- Shipping Orders & Carrier Configs
CREATE TABLE IF NOT EXISTS public.shipping_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- Store Orders, Store Order Items & Store Settings
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
    store_order_id UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
    item_title TEXT NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0.00,
    quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.store_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
    store_name TEXT NOT NULL DEFAULT 'ReFlip Store',
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

-- Bank Reconciliation
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

-- Price Tracker & Competitor Radar
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

-- Notifications & Webhooks
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

-- Offline Sourcing & Cash Wallet
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

-- Tax Advisor Configuration
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

-- Market Research Query Logs
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

-- 3. Row Level Security & Policies

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

-- Macro / Pattern: Standard workspace RLS policies

-- returns
CREATE POLICY returns_select ON public.returns FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY returns_insert ON public.returns FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY returns_update ON public.returns FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY returns_delete ON public.returns FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- invoices
CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY invoices_update ON public.invoices FOR UPDATE TO authenticated
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY invoices_delete ON public.invoices FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- invoice_items
CREATE POLICY invoice_items_select ON public.invoice_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_workspace_member(i.workspace_id)));
CREATE POLICY invoice_items_insert ON public.invoice_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_workspace_member(i.workspace_id)));
CREATE POLICY invoice_items_update ON public.invoice_items FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_workspace_member(i.workspace_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_workspace_member(i.workspace_id)));
CREATE POLICY invoice_items_delete ON public.invoice_items FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_workspace_member(i.workspace_id)));

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
CREATE POLICY store_orders_delete ON public.store_orders FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- store_order_items
CREATE POLICY store_order_items_select ON public.store_order_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.store_orders o WHERE o.id = store_order_items.store_order_id AND public.is_workspace_member(o.workspace_id)));
CREATE POLICY store_order_items_insert ON public.store_order_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.store_orders o WHERE o.id = store_order_items.store_order_id AND public.is_workspace_member(o.workspace_id)));
CREATE POLICY store_order_items_update ON public.store_order_items FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.store_orders o WHERE o.id = store_order_items.store_order_id AND public.is_workspace_member(o.workspace_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.store_orders o WHERE o.id = store_order_items.store_order_id AND public.is_workspace_member(o.workspace_id)));
CREATE POLICY store_order_items_delete ON public.store_order_items FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.store_orders o WHERE o.id = store_order_items.store_order_id AND public.is_workspace_member(o.workspace_id)));

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
ALTER TABLE public.research_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_queries_select ON public.research_queries FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));
CREATE POLICY research_queries_insert ON public.research_queries FOR INSERT TO authenticated
    WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY research_queries_delete ON public.research_queries FOR DELETE TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- 4. Indexes for performance and policy lookups

CREATE INDEX IF NOT EXISTS idx_returns_workspace_id ON public.returns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_item_id ON public.returns(inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_id ON public.invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_email_confirmations_workspace_id ON public.email_confirmations(workspace_id);

CREATE INDEX IF NOT EXISTS idx_shipping_orders_workspace_id ON public.shipping_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_shipping_orders_sale_id ON public.shipping_orders(sale_id);
CREATE INDEX IF NOT EXISTS idx_carrier_configs_workspace_id ON public.carrier_configs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_store_orders_workspace_id ON public.store_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_store_order_items_order_id ON public.store_order_items(store_order_id);
CREATE INDEX IF NOT EXISTS idx_store_settings_workspace_id ON public.store_settings(workspace_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_workspace_id ON public.bank_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_price_tracked_items_workspace_id ON public.price_tracked_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_app_notifications_workspace_id ON public.app_notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_workspace_id ON public.webhook_configs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_offline_purchase_entries_workspace_id ON public.offline_purchase_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cash_wallet_sessions_workspace_id ON public.cash_wallet_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tax_advisor_configs_workspace_id ON public.tax_advisor_configs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_research_queries_workspace_id ON public.research_queries(workspace_id);

-- 5. Grants for authenticated and service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

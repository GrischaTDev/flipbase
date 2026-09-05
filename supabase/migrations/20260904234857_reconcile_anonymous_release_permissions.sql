-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;

REVOKE ALL ON FUNCTION public.archive_workspace(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.book_bank_transaction(uuid, uuid, timestamp WITH time zone, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.bundle_shipping_orders(uuid, uuid[], text, date, text, text, text, text, numeric, jsonb, text, text, text[], text) FROM anon;

REVOKE ALL ON FUNCTION public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric) FROM anon;

REVOKE ALL ON FUNCTION public.create_workspace(text) FROM anon;

REVOKE ALL ON FUNCTION public.export_audit_snapshot(uuid, jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;

REVOKE ALL ON FUNCTION public.is_workspace_admin(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.place_store_order(uuid, uuid, text, jsonb, numeric, numeric, numeric, text, text, text, text, date, text, jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.protect_archived_workspace_data() FROM anon;

REVOKE ALL ON FUNCTION public.protect_workspace_archive_state() FROM anon;

REVOKE ALL ON FUNCTION public.refresh_purchase_receiving_status(uuid, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.replace_bank_transactions(uuid, jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.restore_workspace(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.set_workspace_archive_state(uuid, boolean) FROM anon;

REVOKE ALL ON FUNCTION public.sync_purchase_receiving_status() FROM anon;

REVOKE ALL ON FUNCTION public.unbundle_shipping_order(uuid, uuid) FROM anon;

REVOKE ALL ON public.activity_logs FROM anon;

REVOKE ALL ON public.app_notifications FROM anon;

REVOKE ALL ON public.bank_transactions FROM anon;

REVOKE ALL ON public.carrier_configs FROM anon;

REVOKE ALL ON public.cash_wallet_sessions FROM anon;

REVOKE DELETE, INSERT, SELECT, UPDATE ON public.catalog_products FROM anon;

REVOKE ALL ON public.email_confirmations FROM anon;

REVOKE ALL ON public.inventory_items FROM anon;

REVOKE ALL ON public.invoice_items FROM anon;

REVOKE ALL ON public.invoices FROM anon;

REVOKE ALL ON public.item_costs FROM anon;

REVOKE ALL ON public.item_media FROM anon;

REVOKE ALL ON public.listing_drafts FROM anon;

REVOKE ALL ON public.market_research FROM anon;

REVOKE ALL ON public.offline_purchase_entries FROM anon;

REVOKE ALL ON public.price_tracked_items FROM anon;

REVOKE ALL ON public.profiles FROM anon;

REVOKE ALL ON public.purchase_costs FROM anon;

REVOKE DELETE, INSERT, SELECT, UPDATE ON public.purchase_lines FROM anon;

REVOKE ALL ON public.purchases FROM anon;

REVOKE ALL ON public.research_comparables FROM anon;

REVOKE ALL ON public.research_queries FROM anon;

REVOKE ALL ON public.returns FROM anon;

REVOKE DELETE, INSERT, SELECT, UPDATE ON public.sale_cost_entries FROM anon;

REVOKE DELETE, INSERT, SELECT, UPDATE ON public.sale_line_lot_allocations FROM anon;

REVOKE DELETE, INSERT, SELECT, UPDATE ON public.sale_lines FROM anon;

REVOKE ALL ON public.sales FROM anon;

REVOKE ALL ON public.shipping_orders FROM anon;

REVOKE ALL ON public.sources FROM anon;

REVOKE DELETE, INSERT, SELECT, UPDATE ON public.stock_lots FROM anon;

REVOKE DELETE, INSERT, SELECT, UPDATE ON public.stock_movements FROM anon;

REVOKE ALL ON public.store_order_items FROM anon;

REVOKE ALL ON public.store_orders FROM anon;

REVOKE ALL ON public.store_settings FROM anon;

REVOKE ALL ON public.suppliers FROM anon;

REVOKE ALL ON public.tax_advisor_configs FROM anon;

REVOKE ALL ON public.webhook_configs FROM anon;

REVOKE ALL ON public.workspace_members FROM anon;

REVOKE ALL ON public.workspaces FROM anon;
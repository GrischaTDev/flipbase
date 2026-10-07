-- Schließt workspaceübergreifende Beziehungen und begrenzt Sniper-Merkzettel.
-- Reserviert Discord-Konten vor Rollenvergabe; ungültige Altbeziehungen brechen den transaktionalen Release ab.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.beta_discord_links
  ALTER COLUMN role_assigned_at DROP DEFAULT;

ALTER TABLE public.activity_logs
  DROP CONSTRAINT activity_logs_inventory_item_id_fkey;

ALTER TABLE public.inventory_items
  DROP CONSTRAINT inventory_items_purchase_id_fkey;

ALTER TABLE public.market_research
  DROP CONSTRAINT market_research_inventory_item_id_fkey;

ALTER TABLE public.price_tracked_items
  DROP CONSTRAINT price_tracked_items_inventory_item_id_fkey;

ALTER TABLE public.shipping_orders
  DROP CONSTRAINT shipping_orders_sale_id_fkey;

CREATE FUNCTION public.enforce_sniper_watchlist_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
    perform 1 from public.workspaces where id = new.workspace_id for update;
    if tg_op = 'INSERT' and (select count(*) from public.sniper_watchlists where workspace_id = new.workspace_id) >= 100 then
        raise exception 'Maximal 100 Merkzettel pro Arbeitsbereich.' using errcode = '54000';
    end if;
    if new.is_active and (tg_op = 'INSERT' or not old.is_active or old.workspace_id is distinct from new.workspace_id) then
        if (select count(*) from public.sniper_watchlists where workspace_id = new.workspace_id and is_active and id <> new.id) >= 25 then
            raise exception 'Maximal 25 aktive Merkzettel pro Arbeitsbereich.' using errcode = '54000';
        end if;
    end if;
    return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.enforce_sniper_watchlist_limit() FROM PUBLIC;

GRANT ALL ON FUNCTION public.enforce_sniper_watchlist_limit() TO service_role;

ALTER TABLE public.beta_discord_links
  ALTER COLUMN role_assigned_at DROP NOT NULL;

ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_inventory_item_id_fkey FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES public.inventory_items(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_purchase_id_fkey FOREIGN KEY (workspace_id, purchase_id) REFERENCES public.purchases(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.market_research
  ADD CONSTRAINT market_research_inventory_item_id_fkey FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES public.inventory_items(workspace_id, id) ON DELETE
    SET NULL (inventory_item_id);

ALTER TABLE public.price_tracked_items
  ADD CONSTRAINT price_tracked_items_inventory_item_id_fkey FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES public.inventory_items(workspace_id, id) ON DELETE
    SET NULL (inventory_item_id);

ALTER TABLE public.shipping_orders
  ADD CONSTRAINT shipping_orders_sale_id_fkey FOREIGN KEY (workspace_id, sale_id) REFERENCES public.sales(workspace_id, id) ON DELETE RESTRICT;

CREATE TRIGGER enforce_sniper_watchlist_limit
  BEFORE INSERT OR UPDATE ON public.sniper_watchlists
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sniper_watchlist_limit();

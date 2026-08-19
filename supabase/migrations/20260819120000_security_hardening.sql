-- ==============================================================================
-- sicherheitshaertung der row level security
--
-- zweck:
--   1. schliesst die luecke, ueber die sich jeder angemeldete nutzer selbst in
--      jeden fremden workspace eintragen konnte
--   2. ersetzt die bisherigen "for all"-policies durch getrennte policies je
--      operation und rolle, wie in CLAUDE.md vorgegeben
--   3. setzt search_path in allen security-definer-funktionen
--   4. ergaenzt fehlende delete-policies und indexe
--
-- betroffen: alle tabellen im schema public sowie die hilfsfunktionen
--            is_workspace_member und handle_new_user
--
-- hinweis: dieses skript loescht bestehende policies und legt sie neu an.
--          das ist beabsichtigt und notwendig, weil die alten policies
--          "for all" verwenden und nicht ergaenzt, sondern ersetzt werden
--          muessen. daten werden dabei nicht veraendert.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. hilfsfunktionen
-- ------------------------------------------------------------------------------

-- prueft, ob der aufrufende nutzer mitglied des workspace ist.
-- security definer ist noetig, damit die pruefung nicht selbst wieder durch die
-- rls von workspace_members laeuft (endlosrekursion).
-- set search_path = '' verhindert, dass ein manipulierter suchpfad die funktion
-- auf untergeschobene tabellen umlenkt.
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

-- prueft, ob der aufrufende nutzer den workspace verwalten darf.
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

-- legt einen workspace an und macht den aufrufer in einem schritt zum
-- eigentuemer. ohne diesen weg muesste der client direkt in workspace_members
-- schreiben duerfen - genau die luecke, die hier geschlossen wird.
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

-- legt profil, standard-workspace, mitgliedschaft und quellen fuer einen neu
-- registrierten nutzer an.
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

-- ------------------------------------------------------------------------------
-- 2. alte policies entfernen
--
-- destruktiv: entfernt saemtliche bisherigen zugriffsregeln. die neuen regeln
-- folgen unmittelbar darunter. zwischen diesen beiden bloecken ist der zugriff
-- auf die tabellen vollstaendig gesperrt - das ist innerhalb einer migration
-- unkritisch, da sie als eine transaktion laeuft.
-- ------------------------------------------------------------------------------

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Members can view workspace" on public.workspaces;
drop policy if exists "Members can update workspace" on public.workspaces;
drop policy if exists "Authenticated users can create workspace" on public.workspaces;
drop policy if exists "Members can view membership" on public.workspace_members;
drop policy if exists "Members can insert membership" on public.workspace_members;
drop policy if exists "Sources access" on public.sources;
drop policy if exists "Suppliers access" on public.suppliers;
drop policy if exists "Purchases access" on public.purchases;
drop policy if exists "Purchase Costs access" on public.purchase_costs;
drop policy if exists "Inventory Items access" on public.inventory_items;
drop policy if exists "Item Costs access" on public.item_costs;
drop policy if exists "Item Media access" on public.item_media;
drop policy if exists "Market Research access" on public.market_research;
drop policy if exists "Research Comparables access" on public.research_comparables;
drop policy if exists "Listing Drafts access" on public.listing_drafts;
drop policy if exists "Sales access" on public.sales;
drop policy if exists "Activity Logs access" on public.activity_logs;

-- ------------------------------------------------------------------------------
-- 3. profiles
-- ------------------------------------------------------------------------------

create policy "Eigenes Profil lesen"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Eigenes Profil aendern"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- kein insert: profile entstehen ausschliesslich ueber handle_new_user().
-- kein delete: profile werden ueber das loeschen des auth-nutzers entfernt
-- (on delete cascade).

-- ------------------------------------------------------------------------------
-- 4. workspaces
-- ------------------------------------------------------------------------------

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

-- kein insert: workspaces entstehen ueber public.create_workspace() oder den
-- registrierungs-trigger. ein direktes insert wuerde einen workspace ohne
-- mitgliedschaft erzeugen, den niemand mehr sehen kann.

-- ------------------------------------------------------------------------------
-- 5. workspace_members
--
-- hier lag die schwerwiegendste luecke: die alte policy erlaubte
-- "or user_id = auth.uid()" beim insert. damit konnte sich jeder angemeldete
-- nutzer in jeden beliebigen fremden workspace eintragen und dessen komplette
-- geschaeftsdaten lesen und aendern.
-- ------------------------------------------------------------------------------

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

-- entfernen darf ein verwalter jeden - und jeder sich selbst.
create policy "Mitglied entfernen"
on public.workspace_members for delete to authenticated
using (
  public.is_workspace_admin(workspace_id)
  or user_id = (select auth.uid())
);

-- ------------------------------------------------------------------------------
-- 6. sources
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 7. suppliers
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 8. purchases
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 9. purchase_costs
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 10. inventory_items
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 11. item_costs
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 12. item_media
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 13. market_research
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 14. research_comparables
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 15. listing_drafts
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 16. sales
-- ------------------------------------------------------------------------------

create policy "Verkaeufe lesen"
on public.sales for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Verkauf anlegen"
on public.sales for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "Verkauf aendern"
on public.sales for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Verkauf loeschen"
on public.sales for delete to authenticated
using (public.is_workspace_member(workspace_id));

-- ------------------------------------------------------------------------------
-- 17. activity_logs
-- ------------------------------------------------------------------------------

create policy "Verlauf lesen"
on public.activity_logs for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Verlaufseintrag anlegen"
on public.activity_logs for insert to authenticated
with check (public.is_workspace_member(workspace_id));

create policy "Verlaufseintrag loeschen"
on public.activity_logs for delete to authenticated
using (public.is_workspace_member(workspace_id));

-- kein update: der verlauf ist eine protokollspur und wird nicht nachtraeglich
-- veraendert.

-- ------------------------------------------------------------------------------
-- 18. indexe auf allen spalten, die in policies geprueft werden
--
-- ohne diese indexe fuehrt jede abfrage zu einem vollstaendigen tabellenscan,
-- weil die policy fuer jede zeile ausgewertet wird.
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
create index if not exists idx_activity_logs_workspace_id
  on public.activity_logs (workspace_id);
create index if not exists idx_activity_logs_item_id
  on public.activity_logs (inventory_item_id);

-- ------------------------------------------------------------------------------
-- 19. speicher-bucket item-media absichern
--
-- bisher war der bucket oeffentlich lesbar, und nicht angemeldete besucher
-- durften dateien hochladen und - schwerwiegender - saemtliche dateien
-- loeschen. der zugriff laeuft ab jetzt ueber signierte urls.
-- ------------------------------------------------------------------------------

update storage.buckets
set public = false
where id = 'item-media';

-- destruktiv: entfernt die bisherigen, zu weit gefassten regeln.
drop policy if exists "Public item-media access" on storage.objects;
drop policy if exists "Authenticated users can upload item-media" on storage.objects;
drop policy if exists "Authenticated users can update item-media" on storage.objects;
drop policy if exists "Authenticated users can delete item-media" on storage.objects;
drop policy if exists "Anon users can upload item-media in dev" on storage.objects;
drop policy if exists "Anon users can delete item-media in dev" on storage.objects;

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
-- 20. kommentare
-- ------------------------------------------------------------------------------

comment on function public.is_workspace_member(uuid) is
  'Prueft, ob der aufrufende Nutzer Mitglied des Workspace ist. Basis aller RLS-Policies.';
comment on function public.is_workspace_admin(uuid) is
  'Prueft, ob der aufrufende Nutzer den Workspace verwalten darf (Rolle owner oder admin).';
comment on function public.create_workspace(text) is
  'Legt einen Workspace an und traegt den Aufrufer als Eigentuemer ein. Einziger erlaubter Weg, einen Workspace zu erzeugen.';

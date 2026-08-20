-- ============================================================================
-- Zweck: Lieferanten archivierbar machen statt sie zu loeschen.
--
-- Hintergrund: purchases.supplier_id verweist mit ON DELETE SET NULL auf
-- suppliers. Beim Loeschen bleibt der Einkauf zwar bestehen, verliert aber
-- stillschweigend die Angabe, bei wem eingekauft wurde. Fuer buchhaltungs-
-- relevante Aufzeichnungen ist das der falsche Weg - Stammdaten, auf die
-- Buchungen verweisen, werden deaktiviert, nicht entfernt.
--
-- sources traegt diese Spalte bereits; suppliers bekommt sie hiermit.
--
-- Betroffen: public.suppliers (neue Spalte is_active)
-- ============================================================================

alter table public.suppliers
  add column if not exists is_active boolean not null default true;

comment on column public.suppliers.is_active is
  'Falsch bedeutet archiviert: nicht mehr auswaehlbar, in vorhandenen Einkaeufen aber weiterhin sichtbar.';

-- Ein Index auf die Spalte, weil jede Auswahlliste danach filtert.
create index if not exists idx_suppliers_is_active
  on public.suppliers (workspace_id, is_active);

create index if not exists idx_sources_is_active
  on public.sources (workspace_id, is_active);

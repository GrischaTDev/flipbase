# Archiv und persönliche Tabellenspalten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Erledigte Einzelstücke aus der Arbeitsansicht archivieren, ohne Verkaufsdaten zu verändern, und Tabellen individuell verschlanken.
**Architecture:** Archivierung als getrenntes Metadatum am Einzelstück, nicht als Ersatz des Verkaufsstatus. Ein zentraler persönlicher Spalten-Service und eine datenlose Shared-Auswahl steuern bestehende Tabellen.
**Tech Stack:** Angular 22, Tailwind, Supabase/Postgres, bestehende Auth-Komforteinstellungen.
**Spec:** docs/superpowers/specs/2026-09-05-admin-workflow-refresh.md Paket 4, freigegeben.

## Global Constraints

- Eigener Worktree, englischer Code/Commits, deutsche Oberfläche, keine Veröffentlichung oder Produktionsdatenänderung.
- Niemals Verkauf, Kosten, Bestandsbewegungen oder Einkaufsverweise löschen/verändern, um einen Artikel auszublenden.
- Keine automatischen Archivierungen bestehender Daten. Explizite Nutzeraktion mit erklärender Bestätigung; Wiederherstellung möglich.
- Persönliche Spalten sind Komfortdaten, keine Berechtigungen; pro Benutzer gespeichert, Demo getrennt lokal. Auth-Metadaten dürfen nicht zur Autorisierung dienen.
- Inter, gelbe Akzente, dunkle Anthrazitflächen erhalten; Shop/Landing nicht umgestalten.
- Neue Schemaänderungen deklarativ, generierte Migration und Typen im gleichen Commit, pgTAP-Rechteprüfung. Fremde Container/Arbeitsstände nicht anfassen.

## Task 1: Archivierung und Spaltenwahl

**Files:** Create `supabase/schemas/97_inventory_archive.sql`, generated migration and `supabase/tests/inventory_archive.test.sql`; modify inventory table declaration in `supabase/schemas/database.sql` only for appended archive metadata columns, regenerate `src/app/core/models/supabase.types.ts`; extend `core/models/flipbase.models.ts`, `core/services/inventory.service.ts`, `core/services/mock-data-store.service.ts`; create `features/inventory/services/inventory-archive.service.ts` and tests. Modify `features/inventory/inventory.component.ts/.html`, `components/stock-position-list/*` and inventory presentation model/utils if needed. Create `core/services/table-preferences.service.ts`, `core/models/table-preferences.ts` plus tests, `shared/components/table-column-picker/*`. Integrate with inventory, sales table (`features/sales/sales.component.ts/.html`), catalog table (`features/catalog/catalog.component.ts/.html`) and purchase article table (`features/purchases/components/purchase-detail-table/*`, parent wires preferences). Add `e2e/inventory-archive-columns.spec.ts`.

**Interfaces:**

```ts
// InventoryItem additional read-only metadata:
// archived_at?: string | null; archived_by?: string | null;
// InventoryArchiveService.setArchived(workspaceId:string,itemId:string,archived:boolean):Promise<void>
export interface TableColumnOption {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
}
// TablePreferencesService: visibleColumns(tableId:string, definitions:readonly TableColumnOption[]):readonly string[]
// setVisibleColumns(tableId:string, columnIds:readonly string[]):void; reset(tableId:string):void
// picker inputs definitions, selected; output selectedChange (no server access).
```

- [ ] RED tests: a sold item archives while its `status === 'sold'`, revenue/cost/history identical; remaining stock/unclear sales rejected; restore changes archive metadata only. Table selection persists across reload and user switches reset it; unknown stored IDs ignored, required columns cannot disappear.
- [ ] Add nullable `archived_at` and `archived_by` at end of inventory_items declaration. Expose server RPC `set_inventory_item_archived(p_workspace_id uuid,p_item_id uuid,p_archived boolean)`: authenticate member of active workspace, lock target item, ensure same workspace, archive only confirmed sold individual (`inventory_item_sale_states` exactly one valid active sale, no conflict/legacy unresolved state). Restore permitted for existing archived item; idempotent requests no duplicated event. Update archive metadata only, use authenticated actor/server time, append existing business event `inventory_item_archived`/`inventory_item_restored`. Use SECURITY DEFINER only to pass existing finalized-item guards, with explicit authentication/scope checks, empty search_path, revoked public/anon execute. Direct client mutation of archive fields blocked by dedicated trigger; existing bookkeeping guards retained.
- [ ] Return/restock must not leave available inventory hidden: active view includes archived-at items if the actual recorded sale no longer marks them sold, archive view only includes archived-and-still-sold. Display clear restore action; archive metadata itself does not determine stock or sellability. Normal repeatable products with zero stock remain active; do not automatically archive catalog products. Legacy `status='archived'` continues to be discoverable but never mutate sold status to that value.
- [ ] Service applies successful metadata to list/detail and demo state only for matching request workspace; failures do not show success, duplicate actions blocked. Inventory offers `Aktiv`, `Archiv`, `Alle`; initial active excludes explicitly archived completed items, not all sold items. Archive action distinct from edit/delete and available despite sold-item edit lock. Confirmation explains `Der Verkauf und alle Buchungen bleiben erhalten.` Restore labelled `Aus Archiv holen`. Revenue/history remain accessible from archive rows.
- [ ] Implement root personal table preferences under one versioned Auth user_metadata key `table_preferences_v1`, only that key in updateUser (preserve other keys). Parse untrusted shape/known IDs, serialize/coalesce saves, prevent stale user/logout responses and cross-user queued writes. Demo storage distinct. Reuse proven dashboard preference patterns without duplicating its domain state. Show save error next to picker; current session choice remains usable on failure.
- [ ] Implement accessible Spalten button + checkbox panel, all labels, Escape/outside handling using existing Shared popover/dialog conventions. Required identity and action columns fixed; default all current columns visible. Inventory options Zustand/Bestand/Status/Herkunft/Kosten pro Stück/Bestandswert/Verkauf; sales Menge/Plattform/Datum/Verkaufserlös/Wareneinsatz/Verkaufskosten/Ergebnis/Marge/Haltedauer; catalog existing optional columns; purchase article table existing optional columns. Conditional headers and cells together, dynamic colspan, useful minimum width shrinks with selected columns, no duplicate table DOM. Saved selections independent per table.
- [ ] Generate/review/apply migration locally without reset; pgTAP proves member vs outsider/anon/archived-workspace, direct archive spoof rejection, valid sold archives, active item rejection, archive/restore totals and sale links unchanged. Target tests, changed-file lint/format and build; UI hide/show/reload + archive/restore without loss of history. Commit `feat(inventory): add archive and personal table columns`; controller owns AI-CHANGELOG.

## Task 2: Abnahme

- [ ] Independent task review, original implementer fixes and scoped rereview.
- [ ] Main local account verifies archive/restore and preference reload, viewport/axe and no changes to financial totals.
- [ ] Document outcomes; continue EAN/CSV package without publication.

## Self-review

Archive metadata does not overload sold status. Restocked items are visible even if historical archive metadata remains. No dependency on comment APIs; existing business event records provide chronology. Spaltenauswahl applies to actual tables, not the intentionally retained purchase overview cards.

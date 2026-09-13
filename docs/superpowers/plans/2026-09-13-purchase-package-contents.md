# Purchase package contents implementation plan

**Goal:** Ein gekauftes Paket mit unverändertem Rechnungspreis erfassen und seinen später ausgepackten Inhalt als einzeln verkäufliche Artikel mit dauerhafter Herkunft führen.

**Architecture:** Die Einkaufsposition erhält `is_package`; sie erzeugt keinen verkäuflichen Paketartikel. Die enthaltenen Inventarartikel verweisen über `source_package_line_id` auf diese Position und über `purchase_id` auf den Einkauf. Ihre nicht bekannten Kosten bleiben ausdrücklich unbekannt, auch beim Verkauf.

**Tech Stack:** Bestehendes Angular 22, Signals, Supabase/Postgres, Vitest, Playwright.

**Spec:** Der vom Nutzer bestätigte Ablauf im Chat; diese Spezifikation ersetzt den früheren Vorschlag eines verkäuflichen Paketbestands in `docs/audit/2026-09-13-mystery-pack-model.md`.

**Status:** Lokal umgesetzt und geprüft; Push, PR und Merge stehen noch aus.

## Global constraints

- Paketpreis 100 Euro und zwei ausgepackte Paar Schuhe ergeben weiterhin genau eine bezahlte Paketposition zu 100 Euro, zwei Inventarartikel, keinen Paketartikel im Verkauf.
- Normale bekannte Einzelpreise und bestehende Einkaufsdaten bleiben erhalten. Keine automatische Umdeutung vorhandener Mystery-Einkäufe.
- Keine automatische Gleichverteilung, keine erfundenen Rechnungspreise und keine unbekannten Kosten als null Euro. Eine interne Bewertung ist von der Rechnung getrennt. Noch ungeklärte Werte dürfen keine verlässlichen Gewinne oder steuerlichen Exporte vortäuschen.
- Die Inhalte können in mehreren Erfassungsschritten ergänzt werden. Wiederholung derselben Anfrage erzeugt keine Duplikate. Verkäufe bleiben zum Einkauf nachvollziehbar; Paketpreis wird nicht je Inhalt erneut als Kosten gezählt.
- Ein Paar Schuhe ist ein Inventarartikel. Bild- und ausführliche Produktbearbeitung verwenden anschließend die vorhandene Artikelbearbeitung.
- Benutzertexte deutsch, gemeinsame UI-Komponenten, Markenfarbe #fcc601, Fokus und Fehlerbehandlung zugänglich.
- Nur eigener Worktree; keine Produktionsänderungen, kein Push/PR bis lokale Umsetzung geprüft und Nutzerfreigabe erteilt.

## Shared interfaces

```ts
// Ergänzungen vorhandener Modelle
// PurchaseLine.is_package?: boolean
// InventoryItem.source_package_line_id?: string | null
// InventoryItem.allocated_purchase_cost: number | null
// SaleLine.cost_of_goods_sold: number | null
export interface PackageContentInput {
  readonly title: string;
  readonly condition: ItemCondition;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly description?: string | null;
  readonly expected_value?: number | null;
}
// CreatePurchaseLineInput / PurchaseLineDraft: readonly isPackage?: boolean
// RPC capture_purchase_package_contents(p_workspace_id uuid,
//   p_purchase_line_id uuid, p_items jsonb, p_request_id uuid) returns jsonb:
// { inventory_items: InventoryItem[], purchase_line: PurchaseLine }
// JSON pro Inhalt entspricht PackageContentInput; Menge entsteht aus Arraylänge.
// PurchasePackageService.capture(lineId, items, requestId):
// Promise<MutationResult<InventoryItem[]>>
```

### Task 1: Database package origin and nullable valuation

**Files:** `supabase/schemas/database.sql`, new `supabase/schemas/140_purchase_package_contents.sql`, `supabase/config.toml`, generated migration and `src/app/core/models/supabase.types.ts`, new `supabase/tests/purchase_package_contents.test.sql`.

- [x] Add explicit package flag to all create/edit/line RPCs; package requires individual kind, no catalog reference, quantity one and known package price. Mixed purchases supported. Preserve original price at finalization. No package stock/inventory placeholder.
- [x] Atomic capture RPC with membership, purchase state, package origin, payload and request replay validation; lock package, record journal, create individually identifiable items with unknown costs. Origin FK includes workspace. Guard ordinary receive/finalize/correct/reopen/delete paths against accidental duplication or lost origins. Capture after physical arrival, including finalized purchase. Repeated batches supported.
- [x] Nullable business costs for package contents and their sale snapshots; existing normal cost invariants remain. Preserve unknown tax purchase price. Sales and returns keep provenance, no fabricated valuation.
- [x] Tests: 100-euro package creates no saleable pack; capture two articles with NULL costs; invoice remains100; replay no duplicates; alien workspace rejected; invalid payload atomic; subsequent capture; sale/return reference preserved; finalization/correction never allocates pack price to each child; origin cannot be detached.
- [x] Generate migration from schema, verify local isolated database and generated types. Do not stop or reset shared Supabase containers.

### Task 2: Purchase persistence and demo parity

**Files:** `src/app/core/services/purchase.service.ts`, `src/app/core/services/mock-data-store.service.ts`, `src/app/core/services/purchase-costing.service.ts`, relevant tests, new `src/app/features/purchases/services/purchase-package.service.ts` and tests.

- [x] Carry isPackage through all create/edit/load/demo mappings; exclude package from regular receive actions and creation of saleable inventory at finalization.
- [x] Implement typed package service capture using shared RPC contract, workspace guard, reload and safe errors. Demo behavior matches live, including request replay, origin, null valuation and journal. Do not update core domain models (controller owns these).
- [x] Tests preserve package price100 and source linkage for two individual shoes; demo cannot create package stock or replace NULL costs by0.

### Task 3: Unknown valuation throughout inventory and sales

**Files:** `src/app/core/services/inventory.service.ts`, `src/app/core/services/sales.service.ts`, financial utilities/services and inventory/sales/catalog components as necessary (exclude purchase feature/services, models and mock store), corresponding tests.

- [x] Preserve explicitly unknown `allocated_purchase_cost` and `cost_of_goods_sold`; distinguish valid0 from NULL. Package contents remain individually editable/sellable via existing item route.
- [x] Unknown per-item costs display Offen and cannot become a claimed profit or valid tax-export basis. Preserve known-cost behavior and original sales snapshots. Package origin remains read-only in item editing.
- [x] Targeted tests cover loading, sale, dashboard/profit and export with unknown package costs. Fix nullable type errors in owned files only; report others.

### Task 4: User workflow and integration (controller)

**Files:** core domain models; purchase line editor/form; purchase detail; new package contents component; purchase presentation utilities; tests and documentation.

- [x] Add secondary Paket hinzufügen action; quantity1, editable title and paid price; description in existing purchase notes; no mandatory global product-kind chooser.
- [x] Purchase detail lists packages separately with Inhalt erfassen and captured items, status, sale proceeds, item navigation. Capture form asks title, condition and optional description/expected selling value, never mandatory unit purchase price.
- [x] Display original package price and proceeds separately. Partial sales show remaining contents, no final package-profit claim.
- [x] Run targeted Angular/unit tests, full production build, targeted DB tests, browser workflow and AXE. Review complete diff, format/lint changed files; document actual tests and remaining limits. Ask required PR approval only once work is concrete and locally checked.

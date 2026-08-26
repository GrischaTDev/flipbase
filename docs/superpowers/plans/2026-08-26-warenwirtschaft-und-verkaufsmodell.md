# Warenwirtschafts- und Verkaufsmodell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flipbase führt gleichartige Artikel als mengenbasierten Bestand mit nachvollziehbaren Einkaufslosen, bucht Verkäufe atomar und berechnet Dashboard-Werte aus denselben Verkaufs- und Bestandsdaten.

**Architecture:** Neue Artikelstämme, Einkaufspositionen, Bestandlose, Bestandsbewegungen und Verkaufspositionen ergänzen die vorhandenen Einzelartikel. Neue Mengenartikel verwenden diese Tabellen; vorhandene `inventory_items` bleiben unverändert als Einzelstücke bestehen. Datenbank-RPCs buchen Wareneingang, Verkauf und Rückgabe transaktional, während Angular-Services nur bestätigte Ergebnisse in Signals übernehmen.

**Tech Stack:** Angular 22 mit Signals und Reactive Forms, Tailwind CSS, Supabase/PostgreSQL mit RLS und SQL-RPCs, Vitest, native SVG für Diagramme.

**Spec:** `docs/superpowers/specs/2026-08-26-warenwirtschaft-und-verkaufsmodell-design.md`

## Global Constraints

- Alle neuen UI-Komponenten sind Angular-22-Standalone-Komponenten mit `ChangeDetectionStrategy.OnPush`, externen HTML-Templates, Signals und Reactive Forms.
- Tailwind-Klassen stehen direkt in Templates; neue SCSS-Dateien werden nicht angelegt.
- Die deklarative Datenbankquelle ist ausschließlich `supabase/schemas/database.sql`; Migrationen entstehen danach mit `supabase db diff`.
- Jede neue Tabelle erhält RLS, getrennte Policies je Operation und Rolle sowie Indizes auf den in Policies verwendeten Spalten.
- Neue SQL-Funktionen verwenden `security invoker`, `set search_path = ''`, vollqualifizierte Namen und erhalten nur `authenticated`-Ausführungsrechte.
- Vorhandene Einkäufe, Inventarartikel, Verkäufe, Medien und Kosten werden weder gelöscht noch automatisch zusammengeführt.
- Erfolgs-Toast erst nach bestätigter Datenbankantwort; fehlgeschlagene Aktionen bleiben als roter Toast sichtbar.
- Es wird keine Chart-Abhängigkeit installiert: Das Dashboard verwendet eine kleine native SVG-Komponente.
- Während der Umsetzung nur gezielte Tests je fachlichem Meilenstein; `typecheck`, komplette Testsuite und Produktions-Build einmal am Ende.
- Git-Commit-Nachrichten sind immer Englisch.

---

## File Structure

| Datei                                                                                                 | Verantwortung                                                                                             |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `supabase/schemas/database.sql`                                                                       | Tabellen, Constraints, RLS, Indizes und transaktionale RPCs für Katalog, Bestand und Verkäufe.            |
| `src/app/core/models/flipbase.models.ts`                                                              | Fachliche TypeScript-Modelle für Artikelstämme, Lose, Bewegungen, Verkaufspositionen und Dashboard-Daten. |
| `src/app/core/models/supabase.types.ts`                                                               | Nach der Migration aus dem lokalen Schema generierte Supabase-Typen.                                      |
| `src/app/core/services/catalog.service.ts`                                                            | Laden und Anlegen von Artikelstämmen.                                                                     |
| `src/app/core/services/stock.service.ts`                                                              | Laden von Bestandspositionen, Wareneingang, Korrekturen und bestätigte Bestandsbewegungen.                |
| `src/app/core/services/purchase.service.ts`                                                           | Einkauf mit Positionsdaten; ersetzt nur für neue Einkäufe die direkte Einzelartikel-Anlage.               |
| `src/app/core/services/sales.service.ts`                                                              | Verkauf, Retouren und lokale Aktualisierung über atomare RPCs statt Status-Nachläufern.                   |
| `src/app/core/services/store.service.ts`                                                              | Warenkorb und Checkout für Einzelstücke und Mengenartikel.                                                |
| `src/app/core/services/dashboard-report.service.ts`                                                   | Zeitraumgefilterte Kennzahlen, Zeitreihen und Tabellenzeilen aus bestätigten Daten.                       |
| `src/app/features/catalog/catalog.component.{ts,html}`                                                | Artikelstamm-Verwaltung und Suche nach bestehenden Artikeln.                                              |
| `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.{ts,html}` | Wiederverwendbarer Editor für Einkaufspositionen mit Menge, Stückpreis und Gesamtpreis.                   |
| `src/app/features/inventory/components/stock-position-list/stock-position-list.component.{ts,html}`   | Aufgeräumte Bestandsliste für Mengenartikel mit Links zu Losen und Bewegungen.                            |
| `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.{ts,html}`           | Mehrpositions-Verkaufsdialog mit Menge und Pflichtfeldern.                                                |
| `src/app/shared/components/revenue-chart/revenue-chart.component.{ts,html}`                           | Native, zugängliche SVG-Zeitreihe für Umsatz, Ausgaben und Gewinn.                                        |
| `src/app/features/dashboard/dashboard.component.{ts,html}`                                            | Zeitraumsteuerung, Kennzahlen, Diagramm und Verkaufstabelle.                                              |
| Bestehende `*.spec.ts` nahe der oben genannten Dienste und Komponenten                                | Gezielt prüfbare Geschäftsregeln und Fehlerfälle.                                                         |

## Task 1: Datenmodell für Artikelstamm, Einkaufsposition, Bestandslos und Verkaufslinie

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `src/app/core/models/flipbase.models.ts`
- Create: `src/app/core/models/supabase.types.ts` (generiert)
- Test: `supabase/tests/inventory_sales_schema.sql`

**Interfaces:**

- Produces: `CatalogProduct`, `PurchaseLine`, `StockLot`, `StockMovement`, `SaleLine`, `SaleLineLotAllocation`, `StockPosition`.
- Produces: Tabellen `public.catalog_products`, `public.purchase_lines`, `public.stock_lots`, `public.stock_movements`, `public.sale_lines`, `public.sale_line_lot_allocations` sowie `purchases.receiving_status`.
- Produces: `public.sales.inventory_item_id` als optionale Altverknüpfung und `public.inventory_items.purchase_line_id` als optionale Herkunftsverknüpfung.

- [ ] **Step 1: Schema-Vertrag als SQL-Test formulieren.**

  Create `supabase/tests/inventory_sales_schema.sql` with checks for the essential columns and constraints:

  ```sql
  begin;

  select public.assert_table_has_columns(
    'catalog_products',
    array['id', 'workspace_id', 'title', 'tracking_mode', 'is_public_store']
  );
  select public.assert_table_has_columns(
    'stock_lots',
    array['purchase_line_id', 'catalog_product_id', 'received_quantity', 'remaining_quantity', 'unit_cost']
  );
  select public.assert_table_has_columns(
    'sale_lines',
    array['sale_id', 'catalog_product_id', 'inventory_item_id', 'quantity', 'unit_sale_price', 'cost_of_goods_sold']
  );

  rollback;
  ```

  If the repository does not yet provide `assert_table_has_columns`, add a local `information_schema.columns` assertion block in this test file; do not add a production function only for testing.

- [ ] **Step 2: Den Schema-Test einmal gegen das lokale Supabase-Schema ausführen.**

  Run: `npx supabase db reset && psql "$SUPABASE_DB_URL" -f supabase/tests/inventory_sales_schema.sql`

  Expected: FAIL because the six domain tables and their columns do not exist yet. This command is only for the local Supabase environment, never for the production database.

- [ ] **Step 3: Tabellen, Constraints, Indizes und RLS deklarativ implementieren.**

  Add the following relationships to `supabase/schemas/database.sql` using lower-case SQL:

  ```sql
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
    unique (workspace_id, ean)
  );

  create table public.purchase_lines (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    purchase_id uuid not null references public.purchases(id) on delete cascade,
    catalog_product_id uuid references public.catalog_products(id) on delete restrict,
    title_snapshot text not null,
    line_kind text not null check (line_kind in ('quantity', 'individual')),
    ordered_quantity integer not null check (ordered_quantity > 0),
    received_quantity integer not null default 0 check (received_quantity >= 0 and received_quantity <= ordered_quantity),
    unit_purchase_price numeric(12,2) not null check (unit_purchase_price >= 0),
    line_total numeric(12,2) not null check (line_total >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((line_kind = 'quantity' and catalog_product_id is not null) or line_kind = 'individual')
  );

  create table public.stock_lots (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    purchase_id uuid not null references public.purchases(id) on delete restrict,
    purchase_line_id uuid not null references public.purchase_lines(id) on delete restrict,
    catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
    received_quantity integer not null check (received_quantity > 0),
    remaining_quantity integer not null check (remaining_quantity >= 0 and remaining_quantity <= received_quantity),
    unit_cost numeric(12,2) not null check (unit_cost >= 0),
    received_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  );
  ```

  Add `stock_movements`, `sale_lines`, and `sale_line_lot_allocations` with a positive `quantity` plus explicit `direction` (`in` or `out`) for movements. `sale_lines` must enforce exactly one of `catalog_product_id` and `inventory_item_id` using `num_nonnulls(...) = 1`; `sale_line_lot_allocations` must have `quantity > 0` and preserve the `unit_cost` used at sale time.

  Add `receiving_status text not null default 'received' check (receiving_status in ('draft', 'ordered', 'partially_received', 'received', 'archived'))` to `purchases`; retain all existing purchases as `received`. Add `tax_mode text not null` to `sale_lines` and snapshot the applicable tax mode at booking time. Add `listing_price` to `catalog_products` for a deliberate public-store price; never derive a shop price from its purchase cost.

  Add `purchase_line_id uuid references public.purchase_lines(id) on delete set null` to `inventory_items`, change the existing `sales.inventory_item_id` to nullable, and preserve all old rows. Add `sale_price_total numeric(12,2)` to `sales`; backfill it from `sale_price` and retain `sale_price` for old single-item consumers until their refactor is complete.

  Enable RLS on every new table. Add `select`, `insert`, `update`, and `delete` policies separately for `authenticated`, scoped by `public.is_workspace_member(workspace_id)`; omit update/delete policies from `stock_movements` and allocation tables so their history cannot be changed through the client. Add indexes on `workspace_id`, all foreign-key lookup columns, `stock_lots(workspace_id, catalog_product_id, received_at, id)`, and `stock_movements(workspace_id, created_at desc)`.

- [ ] **Step 4: Die TypeScript-Modelle ergänzen und die generierten Datenbanktypen aktualisieren.**

  Add the domain interfaces and exact enums to `flipbase.models.ts`:

  ```ts
  export type TrackingMode = 'quantity' | 'individual';
  export type StockMovementReason =
    | 'receipt'
    | 'sale'
    | 'return'
    | 'correction'
    | 'damage'
    | 'loss'
    | 'reservation'
    | 'reservation_release';

  export interface StockPosition {
    catalog_product_id: string;
    title: string;
    available_quantity: number;
    reserved_quantity: number;
    on_hand_quantity: number;
    oldest_available_unit_cost: number | null;
    is_public_store: boolean;
  }

  export interface SaleLine {
    id: string;
    sale_id: string;
    catalog_product_id?: string | null;
    inventory_item_id?: string | null;
    title_snapshot: string;
    quantity: number;
    unit_sale_price: number;
    line_total: number;
    cost_of_goods_sold: number;
    tax_mode: TaxMode;
  }
  ```

  Regenerate types after the local migration is applied:

  ```powershell
  npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
  ```

- [ ] **Step 5: Den Schema-Vertrag erneut ausführen und den Fundament-Commit anlegen.**

  Run: `npx supabase db reset && psql "$SUPABASE_DB_URL" -f supabase/tests/inventory_sales_schema.sql`

  Expected: PASS; existing inventory and sale rows remain present after the migration path.

  ```powershell
  git add supabase/schemas/database.sql supabase/migrations src/app/core/models/flipbase.models.ts src/app/core/models/supabase.types.ts supabase/tests/inventory_sales_schema.sql
  git commit -m "feat: add inventory lot data model"
  ```

### Task 2: Atomare Wareneingangs-, Verkaufs- und Rückgabe-RPCs

**Files:**

- Modify: `supabase/schemas/database.sql`
- Test: `supabase/tests/inventory_sales_transactions.sql`

**Interfaces:**

- Consumes: Tabellen und Constraints aus Task 1.
- Produces: `public.receive_purchase_lines(...)`, `public.record_sale(...)`, `public.record_sale_return(...)`.
- Produces: JSON-Rückgaben mit Verkauf, Verkaufspositionen, Losentnahmen und neuen Bestandsmengen.

- [ ] **Step 1: Transaktionsfälle in einem SQL-Test definieren.**

  Create `supabase/tests/inventory_sales_transactions.sql` with a disposable workspace, a quantity-tracked LED lamp, one purchase line with quantity five and two sale calls. Assert the following sequence:

  ```sql
  -- after receipt: remaining_quantity = 5
  -- after selling quantity 2: remaining_quantity = 3 and cogs = 9.98
  -- selling quantity 4 raises "Nicht genügend verfügbarer Bestand"
  -- after full return of the first sale: remaining_quantity = 5
  ```

  Use 4.99 as the unit cost and 9.99 as the unit sale price in the fixture. The test must verify that the sale header and exactly one sale line are created for the two-unit sale.

- [ ] **Step 2: Den Transaktionstest gegen den bisherigen Stand ausführen.**

  Run: `psql "$SUPABASE_DB_URL" -f supabase/tests/inventory_sales_transactions.sql`

  Expected: FAIL because the three RPCs do not exist.

- [ ] **Step 3: `receive_purchase_lines` als einzelne Datenbanktransaktion implementieren.**

  Add a `security invoker` PL/pgSQL function with this public signature:

  ```sql
  public.receive_purchase_lines(
    p_workspace_id uuid,
    p_purchase_id uuid,
    p_lines jsonb
  ) returns jsonb
  ```

  Each JSON line contains `purchase_line_id`, `received_quantity`, and `received_at`. Validate workspace membership, ownership of every purchase line, a positive quantity, and that the cumulative receipt does not exceed `ordered_quantity`. Lock each purchase line with `for update`, increase `received_quantity`, create one `stock_lots` row for quantity lines, and insert one `stock_movements` row with reason `receipt` and direction `in`. The RPC rejects an `individual` line: its existing `inventory_items` record is received through the explicit single-item path in Task 4. Return the affected lines and lots as JSON. Update `purchases.receiving_status` to `partially_received` or `received` only after all supplied lines succeed.

- [ ] **Step 4: `record_sale` und `record_sale_return` mit FIFO-Entnahme implementieren.**

  Add these signatures:

  ```sql
  public.record_sale(
    p_workspace_id uuid,
    p_sale jsonb,
    p_lines jsonb
  ) returns jsonb;

  public.record_sale_return(
    p_workspace_id uuid,
    p_sale_id uuid,
    p_refund_amount numeric,
    p_restock boolean,
    p_reason text,
    p_notes text
  ) returns jsonb;
  ```

  `record_sale` must require platform, ISO sale date, at least one line, positive integer quantity and positive unit sale price. For a quantity line, lock matching lots ordered by `received_at, id`, consume until the requested quantity is covered, decrement `remaining_quantity`, persist one allocation per consumed lot and create a matching `stock_movements` row with direction `out`. For an individual line, lock the `inventory_items` row, reject a sold/archived item, create one sale line with quantity one and update its status within the same transaction. Set `sales.sale_price_total` and legacy `sales.sale_price` to the sum of all line totals.

  `record_sale_return` must mark the sale returned, store the refund amount, create the explicit return movements and restore quantity only when `p_restock` is true. It must not delete the sale, sale lines, allocations, or original sale movements.

  Finish each function with `revoke all on function ... from public; grant execute on function ... to authenticated;`.

- [ ] **Step 5: Transaktionstest wiederholen und committen.**

  Run: `psql "$SUPABASE_DB_URL" -f supabase/tests/inventory_sales_transactions.sql`

  Expected: PASS; the oversell call rolls back completely and has not created a partial sale.

  ```powershell
  git add supabase/schemas/database.sql supabase/migrations supabase/tests/inventory_sales_transactions.sql src/app/core/models/supabase.types.ts
  git commit -m "feat: add atomic inventory sales transactions"
  ```

### Task 3: Kern-Services und bestätigten lokalen Zustand einführen

**Files:**

- Create: `src/app/core/services/catalog.service.ts`
- Create: `src/app/core/services/catalog.service.spec.ts`
- Create: `src/app/core/services/stock.service.ts`
- Create: `src/app/core/services/stock.service.spec.ts`
- Modify: `src/app/core/services/purchase.service.ts`
- Modify: `src/app/core/services/sales.service.ts`
- Modify: `src/app/core/services/mock-data-store.service.ts`
- Test: `src/app/core/services/sales.service.spec.ts`

**Interfaces:**

- Consumes: Task-1 types and Task-2 RPCs.
- Produces: `CatalogService.products`, `StockService.positions`, `StockService.receivePurchaseLines`, `SalesService.recordSale` and `SalesService.recordReturn`.

- [ ] **Step 1: Die Service-Verträge als gezielte Vitest-Fälle schreiben.**

  Create tests that mock the Supabase client and assert these public results:

  ```ts
  await stockService.receivePurchaseLines(purchaseId, [{ purchaseLineId, receivedQuantity: 5 }]);
  expect(stockService.positions()[0].available_quantity).toBe(5);

  await salesService.recordSale({
    platform: 'vinted',
    saleDate: '2026-08-26',
    lines: [{ catalogProductId, quantity: 2, unitSalePrice: 9.99 }],
  });
  expect(salesService.sales()[0].lines[0].quantity).toBe(2);
  ```

  Add an error test where the RPC returns `Nicht genügend verfügbarer Bestand`; it must leave the service signals unchanged and expose an error result.

- [ ] **Step 2: Nur diese neuen Service-Tests ausführen.**

  Run: `npx vitest run src/app/core/services/catalog.service.spec.ts src/app/core/services/stock.service.spec.ts src/app/core/services/sales.service.spec.ts`

  Expected: FAIL because the service APIs are not implemented.

- [ ] **Step 3: Katalog- und Bestandsservice implementieren.**

  Implement the following exact public APIs; return `{ data, error, reportedBySyncStatus }` and change Signals only after a successful Supabase response:

  ```ts
  export interface ReceivePurchaseLineInput {
    purchaseLineId: string;
    receivedQuantity: number;
    receivedAt?: string;
  }

  class CatalogService {
    readonly products = signal<CatalogProduct[]>([]);
    async loadProducts(workspaceId: string): Promise<void>;
    async createProduct(input: CreateCatalogProductInput): Promise<MutationResult<CatalogProduct>>;
  }

  class StockService {
    readonly positions = signal<StockPosition[]>([]);
    readonly movements = signal<StockMovement[]>([]);
    async loadPositions(workspaceId: string): Promise<void>;
    async receivePurchaseLines(
      purchaseId: string,
      lines: readonly ReceivePurchaseLineInput[],
    ): Promise<MutationResult<ReceivePurchaseResult>>;
  }
  ```

  `StockService.loadPositions` must aggregate only the lot rows with `remaining_quantity > 0`; it must not derive stock from item statuses. Keep the mock-data store explicit: quantity products and their lots need an in-memory representation instead of faking five duplicated inventory items.

- [ ] **Step 4: `PurchaseService` und `SalesService` auf die neuen RPCs umstellen.**

  Replace `SalesService.createSale` plus its deferred inventory-status follow-up queue with one `recordSale` RPC call. Keep read compatibility by mapping existing sales to a single legacy `SaleLine`; new sales always load their persisted `lines` and allocations. Replace direct status manipulation in purchase receipt handling with `StockService.receivePurchaseLines` for quantity positions. Retain `InventoryService.createItem` only for explicit individual-item flows.

- [ ] **Step 5: Die drei Service-Tests erneut ausführen und committen.**

  Run: `npx vitest run src/app/core/services/catalog.service.spec.ts src/app/core/services/stock.service.spec.ts src/app/core/services/sales.service.spec.ts`

  Expected: PASS, including the unchanged-signal test for an RPC error.

  ```powershell
  git add src/app/core/services src/app/core/models
  git commit -m "feat: add catalog and stock services"
  ```

### Task 4: Einkauf mit Positionseditor und explizitem Wareneingang

**Files:**

- Create: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.ts`
- Create: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html`
- Create: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.spec.ts`
- Modify: `src/app/features/purchases/purchases.component.ts`
- Modify: `src/app/features/purchases/purchases.component.html`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- Test: `src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts`

**Interfaces:**

- Consumes: `CatalogService.products`, `PurchaseLine`, `StockService.receivePurchaseLines`.
- Produces: Neue Einkäufe mit `purchase_lines`; Wareneingang bucht nur tatsächlich eingegangene Mengen.

- [ ] **Step 1: Editor-Verhalten als Komponententest schreiben.**

  Test one new quantity row with `quantity = 5` and `unitPurchasePrice = 4.99`. Assert `lineTotal = 24.95`. Then set `lineTotal = 29.95` and assert the editor calculates `unitPurchasePrice = 5.99` without rounding beyond two decimal places. Add a test that the individual-item path emits `lineKind: 'individual'` and quantity one.

- [ ] **Step 2: Den einzelnen Editor-Test ausführen.**

  Run: `npx vitest run src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.spec.ts`

  Expected: FAIL because the shared editor does not exist.

- [ ] **Step 3: Den Positionseditor implementieren und in die Einkaufserfassung einbauen.**

  Use a typed `FormArray` of row groups with the exact controls `catalogProductId`, `titleSnapshot`, `lineKind`, `orderedQuantity`, `unitPurchasePrice`, and `lineTotal`. Offer three explicit actions in the UI:

  ```text
  Bestehenden Artikel wählen → Mengenartikel mit Artikelstamm
  Neuen Bestandsartikel anlegen → neuen Artikelstamm öffnen und auswählen
  Einzelstück / Mystery-Inhalt → individueller Artikel, Menge fest 1
  ```

  Recalculate only the untouched price field when two values are known. Label all inputs with `Menge`, `EK je Stück` and `Positionssumme`; do not use the ambiguous label `Einkaufswert`.

- [ ] **Step 4: Die Detailseite vom parallelen Schnellformular bereinigen.**

  Replace the current `itemForm` quick-add block in `purchase-detail` with the same `app-purchase-line-editor`. Add a `Wareneingang buchen` action showing ordered, already received and now received quantity. It invokes `StockService.receivePurchaseLines`; success reloads the purchase, stock positions and visible item count. Keep `Artikel erfassen` only as the explicit individual-item action for a mystery content row: it creates an `inventory_items` record with both `purchase_id` and `purchase_line_id`, then marks exactly that individual purchase line as received without creating a quantity lot.

- [ ] **Step 5: Editor-Test ausführen und committen.**

  Run: `npx vitest run src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts`

  Expected: PASS; five LED lamps are one purchase line and no longer five independently submitted create-item requests.

  ```powershell
  git add src/app/features/purchases src/app/core/services/purchase.service.ts
  git commit -m "feat: add purchase line receiving workflow"
  ```

### Task 5: Artikelstamm und aufgeräumte Bestandsansicht

**Files:**

- Create: `src/app/features/catalog/catalog.component.ts`
- Create: `src/app/features/catalog/catalog.component.html`
- Create: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.ts`
- Create: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.html`
- Create: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/sidebar/sidebar.component.ts`
- Modify: `src/app/features/inventory/inventory.component.ts`
- Modify: `src/app/features/inventory/inventory.component.html`

**Interfaces:**

- Consumes: `CatalogService`, `StockService.positions`, existing `InventoryService.items` for individual items.
- Produces: `/catalog` route and a combined inventory page with one stock line per catalog product.

- [ ] **Step 1: Die Bestandsaggregation als Komponententest beschreiben.**

  Feed `StockPositionListComponent` two lots for the same LED lamp with remaining quantities three and five. Assert exactly one rendered position with `8 Stück verfügbar`. Feed one existing individual item and assert it remains a separate row with quantity one.

- [ ] **Step 2: Den Bestandslisten-Test ausführen.**

  Run: `npx vitest run src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts`

  Expected: FAIL because the component and its inputs do not exist.

- [ ] **Step 3: Artikelstamm-Seite und Bestandslisten-Komponente implementieren.**

  Add `/catalog` as a lazy standalone route and a sidebar item `Artikelstamm` beneath Inventar. The catalog page lists title, EAN, tracking mode, available stock and public-store status; it supports searching and creating a new product.

  `StockPositionListComponent` receives `positions = input.required<readonly StockPosition[]>()` and emits `sell = output<StockPosition>()`. It renders title, available quantity, oldest available unit cost and a `Verkaufen` button. Use a disclosure row to show lots with received date, remaining quantity and unit cost. Do not render or synthesize individual unit IDs for quantity positions.

- [ ] **Step 4: Inventar als zwei fachliche Ansichten integrieren.**

  In `inventory.component`, present `Bestand` and `Einzelstücke` as explicit tabs. `Bestand` uses `StockPositionListComponent`; `Einzelstücke` keeps the current filters and grouped display for legacy and mystery records. Remove the existing `sold` option from every direct status selector. Selecting `Verkaufen` opens the shared sale modal with a prefilled catalog product or individual item.

- [ ] **Step 5: Bestandslisten-Test ausführen und committen.**

  Run: `npx vitest run src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts`

  Expected: PASS; five or eight same lamps never produce duplicated ordinary inventory rows.

  ```powershell
  git add src/app/features/catalog src/app/features/inventory src/app/app.routes.ts src/app/layout/sidebar/sidebar.component.ts
  git commit -m "feat: add catalog and quantity stock views"
  ```

### Task 6: Verkaufsdialog, Retouren, Rechnungen und Steuerberechnung auf Verkaufspositionen umstellen

**Files:**

- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.html`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts`
- Modify: `src/app/features/sales/sales.component.ts`
- Modify: `src/app/features/sales/sales.component.html`
- Modify: `src/app/core/services/sales.service.ts`
- Modify: `src/app/core/services/return.service.ts`
- Modify: `src/app/core/services/invoice.service.ts`
- Modify: `src/app/core/services/tax-engine.service.ts`
- Test: `src/app/core/services/sales.service.spec.ts`
- Test: `src/app/core/services/tax-engine.service.spec.ts`

**Interfaces:**

- Consumes: `SalesService.recordSale`, `Sale.lines`, `StockPosition`, `InventoryItem`.
- Produces: Mehrpositionsverkäufe, Mengenverkäufe und dokumentierte Retouren ohne Löschung historischer Daten.

- [ ] **Step 1: Verkauf und Retoure als Fachtests schreiben.**

  Add test cases with these exact assertions:

  ```ts
  expect(payload.lines).toEqual([
    { catalogProductId: ledLampId, quantity: 2, unitSalePrice: 9.99 },
  ]);
  expect(payload.platform).toBe('ebay');
  expect(payload.saleDate).toBe('2026-08-26');

  expect(returnResult.restockedQuantity).toBe(2);
  expect(returnResult.saleReturnedAt).toBeTruthy();
  ```

  Add an invoice test for a sale with two lines and assert two invoice positions. Add a tax-engine test that sums `cost_of_goods_sold` from persisted sale lines instead of the legacy `inventory_item.allocated_purchase_cost`.

- [ ] **Step 2: Die gezielten Verkauf-, Steuer- und Modal-Tests ausführen.**

  Run: `npx vitest run src/app/core/services/sales.service.spec.ts src/app/core/services/tax-engine.service.spec.ts src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts`

  Expected: FAIL because a sale line and quantity are not part of the current payload.

- [ ] **Step 3: Mehrpositionsdialog und atomare Verkaufserfassung implementieren.**

  Replace the single `inventory_item_id` form with a typed `FormArray` of lines. Every line has exactly one of `catalogProductId` or `inventoryItemId`, `quantity`, and `unitSalePrice`. Keep platform, date and a positive line price required; default date to the local current day. The UI must show available stock beside quantity positions and disallow a client-side value above it, while still relying on the RPC as final authority.

  `SalesService.recordSale` maps the form to `record_sale`. It replaces the old direct insert plus `updateItemStatus` follow-up queue. A failure returns one red error and does not close the dialog. A confirmed response updates the sales signal, stock positions and individual-item signal before emitting one success toast.

- [ ] **Step 4: Folgeprozesse auf Verkaufspositionen umstellen.**

  `ReturnService.processReturn` calls `record_sale_return` and refreshes the affected stock or individual item. The first release restocks a complete sale only; a partial monetary refund without restocking keeps stock unchanged and is documented on the sale. `InvoiceService` creates `invoice_items` from `sale.lines`; preserve the legacy one-line mapping only for old sales. `TaxEngineService` receives line-level COGS and reports each sales line with its persisted tax mode; it must not infer a cost from an unrelated current inventory value. The Sales page table receives a `Menge` column and prints all line titles in a compact stacked cell.

- [ ] **Step 5: Die gezielten Tests ausführen und committen.**

  Run: `npx vitest run src/app/core/services/sales.service.spec.ts src/app/core/services/tax-engine.service.spec.ts src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts`

  Expected: PASS; a two-lamp sale reduces stock once, persists one sale line with quantity two and supports an explicit restocking return.

  ```powershell
  git add src/app/features/sales src/app/core/services/sales.service.ts src/app/core/services/return.service.ts src/app/core/services/invoice.service.ts src/app/core/services/tax-engine.service.ts
  git commit -m "feat: support quantity sales and returns"
  ```

### Task 7: Shop-Checkout auf dieselbe Verkaufsbuchung führen

**Files:**

- Modify: `src/app/core/models/store.models.ts`
- Modify: `src/app/core/services/store.service.ts`
- Modify: `src/app/core/services/store-order-persistence-actions.spec.ts`
- Modify: `src/app/features/store/pages/store-catalog/store-catalog.component.ts`
- Modify: `src/app/features/store/pages/store-catalog/store-catalog.component.html`
- Modify: `src/app/features/store/components/store-cart-drawer/store-cart-drawer.component.ts`
- Modify: `src/app/features/store/components/store-cart-drawer/store-cart-drawer.component.html`
- Modify: `supabase/schemas/database.sql`
- Test: `src/app/core/services/store-order-persistence-actions.spec.ts`

**Interfaces:**

- Consumes: `StockPosition`, `SaleLine`, `record_sale` transaction semantics.
- Produces: Einheitliche `SellableItemRef`-Warenkorbpositionen und Shop-Bestellungen, deren erfolgreiche Artikel als `custom_store`-Verkauf gebucht sind.

- [ ] **Step 1: Checkout-Kontrakt testen.**

  Replace the current cart fixture with a quantity product:

  ```ts
  const cartLine: CartItem = {
    item: { kind: 'catalog_product', id: ledLampId, title: 'LED-Lampe', availableQuantity: 5 },
    quantity: 2,
    unitPrice: 9.99,
  };
  ```

  Assert that a confirmed checkout calls the atomic checkout RPC with `quantity: 2`, creates a `custom_store` sale line and clears the cart only after the response. Assert that an insufficient-stock error preserves the cart.

- [ ] **Step 2: Den Checkout-Kontrakttest ausführen.**

  Run: `npx vitest run src/app/core/services/store-order-persistence-actions.spec.ts`

  Expected: FAIL because cart items currently only reference `inventory_item_id`.

- [ ] **Step 3: Verkaufbare Referenz und verfügbarkeitsbewussten Warenkorb implementieren.**

  Add `SellableItemRef` with `kind: 'catalog_product' | 'inventory_item'`, ID, title, available quantity and unit price. Update public catalog queries to return quantity products with available stock and existing individual public items. `addToCart` and `updateQuantity` clamp client-side quantities to the available value and show a warning when the requested amount is unavailable.

- [ ] **Step 4: Atomaren Shop-Checkout auf Verkaufspositionen umstellen.**

  Adapt `place_store_order` in `database.sql` so that every order item has a catalog-product or individual-item reference. Inside its existing transaction, validate all availability, create `store_orders`, `store_order_items`, one `sales` record with platform `custom_store`, its `sale_lines`, lot allocations and stock movements. Reuse the same SQL validation and FIFO ordering as `record_sale`; do not update status in a later frontend step. Preserve existing orders and their item rows by making new reference columns additive and nullable for legacy rows.

- [ ] **Step 5: Checkout-Test ausführen und committen.**

  Run: `npx vitest run src/app/core/services/store-order-persistence-actions.spec.ts`

  Expected: PASS; a two-unit shop order is visible as exactly one central sale and cannot oversell the remaining stock.

  ```powershell
  git add src/app/core/models/store.models.ts src/app/core/services/store.service.ts src/app/features/store supabase/schemas/database.sql supabase/migrations
  git commit -m "feat: unify store checkout with inventory sales"
  ```

### Task 8: Zeitraum-Dashboard, Diagramm, Verkaufstabelle und Navigation

**Files:**

- Create: `src/app/core/services/dashboard-report.service.ts`
- Create: `src/app/core/services/dashboard-report.service.spec.ts`
- Create: `src/app/shared/components/revenue-chart/revenue-chart.component.ts`
- Create: `src/app/shared/components/revenue-chart/revenue-chart.component.html`
- Create: `src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts`
- Modify: `src/app/core/models/flipbase.models.ts`
- Modify: `src/app/features/dashboard/dashboard.component.ts`
- Modify: `src/app/features/dashboard/dashboard.component.html`
- Modify: `src/app/layout/sidebar/sidebar.component.ts`
- Modify: `src/app/layout/bottom-nav/bottom-nav.component.html`

**Interfaces:**

- Consumes: persisted sales, sale lines, movement records and purchase costs.
- Produces: `DashboardRange`, `DashboardReport`, `DashboardTimePoint`, `DashboardSaleRow` and an accessible SVG chart.

- [ ] **Step 1: Dashboard-Berechnung als reinen Service-Test schreiben.**

  Use a fixture with a five-unit receipt costing 4.99 each, one two-unit sale for 19.98 total and 1.00 platform fee. Assert:

  ```ts
  expect(report.expenses).toBe(24.95);
  expect(report.revenue).toBe(19.98);
  expect(report.realizedProfit).toBe(8.99);
  expect(report.rows[0]).toMatchObject({ quantity: 2, costOfGoodsSold: 9.98, profit: 8.99 });
  ```

  Add range tests for `today`, `last_7_days`, `month` and `year`; a returned sale must not contribute revenue or realised profit after its return date.

- [ ] **Step 2: Den Dashboard-Service-Test ausführen.**

  Run: `npx vitest run src/app/core/services/dashboard-report.service.spec.ts`

  Expected: FAIL because the report service and range model do not exist.

- [ ] **Step 3: Zeitraumbericht und native Diagrammkomponente implementieren.**

  Implement `DashboardReportService.createReport(range, platform)` as a pure calculation over loaded, persisted records. Its report separates cash-flow expenses from sale-matched COGS:

  ```ts
  export type DashboardRange = 'today' | 'last_7_days' | 'month' | 'year';

  export interface DashboardReport {
    expenses: number;
    revenue: number;
    realizedProfit: number;
    inventoryCostValue: number;
    points: readonly DashboardTimePoint[];
    rows: readonly DashboardSaleRow[];
  }
  ```

  `RevenueChartComponent` receives the points and renders three labelled SVG paths or bars for Umsatz, Ausgaben and realisierter Gewinn. Include a visually hidden table summary and use a `title` plus `aria-describedby` so the chart passes keyboard and screen-reader checks without a third-party chart library.

- [ ] **Step 4: Dashboard, Verkaufstabelle und Navigation integrieren.**

  Replace the dashboard KPI cards `Gebundenes Kapital` and `Durchschnittlicher ROI` with `Ausgaben` and `Realisierter Gewinn`; show `Bestandswert` separately if space permits. Add the four range buttons plus platform filter. Render the SVG chart and a responsive table with date, articles, quantity, platform, revenue, COGS and profit.

  Group `Dashboard` and `Verkäufe` under an `Übersicht` label in the desktop sidebar. Add a sales shortcut to the mobile navigation or its existing overflow mechanism. Keep `/sales` as the canonical route and ensure Dashboard links to it.

- [ ] **Step 5: Dashboard- und Chart-Tests ausführen und committen.**

  Run: `npx vitest run src/app/core/services/dashboard-report.service.spec.ts src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts`

  Expected: PASS; changing the range changes chart points, KPI values and table rows together.

  ```powershell
  git add src/app/core/services/dashboard-report.service.ts src/app/shared/components/revenue-chart src/app/features/dashboard src/app/layout src/app/core/models/flipbase.models.ts
  git commit -m "feat: add sales-driven dashboard reporting"
  ```

### Task 9: Datenübernahme, Endabnahme und Dokumentation

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `src/app/core/models/supabase.types.ts`
- Create: `docs/superpowers/reports/2026-08-26-warenwirtschaft-abnahme.md`
- Test: vorhandene Tests aus Tasks 1–8

**Interfaces:**

- Consumes: alle zuvor implementierten Tabellen, RPCs, Services und UI-Komponenten.
- Produces: prüfbare Migrationsnotiz, finale Tests und eine Abnahmedokumentation.

- [ ] **Step 1: Rückwärtskompatible Migration explizit prüfen.**

  Add SQL checks that an existing `inventory_items` row, an existing `sales` row and zugehörige `item_media` before the new model remain readable afterwards. For each legacy sale insert one `sale_lines` row with `quantity = 1`, `inventory_item_id` equal to the legacy ID, `line_total = sales.sale_price`, and a COGS value only when the legacy item cost is available. Do not generate stock lots or fictional movement history for legacy data.

- [ ] **Step 2: Einmalige fachliche Endabnahme auf dem lokalen Schema durchführen.**

  Run the SQL transaction fixture from Task 2 and verify in the app manually:

  ```text
  1. LED-Lampe als Artikelstamm anlegen.
  2. Einkauf: 5 Stück × 4,99 € erfassen und vollständig einbuchen.
  3. Bestand zeigt eine Zeile mit 5 Stück.
  4. Verkauf: 2 Stück mit Preis, Plattform und heutigem Datum abschließen.
  5. Verkauf, Bestand, Dashboard und Shop-Bestand zeigen konsistente Werte.
  6. Eine Rückgabe erfassen und die wiederhergestellte Menge kontrollieren.
  7. Ein Mystery-Einzelstück erfassen und separat verkaufen.
  ```

- [ ] **Step 3: Die gesamte automatisierte Prüfung genau einmal ausführen.**

  Run:

  ```powershell
  npm run typecheck
  npm test
  npm run format:check
  npm run build
  ```

  Expected: all commands pass. If one command reports a regression from this work, fix that concrete defect and rerun only the affected command plus the final command that failed; do not start a broad repeated test cycle.

- [ ] **Step 4: Die Abnahme nachvollziehbar dokumentieren.**

  Create `docs/superpowers/reports/2026-08-26-warenwirtschaft-abnahme.md` with the exact migration name, test-command outcomes, manual scenario outcome, known pre-existing warnings and confirmation that no production migration was applied during local verification.

- [ ] **Step 5: Finalen Commit erstellen.**

  ```powershell
  git add supabase/schemas/database.sql supabase/migrations src/app/core/models/supabase.types.ts docs/superpowers/reports/2026-08-26-warenwirtschaft-abnahme.md
  git commit -m "docs: record inventory sales acceptance"
  ```

## Requirement Coverage Review

| Spezifikationsanforderung                                | Plan-Task                  |
| -------------------------------------------------------- | -------------------------- |
| Artikelstamm, Einkauf, Positionen und Bestandlose        | 1, 3, 4, 5                 |
| FIFO, atomarer Verkauf und Überverkaufschutz             | 2, 3, 6                    |
| Einzelstücke und Mystery-Boxen                           | 1, 4, 5, 6                 |
| Bestandsbewegungen und Retouren                          | 1, 2, 6                    |
| Shop als echter Verkauf                                  | 7                          |
| Zeitraumfilter, Kennzahlen, Diagramm und Verkaufstabelle | 8                          |
| vorhandene Daten erhalten                                | 1, 9                       |
| zielgerichtete statt endlose Testläufe                   | alle Tasks, insbesondere 9 |

## Plan Self-Review

- **Spec coverage:** Jede funktionale Anforderung der Spezifikation ist mindestens einem Task zugeordnet; Datenmigration und Shop-Checkout sind ausdrücklich enthalten.
- **Vollständigkeit:** Keine offenen Markierungen, keine verschobenen Implementierungsschritte und kein unbestimmter Testschritt enthalten.
- **Type consistency:** Mengenartikel verwenden durchgehend `catalogProductId`; Einzelstücke verwenden durchgehend `inventoryItemId`; ein Verkaufsdialog übergibt `lines` an `SalesService.recordSale` und die Datenbankfunktion `record_sale`.
- **Scope:** Mehrlagerorte, automatische Nachbestellung und rückwirkende Zusammenführung alter Einzelartikel bleiben bewusst außerhalb des Plans.

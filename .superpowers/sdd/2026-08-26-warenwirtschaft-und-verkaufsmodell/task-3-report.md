# Task 3: Core services and confirmed local state

## Status

DONE

## Commit

`feat: add catalog and stock services`

## Implemented

- Added `CatalogService` as the typed catalog boundary with a confirmed `products` signal.
- Added `StockService` with quantity-lot aggregation, `receivePurchaseLines`, and confirmed `positions` updates only after the receipt RPC succeeds.
- Added typed `recordSale` and `recordReturn` RPC boundaries to `SalesService`. Persisted sales now load their lines, FIFO allocations, and stock movements; legacy sales expose one compatible single-item line.
- Kept `createSale` as a compatibility adapter for the existing single-item UI. It now delegates to the atomic `record_sale` RPC and no longer writes an inventory status in a deferred follow-up step.
- Added the purchase receipt delegation and an explicit demo-mode representation for catalog products, purchase lines, stock lots, and receipt movements. Quantity stock is no longer represented as duplicated inventory items.

## Verification

The requested RED run failed first because `CatalogService`, `StockService`, and `SalesService.recordSale` did not exist.

Focused service verification passed:

```text
Test Files  3 passed (3)
Tests       4 passed (4)
```

Command:

```powershell
npx vitest run src/app/core/services/catalog.service.spec.ts src/app/core/services/stock.service.spec.ts src/app/core/services/sales.service.spec.ts
```

`git diff --check` passed.

The optional legacy `Sale.inventory_item_id` consumers were made null-safe as part of the build verification. Both checks now pass:

```powershell
npm run typecheck
npm run build
```

The build completes successfully. It retains the existing Angular CommonJS optimization warnings for `jszip` and `jsbarcode`.

## Fix round 1

- The visible sales return flow now calls `SalesService.recordReturn`. It no longer invokes the legacy `ReturnService.processReturn` follow-up chain, so quantity sales and individual sales use the same atomic RPC return path.
- Confirmed sales and returns refresh `StockService.positions`. The demo store now consumes quantity lots in FIFO order, rejects overselling without writing partial state, and restores lots for restocked returns.
- Purchase receipts refresh joined lot/product positions after the successful RPC. The first receipt of an existing catalog product therefore uses its persisted product title and store flag instead of the fallback label.
- The focused service tests pass (3 files, 4 tests), as do `npm run typecheck`, `npm run build`, and `git diff --check`.

## Fix round 2

- `ReturnService.materializeConfirmedReturn` now provides exactly one local `ReturnRecord` with a generated credit-note invoice after the atomic return RPC has succeeded. It does not issue a second database request.
- The visible return flow materializes this UI record only after `SalesService.recordReturn` reports success and opens the generated credit note as before.
- Quantity sales are represented with a nullable legacy `inventory_item_id` in the local return record, while the credit note continues to use the sale information itself.
- Verification: 5 focused test files / 16 tests passed, plus `npm run typecheck`, `npm run build`, and `git diff --check`.

## Fix round 3

- `SalesComponent.onSubmitReturn` now exits immediately while a return submission is already in progress, before validation or an RPC can begin.
- The action test invokes two submissions concurrently against a pending return promise and verifies that exactly one atomic `recordReturn` call and one credit-note materialization occur.
- Verification: 5 focused test files / 16 tests passed, plus `npm run typecheck`, `npm run build`, and `git diff --check`.

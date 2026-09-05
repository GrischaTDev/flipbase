# EAN, Kamera und CSV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Artikel optional per EAN/GTIN erfassen und vorhandene Artikel finden; CSV-Dateien vor einer bewussten Übernahme prüfen.
**Architecture:** Gemeinsame reine GTIN-/CSV-Prüfung, vorhandener Shared-Scanner mit Decoder-Fallback; Datenzugriffe in Services. Einkaufsimport fügt Entwurfspositionen hinzu, Katalogimport nur Artikelstammdaten, niemals ungeprüften Bestand.
**Tech Stack:** Angular 22, Tailwind, Supabase; kompatible stabile ZXing-Versionen.
**Spec:** docs/superpowers/specs/2026-09-05-admin-workflow-refresh.md Paket 5, freigegeben.

## Global Constraints

- Eigener Worktree, englischer Code/Commits, deutsche Oberfläche, keine Veröffentlichung/Produktionsdatenänderung.
- EAN optional; keine automatische Preisübernahme, keine bezahlte externe Datenbank oder neue Konten. Beispielprodukte dürfen niemals wie echte Rechercheergebnisse erscheinen.
- Bestehende Buchungs-/Kostenprüfungen und Schutz ungespeicherter Eingaben erhalten. Kein CSV-Import direkt in Verkäufe oder Bewegungen.
- Shared-Komponenten ohne Serverzugriffe; separate HTML, OnPush, Signals, bestehende Designbausteine.
- Schema deklarativ, Migration generiert und geprüft, Typen erzeugt, lokale Rechte-/Persistenztests ohne Reset fremder Datenbanken.

## Task 1: Optionale GTIN und zuverlässiger Scanner

**Files:** Create `shared/utils/gtin.ts` and tests; modify `shared/components/barcode-scanner/*`, `core/services/barcode-lookup.service.ts` and tests, existing scanner consumers in inventory item-create, catalog, research/deal-calculator; purchase-line-editor and purchase entry serialization/models/tests. Append `ean_snapshot` to purchase_lines declaration in `supabase/schemas/database.sql`, update existing purchase JSON/RPC paths that create/update/receive/finalize/correct individual lines to preserve it; generated migration/types and `supabase/tests/purchase_line_ean.test.sql`. Package files for decoder dependency. Add focused e2e.

- [ ] RED tests optional blank valid, GTIN-8/12/13/14 check digit, leading zero preserved, letters/wrong checksum rejected. `validateGtin(value)` reports invalid rather than silently deleting characters; canonical lookup compares valid values padded to 14 digits without rewriting existing records.
- [ ] Optional visibly labelled `EAN / GTIN` on new individual inventory items, catalog form/quick-create and individual purchase lines. Keep strings throughout. New entered codes validated; pre-existing legacy values not mass-rewritten or silently lost. Field errors accessible.
- [ ] Persist purchase `eanSnapshot` through draft models, service JSON, demo, create/update/add line RPCs and finalization/receiving into inventory_items.ean. Correcting a purchase must preserve existing EAN when omitted, never replace old codes with null incidentally. Add nullable column at end and server validation for newly supplied codes. No changes to cost arithmetic/locking/financial guards. Test blank compatibility, valid leading-zero roundtrip, invalid rejection and resulting item's EAN after actual finalization.
- [ ] Scanner keeps manual input and internal code/QR consumers. Native BarcodeDetector first when desired formats supported; lazy-loaded ZXing fallback otherwise. Registry checked 2026-09-05: latest browser0.2.1/library0.23.0 require Node24 via library; project's CI/Docker use Node22. Latest mutually compatible Node22 releases are browser0.1.5/library0.21.3 (browser peer ^0.21.0, library node>=10.4). Reconfirm before install; pin compatible versions, do not upgrade CI/Angular/Node for this feature. Official API: https://github.com/zxing-js/browser . No CDN assets.
- [ ] Scanner session generation prevents late getUserMedia/decoder results after close/switch/destroy; stop all own streams/tracks, frames/decoder and timers. Emit one successful result only. Camera permission denial/unsupported/decoder failure gives clear message and manual fallback. Preserve focus/dialog behavior. Tests fake native/fallback results and lifecycle races; no claim of real physical camera verification without device.
- [ ] Verify the installed fallback decoder against one deterministic valid barcode image (existing JsBarcode can create a test SVG/canvas), in addition to lifecycle mocks. This proves actual decoding, not physical camera/device support. Keep generated test artifacts outside committed app assets.
- [ ] Replace hardcoded production sampleDatabase with current-workspace own-catalog lookup. No global/private cross-workspace search. One exact match offers use; multiple matches require explicit selection; no match keeps scanned EAN and lets user enter title. Do not overwrite edited title/brand/price with delayed lookup. Inventory and purchase forms offer scanning; purchase known repeatable product selects reference, unknown code fills new individual draft, never creates a product/stock automatically. Existing research/deal-calculator consumers show honest no-result rather than fabricated price. External enrichment is not enabled automatically.
- [ ] Focused unit/Angular/pgTAP tests, changed-file format/lint and build. Commit `feat(inventory): add validated barcode capture`; detailed report and controller review before Task2.

## Task 2: CSV mit Vorschau in Katalog und Einkauf

**Files:** Create `shared/utils/csv.ts` and tests, `shared/components/csv-import-preview/*` data-only, feature-specific import models/services under catalog/purchases, integrate catalog page and purchase-line-editor, focused e2e. Reuse Task1 GTIN and existing CatalogService/PurchaseLineDraft; no new financial RPC.

- [ ] RED pure tests UTF-8 BOM, CRLF/LF, comma/semicolon, quoted separators/newlines/escaped quotes, malformed quotes, duplicate headers, empty cells, size/row limits. Use bounded parser (max2MiB/1000 data rows), reject ambiguous malformed input with row numbers rather than silently shift columns. No HTML rendering of imported text.
- [ ] `CSV importieren` near article search in purchase editor and catalog toolbar, with downloadable small UTF-8 example/template. Visible expected columns: `title,ean,quantity,unit_purchase_price,condition` for purchases; `title,ean,tracking_mode,brand` for catalog. Accept clearly documented German aliases, decimal comma for semicolon files, preserve EAN strings. User chooses/validates mapping when headers unknown; simpler strict template with precise unknown-column feedback acceptable instead of generic mapping builder.
- [ ] Preview BEFORE any writes: row/title/EAN/quantity/cost/match/action and errors. Confirmation disabled while errors remain; cancel writes nothing. Counts and purpose clear. Purchase quantity defaults1, required normal-purchase unit price must be supplied (explicit0 permitted), Mystery has no invented per-piece price and uses existing equal allocation. Existing catalog match only current workspace, ambiguity reported, no automatic overwrite. Unknown individual entries allowed. Do not silently discard an EAN.
- [ ] On purchase confirmation add draft rows only, mark dirty via existing output path; saving purchase still uses existing validation/finalization. No inventory/stock before normal save. Confirmation must not append twice; async parsing/workspace changes stale-safe. Preserve pending catalog save/navigation protections from purchase page.
- [ ] Catalog confirmation creates only catalog records through service, no quantities/stock/sales. Explain this before import. Stable IDs per preview row, reuse on retry where API supports, successful rows marked and excluded from retry, partial failure explicit. Match existing EAN rows skipped/offered selection rather than duplicated invisibly. No cross-workspace request leakage. Demo isolated.
- [ ] Tests real preview/cancel/confirm, malformed data, normal versus Mystery costs, EAN preservation, duplicate click/retry and partial errors/workspace switch. Focused lint/build/tests; commit `feat(purchases): add previewed CSV article import`; controller owns AI-CHANGELOG.

## Task 3: Abnahme

- [ ] Task-scoped review for each task, fixes by original implementer and scoped rereview.
- [ ] Main local account/browser: manual EAN, unknown/known lookup, leading-zero persistence, CSV preview/cancel/import and saved purchase totals. Mobile dialog/focus/axe; camera mock and explicit physical-device limitation.
- [ ] Final whole remaining-workflow review and one full verification run across packages3–5. Document results, no publication.

## Self-review

EAN identity, barcode decoding and product enrichment are separate. Catalog import is not a stock receipt. Purchase CSV keeps the already approved normal/Mystery costing contract. Existing Node22 production compatibility is retained instead of bundling a Node24-only dependency or silently upgrading infrastructure.

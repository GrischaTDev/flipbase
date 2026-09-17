# Einkauf: Quelle, Verkäufer-Snapshot, Nachtrag – Umsetzungsplan

> Ausführung inline in dieser Sitzung (superpowers:executing-plans), Schritte als Checkboxen.

**Goal:** Einkäufe speichern Quelle und Verkäuferangaben als eigenen Snapshot und lassen
diese Angaben auch nach dem Abschluss versionsgesichert nachtragen, ohne Kosten oder
Bestand zu berühren.

**Architecture:** Neue Spalten und ein schmaler `security definer`-Nachtrag in
`supabase/schemas/160_purchase_seller_details.sql`; bestehende RPCs in `database.sql`
übernehmen die Felder. Migration und Typen erzeugt ein vorläufiger GitHub-Workflow.
Frontend erweitert `PurchaseService`, Erfassungsformular, Detailseite, Liste und
Historientexte mit vorhandenen Shared-Komponenten.

**Tech Stack:** Supabase (PostgreSQL, pgTAP), Angular 22 Signals/Reactive Forms, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-purchase-seller-details-design.md`

## Global Constraints

- Kein Docker lokal; `supabase db diff`, `supabase gen types` und `npm run test:db` nur im Runner.
- Node lokal 22.16.0: kein `ng build`; Angular-Bau im PR.
- Keine generierten Dateien von Hand ändern (`supabase/migrations/*`, `supabase.types.ts`).
- Funktionen: `set search_path = ''`, vollqualifizierte Namen, Grants nur für `authenticated`.
- Commits ohne KI-Signatur; Conventional Commits, Scope `purchases`/`ci`.
- Keine neuen Playwright-Tests; keine neue UI-Bibliothek.

---

### Task 1: Datenbank – Schema, Funktionen, DB-Tests

**Files:**

- Create: `supabase/schemas/160_purchase_seller_details.sql`
- Modify: `supabase/config.toml` (`schema_paths` um die neue Datei ergänzen)
- Modify: `supabase/schemas/database.sql` (`purchase_draft_audit_snapshot`, `create_purchase`, `update_purchase_draft`)
- Create: `supabase/tests/purchase_seller_details.test.sql`

**Interfaces (Produces):**

- Spalten laut Spec.
- `public.normalize_purchase_seller_details(p_details jsonb) returns jsonb` (immutable, intern)
- `public.purchase_seller_details_snapshot(p_purchase public.purchases) returns jsonb` (immutable, intern)
- `public.update_purchase_seller_details(p_workspace_id uuid, p_purchase_id uuid, p_expected_version integer, p_details jsonb, p_reason text default null) returns jsonb` → `{ purchase, eventId }`
- JSON-Schlüssel beider Hilfsfunktionen: `source_id, supplier_id, seller_type, seller_name, seller_marketplace_username, seller_street, seller_address_extra, seller_postal_code, seller_city, seller_country_code, external_order_id, supplier_reference, original_url`

- [ ] Schemadatei mit Spalten, Kommentaren, Hilfsfunktionen und Nachtrag schreiben; Grants: Hilfsfunktionen niemandem, Nachtrag nur `authenticated`.
- [ ] `create_purchase`: Spalten und Werte über `normalize_purchase_seller_details(p_purchase)` einfügen.
- [ ] `update_purchase_draft`: Felder setzen; vorher/nachher Snapshot vergleichen und bei Änderung `seller_details_version + 1`.
- [ ] `purchase_draft_audit_snapshot`: neue Schlüssel in die Feldliste.
- [ ] DB-Test mit den 12 Fällen der Spec schreiben.
- [ ] Commit `feat(purchases): store seller snapshot and allow seller detail amendments`.

### Task 2: Vorläufiger Schema-Workflow, Entwurfs-PR, generierte Dateien

**Files:**

- Create: `.github/workflows/purchase-seller-schema-preview.yml` (wird in Task 8 gelöscht)
- Create (aus Artefakt): `supabase/migrations/<timestamp>_purchase_seller_details.sql`
- Modify (aus Artefakt): `src/app/core/models/supabase.types.ts`

- [ ] Workflow: nur `pull_request` für diesen Head-Branch; `npm ci`, `supabase db diff -f purchase_seller_details`, `supabase start`, `supabase gen types typescript --local`, `npm run test:db`, Artefakt mit Migration, Typen und Testausgabe; `permissions: contents: read`, keine Secrets.
- [ ] Zweig pushen, Entwurfs-PR öffnen, Lauf abwarten.
- [ ] Artefakt herunterladen, Migration lesen (nur erwartete Änderungen, transaktional), Typen übernehmen; bei Testfehlern Task 1 korrigieren und wiederholen.
- [ ] Commit `feat(purchases): add generated seller snapshot migration and types`.

### Task 3: Modell und Anzeige-Hilfen

**Files:**

- Modify: `src/app/core/models/flipbase.models.ts` (`Purchase`: neue Felder)
- Create: `src/app/features/purchases/utils/purchase-seller.ts`
- Test: `src/app/features/purchases/utils/purchase-seller.spec.ts`

**Interfaces (Produces):**

- `type PurchaseSellerType = 'private' | 'business'`
- `interface PurchaseSellerDetails { source_id; supplier_id; seller_type; seller_name; seller_marketplace_username; seller_street; seller_address_extra; seller_postal_code; seller_city; seller_country_code; external_order_id; supplier_reference; original_url }` (alle `string | null`, `seller_type: PurchaseSellerType | null`)
- `purchaseSellerLabel(purchase: Pick<Purchase, 'seller_name' | 'seller_marketplace_username' | 'supplier'>): string`
- `sellerDetailsFromPurchase(purchase: Purchase): PurchaseSellerDetails`
- `sellerSnapshotFromSupplier(supplier: Supplier): Pick<PurchaseSellerDetails, 'seller_type' | 'seller_name' | 'seller_street' | 'seller_address_extra' | 'seller_postal_code' | 'seller_city' | 'seller_country_code'>`
- `normalizePurchaseSellerDetails(details: PurchaseSellerDetails): PurchaseSellerDetails` (trim, leer → null, Land groß)
- `hasPurchaseSellerSnapshot(purchase): boolean`

- [ ] Tests zuerst (Label-Reihenfolge, Kopie ohne Kontaktfelder, Normalisierung, leere Werte bleiben leer), dann Implementierung, Commit.

### Task 4: Service – Speichern und Nachtrag

**Files:**

- Modify: `src/app/core/services/purchase.service.ts`
- Test: `src/app/core/services/purchase-seller-details.service.spec.ts`

**Interfaces (Produces):**

- `CreatePurchasePayload` erhält die Snapshot-Felder und `external_order_id`.
- `updatePurchaseSellerDetails(purchaseId: string, expectedVersion: number, details: PurchaseSellerDetails, reason: string | null): Promise<{ error: Error | null; conflict: boolean }>`

- [ ] Tests zuerst: RPC-Argumente, Übernahme des Ergebnisses, Konflikt bei `40001`, Demo: Speichern, Versionsanstieg, Konflikt, keine Änderung von Kosten/Positionen.
- [ ] `createPurchase`/`updatePurchaseDraft` (RPC und Demo) um Felder ergänzen; Demo-Version bei geänderten Herkunftsangaben erhöhen.
- [ ] Nachtrag implementieren, Commit.

### Task 5: Erfassungsformular

**Files:**

- Modify: `purchase-entry-form.component.{ts,html}`, `purchase-entry-form.component.angular.spec.ts`

- [ ] Tests: Bezeichnung, Quelle, Benutzername und Anschrift landen im Payload; Auswahl eines gespeicherten Verkäufers kopiert Snapshot; Bearbeiten befüllt Felder.
- [ ] Formularcontrols, Template (vorhandene `app-text-field`, `app-custom-select`), Kopierlogik, Commit.

### Task 6: Detailseite und Nachtragsdialog

**Files:**

- Create: `src/app/features/purchases/components/purchase-seller-details-dialog/*`
- Modify: `purchase-detail.component.{ts,html}` und Spec

- [ ] Tests: Anzeige Snapshot/Fallback; Dialog speichert mit Version und Grund; Konfliktmeldung; nur Herkunftsfelder.
- [ ] Dialog mit `app-modal-shell`, Einbindung, Commit.

### Task 7: Liste und Historie

**Files:**

- Modify: `purchase-presentation.ts`, `purchases.component.ts`, `business-event.service.ts`, `timeline-sentence.ts`, `record-changes.ts` und zugehörige Specs

- [ ] Tests zuerst, Umsetzung, Commit.

### Task 8: Abschluss

- [ ] Hilfsworkflow löschen; Prettier, ESLint, Typprüfung, Test-Audit, Shared-UI-Prüfung, betroffene Vitest-Projekte.
- [ ] `docs/AI-CHANGELOG.md` eintragen; PR #59 im PR-Text als erledigt verlinken.
- [ ] Im Chat fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“

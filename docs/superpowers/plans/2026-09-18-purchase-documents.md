# Einkaufsbelege – Umsetzungsplan

> Ausführung inline in dieser Sitzung (superpowers:executing-plans), Schritte als Checkboxen.

**Goal:** Zu einem Einkauf lassen sich Originalbelege privat speichern, ansehen und –
solange der Einkauf offen ist – wieder entfernen, ohne Kosten oder Bestand zu berühren.

**Architecture:** Privater Bucket plus Metadatentabelle nach dem Muster der
Produktmedien (`supabase/schemas/60_catalog_product_media.sql`), Ereignisse über
`security definer`-Trigger, ein Feature-Dienst im Core mit Upload-Rücknahme und eine
Belegkarte samt Vorschaudialog auf der Einkaufs-Detailseite.

**Tech Stack:** Supabase Storage und PostgreSQL (pgTAP), Angular 22 Signals, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-purchase-documents-design.md`

## Global Constraints

- Kein Docker lokal: Migration von Hand aus den Schemadateien, Prüfung über die PR-CI
  (`Database`-Job) und die dort erzeugten Typen.
- Node lokal 22.16.0: kein `ng build`, keine Sichtprüfung; der Bau läuft im PR.
- Generierte Dateien nicht von Hand ändern (`supabase.types.ts`).
- Funktionen mit `set search_path = ''`, Rechte nur für `authenticated`.
- Keine neuen Playwright-Tests, keine neue UI-Bibliothek, Commits ohne KI-Signatur.

---

### Task 1: Datenbank

**Files:**

- Create: `supabase/schemas/170_purchase_documents.sql`
- Modify: `supabase/config.toml`
- Create: `supabase/tests/purchase_documents.test.sql`
- Create: `supabase/migrations/<ts>_purchase_documents.sql`

**Interfaces (Produces):**

- Bucket `purchase-documents` (privat, 20 MiB, PDF/JPEG/PNG/XML)
- `public.is_purchase_document_path(p_path text, p_workspace_id uuid, p_purchase_id uuid) returns boolean`
- Tabelle `public.purchase_documents` laut Spec, RLS je Operation
- Ereignisse `purchase_document_added`, `purchase_document_removed`

- [ ] Schemadatei schreiben (Bucket, Pfadfunktion, Tabelle, RLS, Storage-Regeln, Trigger).
- [ ] `config.toml` um die Schemadatei ergänzen.
- [ ] DB-Test mit den Fällen der Spec schreiben.
- [ ] Migration aus der Schemadatei zusammenstellen und Kopfkommentar setzen.
- [ ] Commit `feat(purchases): store purchase documents in a private bucket`.

### Task 2: Dienst und Modell

**Files:**

- Create: `src/app/core/models/purchase-document.models.ts`
- Create: `src/app/core/services/purchase-document.service.ts`
- Test: `src/app/core/services/purchase-document.service.spec.ts`

**Interfaces (Produces):**

- `PurchaseDocumentType = 'invoice' | 'purchase_proof' | 'payment_proof' | 'other'`
- `interface PurchaseDocument { id; workspace_id; purchase_id; document_type; original_file_name; storage_path; mime_type; file_size; created_at; created_by }`
- `PURCHASE_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024`
- `validatePurchaseDocumentFile(file: { name: string; type: string; size: number }): Error | null`
- `PurchaseDocumentService.loadForPurchase(purchaseId): Promise<void>` mit Signal `documents`
- `upload(purchaseId, file, type): Promise<{ error: Error | null }>`
- `download(document): Promise<{ data: Blob | null; error: Error | null }>`
- `remove(document): Promise<{ error: Error | null }>`

- [ ] Tests zuerst: abgelehnter Typ und zu große Datei, Upload-Reihenfolge Datei → Metadaten,
      Rücknahme der Datei bei Metadatenfehler, Demo-Sperre, Download, Entfernen.
- [ ] Umsetzung, Commit.

### Task 3: Oberfläche

**Files:**

- Create: `src/app/features/purchases/components/purchase-documents-card/*`
- Create: `src/app/features/purchases/components/purchase-document-preview-dialog/*`
- Modify: `purchase-detail.component.{ts,html}` und Spec

- [ ] Tests zuerst: Liste mit Art, Name, Größe und Datum; Entfernen nur vor Abschluss;
      Hinweis nach Abschluss; Demo-Sperre; Vorschau öffnet Dialog; Leerzustand.
- [ ] Umsetzung mit vorhandenen Shared-Komponenten, Commit.

### Task 4: Historie und Abschluss

**Files:**

- Modify: `business-event.service.ts`, `timeline-sentence.ts`, `record-changes.ts`, `docs/AI-CHANGELOG.md`

- [ ] Ereignistexte und Feldbezeichnungen mit Tests ergänzen.
- [ ] Prettier, ESLint, Typprüfung, betroffene Vitest-Projekte, Test-Audit, Shared-UI-Prüfung.
- [ ] Protokolleintrag schreiben, im Chat den PR erfragen.

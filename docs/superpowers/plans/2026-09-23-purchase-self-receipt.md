# Eigenbeleg beim Einkauf – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einkäufe ohne gespeicherten Verkäufer erfassen und beim Abschluss einen unveränderlichen Eigenbeleg als PDF speichern.

**Architecture:** Der bestehende Einkauf erhält einen Belegmodus. Im Eigenbelegmodus wird der Verkäufer-Snapshot aus einem optionalen Freitext statt aus Stammdaten gefüllt. Abschluss und PDF-Upload bleiben getrennte Schritte mit sichtbarem Wiederholungsweg; eine Datenbankregel verhindert doppelte Eigenbelege für dieselbe Abschlussfassung.

**Tech Stack:** Angular 22, Signals, Reactive Forms, Supabase/PostgreSQL, privater Supabase Storage, pdf-lib 1.17.1, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-23-purchase-self-receipt-design.md`

## Global Constraints

- Bezeichner Englisch, Oberflächentexte Deutsch und persönliche Du-Ansprache.
- Standalone und OnPush, getrennte HTML-Vorlagen, Shared-Komponenten, Tailwind im Template.
- Neue Datenbankstruktur nur deklarativ unter `supabase/schemas/`; Migration mit `supabase db diff` erzeugen und prüfen.
- Neue Tabellen mit RLS; hier möglichst vorhandene Tabellen erweitern.
- Kein Branch-Push ohne die in `AGENTS.md` vorgesehene Frage.

## Review Focus

1. Eigenbelegmodus ohne Verkäuferangabe: Speichern und Abschluss funktionieren, PDF zeigt „Nicht bekannt“.
2. Wechsel zwischen Modi: Ein alter Verkäufer-Snapshot oder eine alte Kennung darf nicht verdeckt erhalten bleiben.
3. Abschluss erfolgreich, PDF-Upload fehlgeschlagen: Einkauf bleibt abgeschlossen, Wiederholung ist sichtbar und funktioniert.
4. Gleichzeitige Wiederholung: höchstens ein Eigenbeleg je Abschlussfassung; fehlgeschlagener zweiter Upload wird entfernt.
5. Wiederöffnung und neuer Abschluss: alter Beleg bleibt, neue Fassung wird eindeutig erkennbar.

---

### Task 1: Belegmodus atomar speichern

**Files:** `supabase/schemas/165_purchase_self_receipts.sql`, `supabase/schemas/220_purchase_open_prices.sql`, `supabase/config.toml`, generierte Migration und Typen, `src/app/core/models/flipbase.models.ts`, `src/app/core/services/purchase.service.ts`, `supabase/tests/purchase_self_receipts.test.sql`.

**Interfaces:** `Purchase.receipt_mode: 'external' | 'self'`; `CreatePurchasePayload.receipt_mode`; RPC-JSON-Schlüssel `receipt_mode`. Im Eigenbelegmodus ist `supplier_id = null`, `seller_name` darf leer sein.

- [x] Datenbanktest für `self` ohne Verkäuferstammsatz und Ablehnung der Kombination mit einem gespeicherten Verkäufer ergänzen.
- [x] Spalte, Check und Aufnahme in Anlege-/Entwurfs-RPC ergänzen.
- [x] Typen lokal neu erzeugen und die erzeugte Migration auf die beabsichtigten SQL-Schritte prüfen.

### Task 2: Schalter im Einkaufsformular und Anzeige

**Files:** `purchase-entry-form.component.ts/.html/.angular.spec.ts`, `purchase-seller.ts`, Einkaufslisten-/Detailanzeige und deren gezielte Tests.

**Interfaces:** Im Formular `receipt_mode` und optional `seller_name`; `supplier_id` nur im Modus `external` Pflicht. Der vorhandene Verkäufer-Snapshot wird beim Moduswechsel ausdrücklich geleert.

- [x] Tests für Umschaltung, optionale Verkäuferangabe, Rückwechsel und Payload ergänzen.
- [x] Gemeinsame Auswahl über Shared-Bedienelemente und bedingtes Feld implementieren.
- [x] Gemeinsame Verkäuferanzeige für Liste, Detail und Druck anpassen und testen.

### Task 3: PDF und unveränderlicher Beleg

**Files:** `src/app/features/purchases/services/purchase-self-receipt.service.ts`, zugehöriger Test, `purchase-document.models.ts`, `purchase-document.service.ts`, `supabase/schemas/170_purchase_documents.sql` sowie neue Schemaergänzung, Migration und Typen.

**Interfaces:** `ensureForFinalizedPurchase(purchaseId): Promise<{ error: Error | null }>` lädt den abgeschlossenen Einkauf, erzeugt ein PDF und speichert es als `self_receipt`. Der Beleg trägt die Abschlussfassung `finalized_at` als eindeutigen Schlüssel.

- [x] Tests für PDF-Inhalt, Sonderzeichen, mehrseitige Positionen, Speicherfehler und idempotente Wiederholung ergänzen.
- [x] `pdf-lib@1.17.1` installieren, PDF-Inhalt bauen und über den privaten Belegdienst speichern.
- [x] Datenbankregel für genau einen Beleg je Einkauf/Abschlussfassung sowie Sperre gegen Löschen erzeugter Eigenbelege ergänzen und prüfen.

### Task 4: Abschluss, Wiederholung und Belegkarte

**Files:** `purchase-detail.component.ts/.html/.angular.spec.ts`, `purchase-documents-card.component.ts/.html/.angular.spec.ts`, `docs/AI-CHANGELOG.md`.

**Interfaces:** Nach erfolgreichem Abschluss wird Task 3 aufgerufen. Bei Fehler erscheint ein Wiederholungsknopf für genau die fehlende Fassung. Die Belegkarte zeigt „Eigenbeleg“ und keinen Untertitel.

- [x] Tests für Abschluss, PDF-Speicherfehler und Wiederholung ergänzen.
- [x] Abschlussaktion und sichtbaren Wiederholungsweg anschließen; Untertitel entfernen.
- [x] Formatierung, Lint, Angular-Tests, Datenbanktests und Produktionsbau ausführen; Ergebnisse im Änderungsprotokoll festhalten.

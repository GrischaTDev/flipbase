# Inventar-Integrität und gemeinsame Ansicht – revidierter P0-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` task-by-task. Every task follows TDD and receives an independent review before the next task.

**Goal:** Die bereits implementierte Verkaufszustands-View wird fachlich präzisiert, neue `sold`-Inkonsistenzen werden verhindert, Altdaten können ohne erfundene Verkäufe geklärt werden und Mengen- sowie Einzelartikel erscheinen in einer gemeinsamen Inventartabelle.

**Architecture:** Verkaufsintegrität, Arbeitsstatus und Verkaufbarkeit sind getrennte Achsen. Eine `security_invoker`-View erkennt reguläre Verkaufspositionen und ältere Verkaufsheader. Ein gemeinsames Sellability-Prädikat gilt in Inventar, Verkaufsdialog, Listings, Store und Demo-Modus. Sale- und Statusübergänge laufen über atomare RPCs. Gebuchte Verkäufe werden in diesem Paket weder geändert noch gelöscht; ein fachlich vollständiges Korrektur- und Kostenreversal-Journal folgt separat.

**Tech Stack:** Angular 22, TypeScript strict, Signals, Tailwind CSS, Supabase/PostgreSQL 17, RLS, PL/pgSQL, Vitest, pgTAP/SQL-Transaktionstests.

**Spec:** `docs/superpowers/specs/2026-08-29-inventar-integritaet-und-gemeinsame-ansicht-design.md`

## Bereits erledigte Grundlage

- Commit `21248a5` ergänzt die erste `security_invoker`-View, Modellfelder und SQL-Fixture.
- Der zugehörige Typecheck-Fix ist vor Beginn dieses Plans zu übernehmen.
- Die erste View wird in Task 1 dieses Plans bewusst nachgeschärft; sie darf nicht als endgültige Verkaufbarkeitsregel verwendet werden.

## Verbindliche Grenzen

- Kein `void_sale`, kein pauschales FIFO-Zurücklegen und kein globales `isEffectiveSale` in diesem Paket.
- Retouren bleiben eigene Ereignisse und dürfen frühere Steuer- oder Bankperioden nicht rückwirkend entfernen.
- Fehlende Legacy-Daten werden nicht geschätzt.
- Direktes `sold` und Zurücksetzen eines `sold`-Artikels dürfen keinen RPC umgehen.
- Gebuchte Sales werden weder direkt geändert noch hart gelöscht.
- Ein Workspace mit Geschäftsdaten darf nicht hart gelöscht werden.
- Die deklarative Quelle ist `supabase/schemas/database.sql`; bestehende Migrationen bleiben unverändert.
- Neue Funktionen verwenden `security definer` nur für notwendige atomare Schreibvorgänge, stets mit `set search_path = ''`, Auth-/Workspace-Prüfung und minimalen Execute-Grants.

---

## Task 1: Verkaufsintegrität und Verkaufbarkeit fachlich trennen

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/tests/inventory_item_sale_integrity.sql`
- Modify: `src/app/core/models/flipbase.models.ts`
- Create: `src/app/core/models/inventory-sellability.ts`
- Create: `src/app/core/models/inventory-sellability.spec.ts`

**Produces:** präzisierte `inventory_item_sale_states`, Zustand `legacy_sale_header_without_line`, gemeinsames `isSellableInventoryItem`.

- [ ] **Step 1: Rote Tests für die Red-Team-Fälle schreiben.**

  SQL-Fixture ergänzt einen nicht retournierten `sales.inventory_item_id`-Header ohne `sale_lines` und erwartet `legacy_sale_header_without_line`. Ein `sold`-Artikel ohne Header und ohne Position bleibt `legacy_sold_unverified`. Mehrfachzählung desselben Verkaufs über Kopf und Position ist ausgeschlossen.

  TypeScript-Fixture prüft exakt:

  ```ts
  expect(isSellableInventoryItem(item('ready', 'no_active_sale'))).toBe(true);
  expect(isSellableInventoryItem(item('listed', 'no_active_sale'))).toBe(true);
  for (const status of [
    'received',
    'needs_review',
    'researched',
    'reserved',
    'returned',
    'defective',
    'archived',
    'sold',
  ] as const) {
    expect(isSellableInventoryItem(item(status, 'no_active_sale'))).toBe(false);
  }
  expect(isSellableInventoryItem(item('ready', 'sale_status_conflict'))).toBe(false);
  ```

- [ ] **Step 2: Tests rot ausführen.**

  ```powershell
  npx supabase test db supabase/tests/inventory_item_sale_integrity.sql
  npx vitest run src/app/core/models/inventory-sellability.spec.ts
  ```

  Expected: FAIL, weil Header-ohne-Position und gemeinsames Prädikat fehlen.

- [ ] **Step 3: View und Typen präzisieren.**

  `available` wird zu `no_active_sale` umbenannt. Die View berechnet getrennt:

  - bestandswirksame Positionsverkäufe über `sale_lines.inventory_item_id`;
  - bestandswirksame Legacy-Kopfverweise über `sales.inventory_item_id`;
  - eindeutige Verkaufs-IDs als Union, damit Kopf und Position desselben Verkaufs nur einmal zählen;
  - `legacy_sale_header_without_line`, wenn ein Kopf, aber keine Position existiert.

  Der vorhandene partielle Index auf nur `sales(id)` wird entfernt; der Primärschlüssel deckt diesen Zugriff bereits ab. Nur nachgewiesen benötigte Workspace-/Join-Indizes bleiben.

- [ ] **Step 4: Zentrales Sellability-Prädikat implementieren.**

  `isSellableInventoryItem` ist eine reine Funktion und erlaubt nur `ready` oder `listed` zusammen mit `no_active_sale`. Fehlender Integritätszustand ist im produktiven Supabase-Modus nicht verkaufbar; Demo-Fixtures müssen den Zustand ausdrücklich ableiten.

- [ ] **Step 5: Tests grün ausführen und committen.**

  Run: Befehle aus Step 2 plus `npm run typecheck`.

  Expected: PASS.

  ```powershell
  git add supabase/schemas/database.sql supabase/tests/inventory_item_sale_integrity.sql src/app/core/models
  git commit -m "fix: separate sale integrity from sellability"
  ```

---

## Task 2: Atomare Integritätsregeln und unveränderliche Altdaten-Klärung

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/tests/inventory_item_sale_integrity.sql`
- Create: `supabase/tests/fixtures/inventory_integrity_legacy.sql`
- Create: `supabase/tests/concurrency/inventory_double_sale.ps1`
- Modify: `src/app/core/services/inventory.service.ts`
- Modify: `src/app/core/services/inventory-persistence.spec.ts`

**Produces:** deferred Constraints, geschützter Status, `inventory_reconciliation_events`, `resolve_legacy_sold_item`.

- [ ] **Step 1: Commit- und Konkurrenz-Harness zuerst rot schreiben.**

  `supabase/tests/fixtures/inventory_integrity_legacy.sql` enthält ausschließlich die wiederverwendbaren Legacy-Datensätze. Im normalen pgTAP-Test werden die späteren Constraint-Trigger als Datenbank-Owner kontrolliert deaktiviert, die Fixture eingespielt und die Trigger vor den Assertions wieder aktiviert. So erzeugt der Test keine Trigger-Events für Altdaten, prüft aber alle neuen Änderungen mit aktiven Triggern.

  Für jeden erwarteten Commitfehler legt der Test eine temporäre PL/pgSQL-Hilfsfunktion in `pg_temp` an. Die Hilfsfunktion führt Mutation und `set constraints all immediate` innerhalb des von `throws_ok` gekapselten Subtransactions aus; dadurch ist der verzögerte Fehler tatsächlich abfangbar und die äußere Fixture bleibt verwendbar.

  `supabase/tests/concurrency/inventory_double_sale.ps1` startet zwei getrennte `psql`-Sessions gegen die lokale Datenbank, hält beide Transaktionen über Advisory Locks/Barrieren gleichzeitig offen und erwartet: genau eine Buchung committet, die andere scheitert, genau eine bestandswirksame Verkaufs-ID bleibt.

  Pflichtfälle:

  - neues `sold` ohne Positionsverkauf scheitert;
  - Positionsverkauf zu Status ungleich `sold` scheitert;
  - zweiter bestandswirksamer Verkauf scheitert;
  - Änderung von `sale_lines.inventory_item_id` prüft OLD und NEW;
  - direkter Orphan-Wechsel `sold -> ready` scheitert;
  - `record_sale` bleibt atomar funktionsfähig;
  - fremder Workspace und `anon` scheitern.

- [ ] **Step 2: Unveränderliches Klärungsjournal definieren.**

  `inventory_reconciliation_events` enthält Workspace, Artikel, Actor, `event_type`, vorherigen/neuen Status, Grund und Erfassungszeitpunkt. RLS erlaubt `authenticated` ausschließlich Select im eigenen Workspace. Insert/Update/Delete sind für Clients entzogen; nur geprüfte RPCs schreiben.

- [ ] **Step 3: Status- und Sale-Integrität implementieren.**

  Deferrable Constraint-Trigger prüfen betroffene Artikel nach Änderungen an `inventory_items.status`, `sale_lines` und relevanten Sale-Zuständen. Ein zusätzlicher Schutz verhindert direkte Übergänge von oder nach `sold`. `record_sale`, `record_sale_return` und Klärungs-RPCs erhalten die eng begrenzte interne Berechtigung. `record_sale` erlaubt nur das gemeinsame Sellability-Äquivalent `ready|listed` plus konfliktfreien Zustand.

- [ ] **Step 4: Legacy-Klärung implementieren.**

  `resolve_legacy_sold_item(..., 'restore_stock', reason)` funktioniert nur für `legacy_sold_unverified`, verlangt einen nichtleeren Grund, setzt atomar `ready` und schreibt das Ereignis. `legacy_sale_header_without_line` darf hier nicht zurückgesetzt oder als neuer Sale gebucht werden; dafür wird nur `Korrektur erforderlich` ausgegeben.

- [ ] **Step 5: InventoryService auf View und RPC umstellen.**

  View-Zeilen werden per ID gemergt. Abgeleitete Felder werden nie in Tabellenupdates aufgenommen. Demo-Zustände werden anhand der vorhandenen Sales und Sale-Lines klassifiziert. `resolveLegacySoldItem` aktualisiert lokale Signals erst nach bestätigter RPC-Antwort.

- [ ] **Step 6: Tests grün ausführen und committen.**

  ```powershell
  npx supabase test db supabase/tests/inventory_item_sale_integrity.sql
  npx vitest run src/app/core/services/inventory-persistence.spec.ts
  npm run typecheck
  git add supabase/schemas/database.sql supabase/tests/inventory_item_sale_integrity.sql src/app/core/services/inventory.service.ts src/app/core/services/inventory-persistence.spec.ts
  git commit -m "feat: enforce inventory sale integrity"
  ```

---

## Task 3: Harte Lösch- und Änderungswege sicher schließen

**Files:**

- Modify: `supabase/schemas/database.sql`
- Create: `supabase/tests/business_record_immutability.sql`
- Modify: `src/app/core/services/sales.service.ts`
- Modify: `src/app/core/services/sales-persistence-actions.spec.ts`
- Modify: `src/app/features/sales/sales.component.ts`
- Modify: `src/app/features/sales/sales.component.html`
- Modify: `src/app/features/sales/sales-toast-actions.spec.ts`
- Modify: `src/app/core/services/workspace.service.ts`
- Modify: `src/app/core/services/workspace.service.spec.ts`

**Produces:** keine direkten Sale-Updates/-Deletes, keine indirekten Deletes, kein Workspace-Hard-Delete mit Geschäftsdaten.

- [ ] **Step 1: Rote Immutability-Tests schreiben.**

  Als authentifiziertes Mitglied müssen scheitern:

  - direkter Insert eines Verkaufsheaders, sowohl mit als auch ohne `inventory_item_id`;
  - direktes Update oder Delete eines gebuchten Verkaufs;
  - direkter Insert, Update oder Delete einer Retoure;
  - Delete eines Einzelartikels oder Einkaufs, wenn irgendein Verkaufsheader, eine Position, Retoure, Rechnung oder Versandreferenz davon abhängt;
  - Delete eines Workspace mit Einkauf, Verkauf, Rechnung oder fachlichem Ereignis.

  Ein leerer zweiter Workspace darf weiterhin durch seinen Admin gelöscht werden.

- [ ] **Step 2: Datenbankgrenzen implementieren.**

  Sales-Insert-/Update-/Delete-Policies und Returns-Insert-/Update-/Delete-Policies entfallen. Die entsprechenden direkten DML-Grants werden nach allen Blanket-Grants ausdrücklich entzogen. Schreiben erfolgt ausschließlich über `record_sale`, `place_store_order` und `record_sale_return`; deren Execute-Rechte bleiben minimal. Fremdschlüssel, die Geschäftshistorie über Eltern-Cascade vernichten könnten, werden auf `restrict` umgestellt. Ein Before-Delete-Guard blockiert gefüllte Workspaces mit verständlichem Fehler. Die vorbereitenden `voided_*`-Spalten sind für Clients nicht schreibbar und bleiben bis zum Korrekturjournal ungenutzt.

- [ ] **Step 3: Unsichere UI- und Servicepfade entfernen.**

  `deleteSale` und seine Nachholwarteschlange entfallen. Die Sales-Seite bietet kein Löschen oder freies Bearbeiten gebuchter Verkäufe mehr. Für tatsächlich zurückgekehrte Ware bleibt `Retoure erfassen`; ein Hinweis erklärt, dass Erfassungsfehler einen Korrekturvorgang benötigen. Workspace-Löschung zeigt den Datenbankfehler verständlich und entfernt lokal nichts bei Ablehnung.

- [ ] **Step 4: Tests grün ausführen und committen.**

  ```powershell
  npx supabase test db supabase/tests/business_record_immutability.sql
  npx vitest run src/app/core/services/sales-persistence-actions.spec.ts src/app/features/sales/sales-toast-actions.spec.ts src/app/core/services/workspace.service.spec.ts
  npm run typecheck
  git add supabase src/app/core/services/sales.service.ts src/app/features/sales src/app/core/services/workspace.service.ts src/app/core/services/*spec.ts
  git commit -m "fix: protect booked business records"
  ```

---

## Task 4: Gemeinsame Inventartabelle ohne Funktionsverlust

**Files:**

- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.ts`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.html`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts`
- Modify: `src/app/features/inventory/inventory.component.ts`
- Modify: `src/app/features/inventory/inventory.component.html`
- Modify: vorhandene Inventar-Aktionsspecs
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.html`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`

**Produces:** eine Tabelle, verständliche Begriffe, read-only verkauft, sichtbare Altdatenklärung.

- [ ] **Step 1: Regressionstests vor der Template-Änderung rot ergänzen.**

  Die gemeinsame Tabelle muss Desktop und Mobil abdecken und vorhandene Funktionen behalten: Details, Verkauf, Auswahl/Etiketten für Einzelstücke, Store-Schalter, Statusanzeige, Suche, Status-/Zustandsfilter und Bestandsbewegungshistorie. Pflichtassertions:

  - Mengenposition fünf plus Einzelstück eins stehen im selben `<table>`;
  - keine Tablist und keine Tabs `Bestand`/`Einzelstücke`;
  - Menge zeigt tatsächliche Stückzahl, nicht Zeilenzahl;
  - `Wareneingänge und Einstandskosten` statt sichtbarem `Lose`;
  - `sold` zeigt festen Badge und nie `Status bitte wählen`;
  - `legacy_sold_unverified` zeigt beide Klärungswege;
  - `legacy_sale_header_without_line` zeigt nur `Korrektur erforderlich`, keinen neuen Verkauf;
  - AXE/WCAG-AA-Prüfung für Fokus, Labels und Tabellenstruktur.

- [ ] **Step 2: Gemeinsame Präsentationszeilen implementieren.**

  Die Komponente vereinigt bestehende StockPositions und gefilterte Einzelartikel, ohne die physischen Quellen zusammenzulegen. Mengenpositionen sind aggregiert; Einzelartikel tragen Menge eins nur dann als verfügbar, wenn das zentrale Sellability-Prädikat wahr ist. Problematische und verkaufte Artikel bleiben über Filter auffindbar, zählen aber nicht als verfügbar.

- [ ] **Step 3: Inventarseite und Detail integrieren.**

  `InventoryTab`/`activeTab` entfallen. Suche gilt für beide Zeilenarten. Ein Filter `Altdaten prüfen` zeigt Integritätskonflikte. Der Statusselect wird bei `sold` und Konflikten durch Badge/Warnung ersetzt. `Wieder in Bestand nehmen` verlangt Grund und Bestätigung; `Verkauf nachtragen` trägt explizite Legacy-Reconciliation im Route-State.

- [ ] **Step 4: Mengenstandard und Texte prüfen.**

  Der vorhandene Einkaufseditor-Test muss ausdrücklich bestätigen, dass neue Mengen- und Individualpositionen mit Menge eins starten. Sichtbare technische Begriffe `Lose` werden in Inventar und Einkauf durch `Wareneingänge`, `Herkunft` und `Einstandskosten` ersetzt.

- [ ] **Step 5: Gezielte Tests grün ausführen und committen.**

  ```powershell
  npx vitest run src/app/features/inventory src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.spec.ts
  npm run typecheck
  git add src/app/features/inventory src/app/features/purchases
  git commit -m "feat: show one unified inventory table"
  ```

---

## Task 5: Verkaufbarkeit systemweit vereinheitlichen

**Files:**

- Modify: `src/app/features/sales/components/sale-create-modal/*`
- Modify: `src/app/core/services/mock-data-store.service.ts`
- Modify: Store-/Listing-Services und -Komponenten, die Einzelartikel anbieten
- Modify: zugehörige Specs
- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/tests/inventory_item_sale_integrity.sql`

**Produces:** identische Verkaufbarkeit in DB, App, Store, Listing und Demo.

- [ ] **Step 1: Rote Matrix-Tests schreiben.**

  Für jeden ItemStatus und jeden Integritätszustand wird geprüft, ob Inventar, Verkaufsdialog, Listing und Store dieselbe Entscheidung treffen. `ready|listed + no_active_sale` ist erlaubt; alles andere gesperrt. Demo- und Supabase-Modus müssen Einzelverkäufe identisch auf `sold` setzen und Doppelverkauf verhindern.

- [ ] **Step 2: Alle lokalen Filter auf das gemeinsame Prädikat umstellen.**

  Entferne verstreute Regeln wie `status !== 'sold' && status !== 'archived'`. Store- und Listing-Abfragen laden den Integritätszustand oder verwenden eine sichere View. Ein fehlender Zustand führt fail-closed zu nicht verkaufbar.

- [ ] **Step 3: Datenbank-RPCs auf dieselbe Matrix härten.**

  `record_sale` und Shop-Checkout prüfen serverseitig `ready|listed`, keinen aktiven Verkauf, keinen Legacy-Header ohne Position und keine Mehrfachzuordnung. Parallele Transaktionen sperren die Artikelzeile. `record_sale_return` lehnt vorbereitend gesetzte Aufhebungsdaten ab, auch wenn diese in diesem Paket nicht clientseitig gesetzt werden können.

- [ ] **Step 4: Tests grün ausführen und committen.**

  ```powershell
  npx vitest run src/app/features/sales src/app/core/services/store-order-persistence-actions.spec.ts src/app/core/services/mock-data-store.service.spec.ts
  npx supabase test db supabase/tests/inventory_item_sale_integrity.sql
  npm run typecheck
  git add src/app/features/sales src/app/features/store src/app/core/services supabase/schemas/database.sql supabase/tests
  git commit -m "fix: enforce one sellability rule"
  ```

---

## Task 6: Migration, Upgrade-Probe und vollständige Abnahme

**Files:**

- Create: neue Migration unter `supabase/migrations/`
- Modify: `src/app/core/models/supabase.types.ts`
- Create: `supabase/tests/inventory_integrity_upgrade.ps1`
- Create: `docs/superpowers/reports/2026-08-29-inventar-integritaet-p0-abnahme.md`

- [ ] **Step 1: Migration bei gestoppter Umgebung erzeugen.**

  ```powershell
  npx supabase stop
  npx supabase db diff -f inventory_integrity_unification
  ```

  Prüfe die neue Datei manuell; keine vorhandene Migration darf verändert sein.

- [ ] **Step 2: Sauberen Neuaufbau und echte Upgrade-Probe ausführen.**

  ```powershell
  npx supabase start
  npx supabase db reset --local
  ```

  `supabase/tests/inventory_integrity_upgrade.ps1` führt reproduzierbar aus:

  1. `supabase db reset --local --version <unmittelbar_vorherige_migrationsversion> --no-seed`;
  2. `fixtures/inventory_integrity_legacy.sql` per `psql` einspielen;
  3. Counts, IDs, Verkaufssummen und deterministische Hashes in temporären Prüfdateien erfassen;
  4. `supabase migration up --local` mit der neuen Migration ausführen;
  5. dieselben Werte erneut erfassen und auf unveränderte Legacy-Daten prüfen;
  6. View-Klassifikation und aktive Trigger getrennt prüfen.

  Erst danach wird für die Neuinstallationsprobe noch einmal `supabase db reset --local` bis zum aktuellen Stand ausgeführt.

- [ ] **Step 3: Typen, SQL-Suiten und Advisors ausführen.**

  ```powershell
  npx supabase gen types typescript --local | Set-Content -Encoding utf8 src/app/core/models/supabase.types.ts
  npx supabase test db
  powershell -File supabase/tests/concurrency/inventory_double_sale.ps1
  powershell -File supabase/tests/inventory_integrity_upgrade.ps1
  npx supabase db lint --level warning
  npx supabase db advisors --local --type security --fail-on error
  npx supabase db advisors --local --type performance --fail-on error
  ```

- [ ] **Step 4: Vollständige App-Abnahme ausführen.**

  ```powershell
  npm run typecheck
  npm run lint
  npm test -- --run
  npm run format:check
  npm run build
  ```

- [ ] **Step 5: Bericht und Abschlusscommit erstellen.**

  Der Bericht nennt Migration, Neuaufbau, Upgrade-Hashes, RLS-/Advisor-Ergebnisse, Testausgaben, Datenqualitätszahlen, bekannte Einschränkungen und bestätigt, dass keine Produktionsmigration ausgeführt wurde.

  ```powershell
  git add supabase/migrations src/app/core/models/supabase.types.ts docs/superpowers/reports/2026-08-29-inventar-integritaet-p0-abnahme.md
  git commit -m "docs: record inventory integrity acceptance"
  ```

## Abdeckung der Red-Team-Korrekturen

| Risiko                                                  | Korrektur                                     |
| ------------------------------------------------------- | --------------------------------------------- |
| `available` macht Defekt/Archiv/Reservierung verkaufbar | Tasks 1, 5                                    |
| Header ohne Sale-Line erzeugt Doppelverkauf             | Tasks 1, 2, 5                                 |
| FIFO-Kosten nach pauschalem Storno falsch               | Storno aus P0 entfernt; eigenes Journal-Paket |
| Retouren verschwinden rückwirkend aus Perioden          | keine globale Wirksamkeitsfunktion            |
| RPC/Trigger prüfen OLD/NEW und Commit nicht sauber      | Task 2 mit `set constraints ... immediate`    |
| Legacy-Klärung umgeht RPC/Verlauf                       | Task 2, unveränderliches Journal              |
| indirekte Deletes/Workspace-Cascade                     | Task 3                                        |
| Store/Listings/Demo weichen ab                          | Task 5                                        |
| saubere Neuinstallation deckt Upgrade nicht ab          | Task 6 Upgrade-Fixture                        |

# Inventar-Integrität und gemeinsame Ansicht – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Each task uses test-driven development and receives a separate correctness review before the next task starts.

**Goal:** Mengenartikel und einzeln nachverfolgte Artikel erscheinen in einer Inventartabelle; `sold` ist aus wirksamen Verkäufen abgeleitet, historische Inkonsistenzen werden ohne erfundene Daten geklärt und Verkäufe werden storniert statt gelöscht.

**Architecture:** Die vorhandenen physischen Bestandsquellen bleiben bestehen. Eine `security_invoker`-View klassifiziert den Verkaufszustand von Einzelartikeln. Verzögerte Datenbankprüfungen sichern die Beziehung zwischen Artikelstatus und wirksamen Verkaufspositionen. Atomare RPCs übernehmen Altdatenklärung und Storno. Angular führt beide Bestandsarten in einer Präsentationskomponente zusammen und behandelt verkaufte Zustände schreibgeschützt.

**Tech Stack:** Angular 22, TypeScript strict, Signals, Reactive Forms, Tailwind CSS, Supabase/PostgreSQL 17, RLS, PL/pgSQL, Vitest, pgTAP/SQL-Transaktionstests.

**Spec:** `docs/superpowers/specs/2026-08-29-inventar-integritaet-und-gemeinsame-ansicht-design.md`

## Globale Regeln

- Die deklarative Quelle bleibt `supabase/schemas/database.sql`; die Migration wird anschließend per Supabase CLI aus dem Schema erzeugt.
- Bestehende Migrationen werden nicht verändert.
- Neue Views verwenden `security_invoker = true` und erhalten ausdrückliche Grants.
- Neue Funktionen prüfen `(select auth.uid())`, Workspace-Mitgliedschaft und verwenden `set search_path = ''` mit vollqualifizierten Namen.
- Altdaten werden klassifiziert, nie geschätzt oder automatisch in Verkäufe umgewandelt.
- Tests werden pro Task zuerst rot geschrieben, danach mit der kleinsten fachlich vollständigen Änderung grün gemacht.
- Angular-Komponenten bleiben Standalone, `OnPush`, mit externem HTML und Tailwind-Klassen direkt im Template.
- Git-Commit-Nachrichten sind Englisch.

## Geplante Dateien

| Datei                                                         | Verantwortung                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| `supabase/schemas/database.sql`                               | Stornofelder, View, Trigger, RPCs, Policies und Grants     |
| `supabase/tests/inventory_item_sale_integrity.sql`            | Klassifikation, Integritätsregeln, RLS und Altdatenklärung |
| `supabase/tests/sale_voiding.sql`                             | atomare Stornierung für Einzel- und Mengenbestand          |
| `src/app/core/models/flipbase.models.ts`                      | Verkaufszustand, Stornofelder und Bewegungsgrund           |
| `src/app/core/models/sale-target.models.ts`                   | explizite Legacy-Nachtragung im Verkaufsdialog             |
| `src/app/core/models/supabase.types.ts`                       | aus lokalem Schema generierte Datenbanktypen               |
| `src/app/core/services/inventory.service.ts`                  | View laden, Zustand an Artikel anreichern, Altdaten klären |
| `src/app/core/services/sales.service.ts`                      | Legacy-Verkauf und Storno über RPC                         |
| `src/app/features/inventory/components/stock-position-list/*` | gemeinsame responsive Inventartabelle                      |
| `src/app/features/inventory/inventory.component.*`            | gemeinsamer Such-/Filterzustand ohne Tabs                  |
| `src/app/features/inventory/pages/item-detail/*`              | verkaufter Status und Klärungsaktionen                     |
| `src/app/features/sales/components/sale-create-modal/*`       | ausdrückliche Legacy-Nachtragung                           |
| `src/app/features/sales/sales.component.*`                    | Storno-Dialog, Storno-Badge und korrekte Kennzahlen        |
| Auswertungs-, Steuer- und Bankabgleich-Services               | stornierte Verkäufe aus wirksamen Summen ausschließen      |

---

## Task 1: Verkaufszustand von Einzelartikeln klassifizieren

**Files:**

- Modify: `supabase/schemas/database.sql`
- Create: `supabase/tests/inventory_item_sale_integrity.sql`
- Modify: `src/app/core/models/flipbase.models.ts`

**Produces:** `InventoryItemSaleState`, View `public.inventory_item_sale_states`, Spalten `sales.voided_at`, `sales.voided_by`, `sales.void_reason`.

- [ ] **Step 1: Roten SQL-Test für bestehende und widersprüchliche Zustände schreiben.**

  Die Fixture legt in zwei Workspaces je einen verfügbaren Artikel, einen korrekt verkauften Artikel, einen `sold`-Artikel ohne Verkauf, einen aktiven Verkauf ohne `sold` und zwei aktive Verkäufe für dasselbe Einzelstück an. Exakte Erwartungen:

  ```sql
  select is(
    (select sale_state from public.inventory_item_sale_states where inventory_item_id = :'orphan_item_id'),
    'legacy_sold_unverified',
    'sold ohne wirksamen Verkauf bleibt ungeklärter Altbestand'
  );

  select is(
    (select active_sale_count from public.inventory_item_sale_states where inventory_item_id = :'valid_item_id'),
    1::bigint,
    'genau ein wirksamer Verkauf wird erkannt'
  );
  ```

  Zusätzlich wird als fremdes authentifiziertes Mitglied geprüft, dass keine Zeile des anderen Workspaces sichtbar ist.

- [ ] **Step 2: SQL-Test ausführen und das erwartete Fehlen der View bestätigen.**

  Run:

  ```powershell
  npx supabase test db supabase/tests/inventory_item_sale_integrity.sql
  ```

  Expected: FAIL, weil Stornofelder und View noch fehlen.

- [ ] **Step 3: Additive Stornofelder und `security_invoker`-View implementieren.**

  `sales` erhält nullable `voided_at timestamptz`, `voided_by uuid` und `void_reason text` mit Check auf nicht leeren Grund, sobald `voided_at` gesetzt ist. Ein Verkauf ist wirksam, wenn `returned_at is null and voided_at is null`.

  Die View liefert für jeden durch RLS sichtbaren Einzelartikel `inventory_item_id`, `workspace_id`, `active_sale_count`, `active_sale_id` und `sale_state`. Sie zählt `count(distinct sales.id)` über `sale_lines.inventory_item_id`. Definition:

  ```sql
  create or replace view public.inventory_item_sale_states
  with (security_invoker = true)
  as
  select ...
  from public.inventory_items as inventory_item
  left join public.sale_lines as sale_line ...
  left join public.sales as sale ... and sale.returned_at is null and sale.voided_at is null
  group by inventory_item.id, inventory_item.workspace_id, inventory_item.status;
  ```

  `anon` erhält keine Rechte; `authenticated` erhält nur `select`. Indizes werden für die Join- und Filterspalten ergänzt.

- [ ] **Step 4: Modell ergänzen und Tests grün ausführen.**

  ```ts
  export type InventoryItemSaleState =
    | 'available'
    | 'sold'
    | 'legacy_sold_unverified'
    | 'sale_status_conflict'
    | 'multiple_active_sales';
  ```

  `InventoryItem` erhält `sale_state`, `active_sale_count` und `active_sale_id`; `Sale` erhält die drei Stornofelder.

  Run: `npx supabase test db supabase/tests/inventory_item_sale_integrity.sql`

  Expected: PASS für Klassifikation und Workspace-Trennung.

- [ ] **Step 5: Commit erstellen.**

  ```powershell
  git add supabase/schemas/database.sql supabase/tests/inventory_item_sale_integrity.sql src/app/core/models/flipbase.models.ts
  git commit -m "feat: classify individual inventory sale state"
  ```

---

## Task 2: Neue Inkonsistenzen verhindern und Altdaten atomar klären

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/tests/inventory_item_sale_integrity.sql`

**Produces:** verzögerte Integritäts-Trigger, erweiterte `record_sale`-Validierung, RPC `resolve_legacy_sold_item`.

- [ ] **Step 1: Rote Integritätstests ergänzen.**

  Die Tests führen jeweils in eigener Transaktion aus und erwarten:

  - direktes `update inventory_items set status = 'sold'` ohne Verkauf schlägt bei Commit fehl;
  - aktiver Verkauf plus nicht verkauftem Status schlägt bei Commit fehl;
  - zweiter wirksamer Verkauf desselben Einzelartikels schlägt fehl;
  - `record_sale` funktioniert weiterhin, obwohl Status und Position innerhalb derselben Transaktion entstehen;
  - normaler `record_sale` für einen Legacy-Orphan schlägt fehl;
  - `record_sale` mit `legacy_reconciliation = true` funktioniert nur für genau den Orphan und erzeugt keine zweite Buchung;
  - `resolve_legacy_sold_item(..., 'restore_stock', reason)` setzt `ready`, erzeugt einen `activity_logs`-Eintrag und ändert keinen Umsatz;
  - leerer Grund und fremder Workspace werden abgelehnt.

- [ ] **Step 2: Ergänzte Tests ausführen.**

  Run: `npx supabase test db supabase/tests/inventory_item_sale_integrity.sql`

  Expected: FAIL, weil Trigger und RPC fehlen.

- [ ] **Step 3: Verzögerte Integritätsprüfung implementieren.**

  Eine interne Triggerfunktion validiert am Transaktionsende den betroffenen Einzelartikel. `constraint trigger ... deferrable initially deferred` wird auf folgenden Änderungen registriert:

  - `inventory_items`: Insert und Status-Update;
  - `sale_lines`: Insert, Änderung oder Delete eines `inventory_item_id`;
  - `sales`: Änderung von `returned_at` oder `voided_at` sowie Delete.

  Die Funktion erlaubt bestehende unberührte Altfehler, verhindert aber jeden neuen oder durch die Transaktion veränderten Widerspruch.

- [ ] **Step 4: Sichere Legacy-Nachtragung und Wiederaufnahme implementieren.**

  `record_sale` liest `coalesce((p_sale ->> 'legacy_reconciliation')::boolean, false)`. Bei einem bereits `sold` markierten Artikel darf nur dieser ausdrücklich angegebene Sonderfall fortfahren, wenn die View `legacy_sold_unverified` liefert. Vor dem Insert wird auf bestehende wirksame Verkaufspositionen geprüft.

  `resolve_legacy_sold_item(p_workspace_id, p_inventory_item_id, p_action, p_reason)` akzeptiert in diesem Paket ausschließlich `restore_stock`, sperrt die Artikelzeile, validiert den weiterhin ungeklärten Zustand, setzt `ready` und schreibt einen Verlaufseintrag mit Actor und Grund. Nur `authenticated` erhält Execute.

- [ ] **Step 5: SQL-Tests grün ausführen und committen.**

  Run: `npx supabase test db supabase/tests/inventory_item_sale_integrity.sql`

  Expected: PASS; kein direkter oder paralleler Schreibweg erzeugt einen neuen aktiven Widerspruch.

  ```powershell
  git add supabase/schemas/database.sql supabase/tests/inventory_item_sale_integrity.sql
  git commit -m "feat: enforce individual sale integrity"
  ```

---

## Task 3: Verkäufe atomar stornieren statt löschen

**Files:**

- Modify: `supabase/schemas/database.sql`
- Create: `supabase/tests/sale_voiding.sql`
- Modify: `src/app/core/models/flipbase.models.ts`

**Produces:** RPC `void_sale`, Bewegungsgrund `sale_void`, entfernte Sales-Delete-Policy.

- [ ] **Step 1: Rote Stornotests für beide Bestandsarten schreiben.**

  Für einen Einzelartikelverkauf wird geprüft: Verkaufszeile bleibt vorhanden, `voided_at/by/reason` sind gesetzt, Artikel ist `ready`, Position bleibt erhalten, kein Delete ist möglich.

  Für einen Mengenverkauf wird geprüft: jedes zugeordnete `stock_lot.remaining_quantity` steigt genau um seine gespeicherte Allokation; je Allokation entsteht eine `direction = 'in'`-Bewegung mit `reason = 'sale_void'`; ursprüngliche Sale-Bewegungen bleiben bestehen.

  Doppelte Stornierung, Retoure plus Storno, leerer Grund und fremder Workspace müssen scheitern.

- [ ] **Step 2: Stornotest ausführen.**

  Run: `npx supabase test db supabase/tests/sale_voiding.sql`

  Expected: FAIL, weil RPC und Bewegungsgrund fehlen.

- [ ] **Step 3: `void_sale` und Rechte implementieren.**

  Die Funktion sperrt Verkauf, Positionen und betroffene Lose. Sie validiert Workspace, Zustand und Grund, führt alle Bestände zurück und markiert zuletzt den Verkauf als storniert. Das Ergebnis enthält Sale, betroffene Artikel-IDs, Losmengen und neue Bewegungen. Die vorhandene Policy `Verkauf loeschen` wird entfernt; Grants erlauben keinen direkten Delete.

- [ ] **Step 4: SQL-Tests ausführen und committen.**

  Run: `npx supabase test db supabase/tests/sale_voiding.sql`

  Expected: PASS; sowohl Stück als auch Menge sind nach einem Storno vollständig wieder verfügbar, ohne Historie zu verlieren.

  ```powershell
  git add supabase/schemas/database.sql supabase/tests/sale_voiding.sql src/app/core/models/flipbase.models.ts
  git commit -m "feat: void sales without deleting history"
  ```

---

## Task 4: Angular-Dienste auf abgeleiteten Zustand und atomare Aktionen umstellen

**Files:**

- Modify: `src/app/core/services/inventory.service.ts`
- Modify: `src/app/core/services/sales.service.ts`
- Modify: `src/app/core/models/sale-target.models.ts`
- Modify: `src/app/core/services/inventory.service.spec.ts`
- Modify: `src/app/core/services/sales-persistence-actions.spec.ts`
- Modify: `src/app/core/services/sales.service.spec.ts`

**Produces:** angereicherte Inventarartikel, `resolveLegacySoldItem`, `voidSale`, `legacyReconciliation`.

- [ ] **Step 1: Rote Service-Tests schreiben.**

  Erwartete Verträge:

  ```ts
  expect(service.items()[0].sale_state).toBe('legacy_sold_unverified');
  expect(rpc).toHaveBeenCalledWith('resolve_legacy_sold_item', {
    p_workspace_id: 'workspace-1',
    p_inventory_item_id: 'item-1',
    p_action: 'restore_stock',
    p_reason: 'Status aus Altdaten war falsch',
  });

  expect(rpc).toHaveBeenCalledWith('void_sale', {
    p_workspace_id: 'workspace-1',
    p_sale_id: 'sale-1',
    p_reason: 'Doppelt erfasst',
  });
  expect(supabase.from('sales').delete).not.toHaveBeenCalled();
  ```

  `recordSale` muss `legacy_reconciliation: true` nur senden, wenn der explizite Input gesetzt ist.

- [ ] **Step 2: Gezielte Tests rot ausführen.**

  Run:

  ```powershell
  npx vitest run src/app/core/services/inventory.service.spec.ts src/app/core/services/sales-persistence-actions.spec.ts src/app/core/services/sales.service.spec.ts
  ```

  Expected: FAIL wegen fehlender View-Anreicherung und RPC-Methoden.

- [ ] **Step 3: InventoryService implementieren.**

  `loadInventory` und `getItemById` laden zusätzlich die sichtbaren `inventory_item_sale_states` und mergen sie per ID. Ohne View-Zeile wird defensiv aus dem Status klassifiziert: nicht `sold` wird `available`; `sold` wird nicht als verifiziert verkauft ausgegeben. Demo-Daten werden anhand der vorhandenen Mock-Sales klassifiziert.

  `resolveLegacySoldItem` trimmt und validiert den Grund, ruft das RPC und aktualisiert Artikel sowie View-Zustand erst nach Erfolg.

- [ ] **Step 4: SalesService implementieren und alte Nachholwarteschlange entfernen.**

  `RecordSaleInput` erhält optional `legacyReconciliation`. `deleteSale` wird durch `voidSale(saleId, reason)` ersetzt. Der Dienst ruft ausschließlich `void_sale`, aktualisiert Verkauf und Bestand nach bestätigter Antwort und besitzt keinen zweistufigen Delete-/Status-Nachlauf mehr. Nicht mehr verwendete Follow-up-Typen und Local-Storage-Einträge werden entfernt.

- [ ] **Step 5: Tests grün ausführen und committen.**

  Run: gleiche Vitest-Auswahl wie Step 2.

  Expected: PASS; kein Servicepfad löscht Sales direkt oder setzt `sold` unabhängig vom Buchungs-RPC.

  ```powershell
  git add src/app/core/services/inventory.service.ts src/app/core/services/sales.service.ts src/app/core/models/sale-target.models.ts src/app/core/services/*.spec.ts
  git commit -m "refactor: use atomic inventory sale actions"
  ```

---

## Task 5: Eine gemeinsame Inventartabelle und verständliche Statusanzeige

**Files:**

- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.ts`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.html`
- Modify: `src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts`
- Modify: `src/app/features/inventory/inventory.component.ts`
- Modify: `src/app/features/inventory/inventory.component.html`
- Modify: `src/app/features/inventory/inventory-actions.spec.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.html`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.spec.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`

**Produces:** eine responsive Inventartabelle, schreibgeschütztes `Verkauft`, Altdaten-Klärungsaktionen und verständliche Wareneingangsbegriffe.

- [ ] **Step 1: Rote UI-Tests schreiben.**

  Die Tests prüfen:

  - eine Mengenposition mit fünf Stück und ein verfügbarer Einzelartikel stehen im selben `<table>`;
  - ein verkauftes Einzelstück zeigt Menge null und festen `Verkauft`-Badge, aber keinen Status-Select;
  - ein Legacy-Orphan zeigt `Altdaten ungeklärt`, `Verkauf nachtragen` und `Wieder in Bestand nehmen`;
  - keine Tablist und keine Texte `Bestand (` oder `Einzelstücke (` existieren;
  - die Aufklappaktion heißt `Wareneingänge und Einkaufspreise` und enthält kein sichtbares `Lose`;
  - ein einzelner verfügbarer Artikel löst `sellIndividual` aus und Details verlinken auf `/inventory/:id`;
  - Item-Detail zeigt für `sold` keinen leeren Custom-Select;
  - die Verkaufsnachtragung öffnet den Dialog mit `legacyReconciliation = true`;
  - die Wiederaufnahme verlangt Bestätigung und Grund und zeigt Erfolg erst nach RPC-Erfolg.

- [ ] **Step 2: Gezielte Komponenten-Tests rot ausführen.**

  Run:

  ```powershell
  npx vitest run src/app/features/inventory/components/stock-position-list/stock-position-list.component.spec.ts src/app/features/inventory/inventory-actions.spec.ts src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts src/app/features/sales/components/sale-create-modal/sale-create-modal.component.spec.ts
  ```

  Expected: FAIL wegen Tabs, fehlender Aktionen und falscher Statusdarstellung.

- [ ] **Step 3: Gemeinsame Tabellenkomponente erweitern.**

  `StockPositionListComponent` erhält alle gefilterten Einzelartikel, zeigt pro Einzelartikel Menge eins nur bei verfügbarem Zustand und gibt typisierte Aktionen aus. Verkaufte und ungeklärte Artikel bleiben auffindbar, zählen aber nicht als verfügbar. Desktop und Mobil zeigen dieselbe fachliche Information. Die technischen `lots` bleiben intern, alle sichtbaren Labels werden auf `Wareneingänge und Einkaufspreise` umgestellt.

- [ ] **Step 4: Inventarseite ohne Tabs integrieren.**

  Entferne `InventoryTab` und `activeTab`. Suche filtert Mengenpositionen und Einzelartikel. Status-/Zustandsfilter gelten dort, wo die Daten vorhanden sind; `Altbestand prüfen` filtert auf die problematischen Sale-States. KPI-Mengen summieren tatsächliche Stückzahlen statt nur Tabellenzeilen. Die gemeinsame Komponente öffnet Mengen- und Einzelverkäufe über denselben Verkaufsdialog.

- [ ] **Step 5: Detail- und Verkaufsdialog implementieren.**

  Item-Detail rendert bei `sold` einen festen Badge. Bei `legacy_sold_unverified` werden Erklärung und Klärungsaktionen gezeigt. `Verkauf nachtragen` navigiert mit einem erweiterten `SaleTarget`; der Modal nimmt diesen Artikel trotz `sold` nur als explizit vorgegebenes Ziel an und sendet `legacyReconciliation`.

- [ ] **Step 6: UI-Tests grün ausführen und committen.**

  Run: gleiche Vitest-Auswahl wie Step 2.

  Expected: PASS und keine zugängliche Tab-Rolle mehr auf der Inventarseite.

  ```powershell
  git add src/app/features/inventory src/app/features/sales/components/sale-create-modal src/app/features/purchases/pages/purchase-detail src/app/core/models/sale-target.models.ts
  git commit -m "feat: unify inventory presentation"
  ```

---

## Task 6: Storno in Verkauf, Auswertungen und Export korrekt behandeln

**Files:**

- Modify: `src/app/features/sales/sales.component.ts`
- Modify: `src/app/features/sales/sales.component.html`
- Modify: `src/app/features/sales/sales-toast-actions.spec.ts`
- Modify: `src/app/core/services/dashboard-report.service.ts`
- Modify: `src/app/core/services/dashboard-report.service.spec.ts`
- Modify: `src/app/core/services/analytics.service.ts`
- Modify: `src/app/core/services/tax-engine.service.ts`
- Modify: `src/app/core/services/bank-reconciliation.service.ts`
- Modify: `src/app/core/services/export.service.ts`
- Modify: jeweilige vorhandene Specs der geänderten Services

**Produces:** sichtbares Storno mit Grund; alle wirksamen Summen schließen stornierte Verkäufe aus.

- [ ] **Step 1: Rote fachliche Tests ergänzen.**

  Eine Fixture enthält einen normalen, einen retournierten und einen stornierten Verkauf. Erwartet wird:

  - Sales-Tabelle zeigt alle drei mit passenden Badges;
  - Umsatz/Gewinn/Steuer/Bankabgleich berücksichtigen den stornierten Verkauf mit null;
  - CSV-Export behält die Zeile und enthält `status = voided`, `voided_at`, `void_reason`;
  - die UI-Aktion fragt nach einem Grund, ruft `voidSale` auf und spricht nicht mehr von Löschen.

- [ ] **Step 2: Gezielte Tests rot ausführen.**

  Run:

  ```powershell
  npx vitest run src/app/features/sales/sales-toast-actions.spec.ts src/app/core/services/dashboard-report.service.spec.ts src/app/core/services/analytics.service.spec.ts src/app/core/services/tax-engine.service.spec.ts src/app/core/services/bank-reconciliation.service.spec.ts src/app/core/services/export.service.spec.ts
  ```

  Expected: FAIL, weil `voided_at` noch nicht überall als unwirksam behandelt wird.

- [ ] **Step 3: Eine gemeinsame Wirksamkeitsregel verwenden.**

  Ergänze eine kleine reine Modellfunktion `isEffectiveSale(sale): boolean`, die `!sale.returned_at && !sale.voided_at` prüft. Alle Summen-, Steuer- und Abgleichservices verwenden sie statt eigener, abweichender Filter. Der Export verliert die historische Zeile nicht.

- [ ] **Step 4: Verkaufsseite auf Storno umstellen.**

  Der Bestätigungsdialog verlangt einen nicht leeren Grund. Die Seite zeigt `Storniert` und den Grund, hält die Zeile aber sichtbar. Erfolgs- und Fehlermeldungen erfolgen erst nach RPC-Antwort. Bearbeiten, Retournieren und erneutes Stornieren sind bei stornierten Verkäufen deaktiviert.

- [ ] **Step 5: Tests grün ausführen und committen.**

  Run: gleiche Vitest-Auswahl wie Step 2.

  Expected: PASS; keine wirksame Kennzahl enthält einen stornierten Verkauf.

  ```powershell
  git add src/app/features/sales src/app/core/models/flipbase.models.ts src/app/core/services
  git commit -m "feat: exclude voided sales from effective totals"
  ```

---

## Task 7: Migration, Typen, vollständige Abnahme und Bericht

**Files:**

- Modify: `src/app/core/models/supabase.types.ts`
- Create: neue Datei unter `supabase/migrations/`
- Create: `docs/superpowers/reports/2026-08-29-inventar-integritaet-und-gemeinsame-ansicht-abnahme.md`

**Produces:** reproduzierbare Migration, aktuelle Typen und nachweisbare Abnahme.

- [ ] **Step 1: Lokales Supabase-Schema sauber neu aufbauen.**

  ```powershell
  npx supabase stop
  npx supabase db reset
  npx supabase db lint --level warning
  ```

  Expected: Schema und Seeds werden vollständig aufgebaut; keine neuen Sicherheits- oder Funktionsfehler.

- [ ] **Step 2: Neue Migration aus der deklarativen Schemaänderung erzeugen.**

  Erzeuge genau eine neue, UTC-benannte Migration mit `supabase db diff -f inventory_integrity_unification`. Prüfe die Datei manuell auf ausschließlich erwartete additive Änderungen, Policy-Entzug, Grants, Trigger und Funktionen. Bereits vorhandene Migrationsdateien bleiben byte-identisch.

- [ ] **Step 3: Typen generieren und gezielte SQL-Tests erneut ausführen.**

  ```powershell
  npx supabase gen types typescript --local | Set-Content -Encoding utf8 src/app/core/models/supabase.types.ts
  npx supabase test db supabase/tests/inventory_item_sale_integrity.sql
  npx supabase test db supabase/tests/sale_voiding.sql
  ```

  Expected: Typen enthalten View, Stornofelder und RPCs; beide SQL-Suiten bestehen.

- [ ] **Step 4: Datenqualitätsbericht gegen die lokale Fixture erfassen.**

  Dokumentiere Anzahl und IDs für `legacy_sold_unverified`, `sale_status_conflict`, `multiple_active_sales` und Verkaufsheader ohne Position. Bestätige ausdrücklich, dass kein historischer Sale erfunden wurde.

- [ ] **Step 5: Vollständige automatisierte Prüfung ausführen.**

  ```powershell
  npm run typecheck
  npm test -- --run
  npm run format:check
  npm run build
  ```

  Expected: alle Befehle bestehen. Bekannte `localStorage`-Experimentalwarnungen werden als vorbestehend dokumentiert, sofern sie weiterhin auftreten.

- [ ] **Step 6: Supabase-Sicherheitsberater ausführen.**

  Führe die verfügbaren lokalen oder verknüpften Security-/Performance-Advisors aus. Neue Warnungen zu View-Rechten, `security definer`, RLS oder fehlenden Policy-Indizes werden vor Abschluss behoben.

- [ ] **Step 7: Abnahmebericht und Abschlusscommit erstellen.**

  Der Bericht enthält Migrationsname, Testausgaben, RLS-Ergebnis, Datenqualitätszahlen, bekannte Einschränkungen, Rollback-/Restore-Hinweis und die Bestätigung, dass keine Produktionsmigration angewendet wurde.

  ```powershell
  git add supabase/migrations src/app/core/models/supabase.types.ts docs/superpowers/reports/2026-08-29-inventar-integritaet-und-gemeinsame-ansicht-abnahme.md
  git commit -m "docs: record unified inventory acceptance"
  ```

## Anforderungsabdeckung

| Anforderung                                        | Tasks                                 |
| -------------------------------------------------- | ------------------------------------- |
| eine Inventartabelle statt zwei Tabs               | 5                                     |
| Menge standardmäßig eins                           | 5 und bestehender Einkaufseditor-Test |
| verständliche Begriffe statt `Lose`                | 5                                     |
| gültig verkauft ohne leeres Auswahlfeld            | 1, 4, 5                               |
| bestehende `sold`-Altdaten ohne erfundene Verkäufe | 1, 2, 4, 5                            |
| keine neuen `sold`-Orphans                         | 2, 3                                  |
| atomare Stornierung statt Hard Delete              | 3, 4, 6                               |
| korrekte Umsatz-, Steuer- und Abgleichwerte        | 6                                     |
| RLS, Grants und reproduzierbare Migration          | 1, 2, 3, 7                            |
| vollständige technische Abnahme                    | 7                                     |

## Plan-Selbstprüfung

- Jede Spezifikationsanforderung besitzt mindestens einen roten Test und einen Implementierungsschritt.
- Historische Daten werden nur gelesen und klassifiziert; kein Preis, Datum oder Verkauf wird geschätzt.
- Die Integritätsregel liegt in PostgreSQL und hängt nicht von einer einzelnen Angular-Oberfläche ab.
- Die gemeinsame Ansicht ist eine Präsentationsvereinheitlichung; die sichere physische Konsolidierung der Bestandsquellen bleibt dem Journal-Paket vorbehalten.
- Steuer- und Belegpflichten werden nicht als durch dieses Paket vollständig erledigt ausgegeben.

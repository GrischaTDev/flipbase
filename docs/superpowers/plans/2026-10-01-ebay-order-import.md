# eBay-Artikelzuordnung und Bestellübernahme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persönlich verbundene eBay-Konten können Inserate konkreten Artikeln
zuordnen und geprüfte Bestellungen genau einmal als Verkauf mit Bestandsabgang buchen.

**Architecture:** Das Marktplatzfeature bereitet die externen Quelldaten vor;
das Verkaufsfeature verwendet die vorhandene Verkaufserfassung. Eine begrenzte
Datenbankfunktion prüft einen serverseitig bestätigten Prüfstand, schützt die
Quelle vor Doppelbuchung und ruft innerhalb derselben Transaktion `record_sale` auf.

**Tech Stack:** Bestehendes Angular 22, TypeScript, Tailwind, Supabase/PostgreSQL,
Deno/Web Crypto, Vitest, pgTAP und Playwright. Keine neue Produktabhängigkeit.

**Spec:** [2026-10-01-ebay-order-import-design.md](../specs/2026-10-01-ebay-order-import-design.md).
Schriftliche Spezifikation durch „los“ am 1. Oktober 2026 freigegeben. Umsetzung
wartet auf Prüfung dieses Plans und Wahl der Ausführungsmethode.

## Global Constraints

- Chat und Oberflächentexte Deutsch mit persönlicher Du-Ansprache; Codebezeichner
  Englisch, Assistent Juna, eigener Branch `juna/ebay-order-import`.
- Angular-Komponenten OnPush, Signals, externe HTML-Vorlagen und native Control
  Flow; Tailwind im HTML, Markenakzent `#fcc601`, Shared-Komponenten verwenden.
- Eine Prüfmaske pro Bestellung, Hauptaktion „Verkauf buchen“, alle Positionen
  gemeinsam buchen oder gemeinsam verwerfen.
- Nur vollständig bezahlte EUR-Bestellungen ohne Storno oder Erstattung;
  Verkaufsdatum ausdrücklich in `Europe/Berlin`.
- Unbekannte Gebühren und tatsächliche Versandkosten bleiben leer bis zur
  Bestätigung; Warenumsatz, Versandumsatz und Kosten bleiben getrennt.
- Prüfstände höchstens fünf Minuten gültig; bei Bestätigung erneut bei eBay lesen.
- Eigene aktive Verbindung und aktive Workspace-Mitgliedschaft sind erforderlich;
  Administratorrechte ersetzen persönlichen Kontozugriff nicht.
- Keine Käuferanschriften, Nachrichten, Tokens oder rohen eBay-Antworten speichern.
- Bestehende OAuth-Rechte und Verschlüsselungsschlüssel erhalten; keine eBay-Schreibaktion.
- Schema deklarativ, Migration automatisch erzeugen und prüfen, Typen regenerieren;
  RLS und begrenzte Funktionsrechte, kein direkter Master-Push.
- Keine produktive Bestellung als Test buchen und kein lokaler Docker-Bau.
- Vor Push nach abgeschlossenen Prüfungen exakt fragen:
  „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“

## Review Focus

1. Ein Rabatt von 10,00 € für drei Stück darf nicht zu 9,99 € oder 10,02 € werden;
   exakt zwei Stück zu 3,33 € und ein Stück zu 3,34 € buchen (Aufgabe 1/2).
2. Eine kostenlose Position oder ein Centbetrag kleiner als die Stückmenge kann
   mit dem vorhandenen positiven Stückpreisvertrag nicht gebucht werden; konkret
   sperren, keine Position weglassen und manuelle Verkäufe nicht ändern (1/5).
3. Fehlende Variantenkennung bei einem Varianteninserat darf keine allgemeine
   Zuordnung auf eine möglicherweise falsche Variante anwenden (1/4).
4. Ein Browser-Neuladen während unklarem Buchungsergebnis muss den Beleg prüfen,
   statt die Bestellung erneut zu buchen; auch ein späterer Ladefehler darf einen
   erfolgreichen Commit nicht zum Buchungsfehler umdeuten (3/6).
5. Ein nur veränderter Versandstatus darf keine unnötige Neueingabe verlangen;
   geänderter Preis, Menge, Zahlung oder Storno verlangt dagegen erneute Prüfung
   einschließlich Mitternacht/Sommerzeit beim Datum (1/3/6).

## Dateien und Verantwortung

| Bereich        | Dateien                                                                                                                                        | Verantwortung                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Quelle         | `supabase/functions/_shared/ebay-order-import-contracts.ts`, `ebay-order-amounts.ts`, `ebay-order-source.ts`                                   | Typen, Centbeträge, Buchbarkeit und Fingerabdruck                              |
| Bestehende API | `supabase/functions/_shared/ebay-api.ts`, `ebay-contracts.ts`                                                                                  | Einzelbestellung, normalisierte Listen und Inseratvarianten                    |
| Datenbank      | `supabase/schemas/330_ebay_order_import.sql`, `supabase/config.toml`                                                                           | Zuordnungen, private Prüfstände, unveränderliche Buchungsbelege und Funktionen |
| Edge           | `supabase/functions/ebay-account/connection-read.ts`, `order-import.ts`, bestehende `handler.ts`/`index.ts`                                    | Wiederverwendbarer Kontozugriff und geprüfte Importaktionen                    |
| Zuordnung      | `src/app/features/marketplaces/services/ebay-order-import-api.service.ts`, `ebay-article-mapping.store.ts`, `components/ebay-article-mapping/` | Anbieterzugriff, Zuordnungszustand und datenloser Picker                       |
| Verkauf        | `src/app/features/sales/models/external-sale-entry.models.ts`, bestehende `sale-create-modal`                                                  | Allgemeiner Übergabevertrag und Wiederverwendung der Verkaufsform              |
| Prüfung        | `src/app/features/sales/pages/ebay-sale-review/`, `services/ebay-sale-review.store.ts`                                                         | Prüfmaske, Bestätigung, Ergebnis und Rückweg                                   |
| Nachweise      | Neue gezielte Specs, SQL-Suite, Paralleltest und `e2e/ebay-order-import.spec.ts`                                                               | Geld-, Rechte-, Buchungs- und Bediennachweise                                  |

Alle neuen Komponenten erhalten separate `.ts`- und `.html`-Dateien. Vor Eingriffen
in gemeinsame Dateien Changelog und aktuelle Herkunft prüfen. Vor Umsetzung den
aktuellen `origin/master` prüfen; spätere Änderungen aus fremden Zweigen nicht
ungefragt übernehmen. Der bisherige eigene Stand ist Dokumentation auf `16ec9de2`.

## Aufgabe 1: Eindeutige Quelle und centgenaue Beträge

**Files:** Create `_shared/ebay-order-import-contracts.ts`, `ebay-order-amounts.ts`,
`ebay-order-source.ts` und gleichnamige `.test.ts` unter `supabase/functions/`.
Modify `_shared/ebay-api.ts`, `_shared/ebay-contracts.ts`, `_shared/ebay-api.test.ts`.
Testdateien verwenden bestehende Deno-/Node-Assertions ohne neue Bibliothek.

**Interfaces:**

- `EbayMoney = { readonly currency: string; readonly cents: number }`.
- `EbayOrderSource`: `orderId`, `createdAt`, `lastModifiedAt`, `observedAt`,
  `paymentStatus`, `cancelStatus`, `fulfillmentStatus`, `currency`,
  `totalCents`, `shippingRevenueCents`, `lines`, `blockers`.
- `EbayOrderSourceLine`: `lineItemId`, `listingId`, `variationId`, `sku`, `title`,
  `quantity`, `goodsCents`, `hasRefund`, `variationAspects`. Fehlende Kennungen,
  Beträge und Mengen sind `null`, nicht erfundene Werte.
- `EbayEnvironment`, `AccountScope` und `EbayConfig` kommen aus den bestehenden
  serverseitigen eBay-/Marktplatzverträgen. `SaleTarget` und `RecordSaleInput`
  kommen aus den vorhandenen Frontend-Verträgen. Status-/Hash-/Positionskennungen
  sind Strings, Centbeträge/Mengen Zahlen, `variationAspects` eine readonly Liste
  aus `{ name: string; value: string }` und `blockers` readonly Stringcodes.
- `EbaySaleTarget`: Union aus `{ inventoryItemId: string }` und
  `{ catalogProductId: string }`; `EbayOrderAssignment`: `{ lineItemId, target }`.
- `parseEbayMoney(value: unknown): EbayMoney | null`;
  `splitEbayLineAmount(cents: number, quantity: number): readonly { quantity: number; unitCents: number }[]`.
- `parseEbayOrderSource(row: Record<string, unknown>, observedAt: string): EbayOrderSource`;
  `ebaySaleDate(createdAt: string): string`;
  `ebayOrderReviewHash(source: EbayOrderSource): Promise<string>`.
- `ebayOrderSourceKey(secret: string, workspaceId: string, environment: EbayEnvironment, accountId: string, orderId: string): Promise<string>`.
- `readOrder(config: EbayConfig, token: string, orderId: string, fetcher?: typeof fetch): Promise<EbayOrderSource>`.

- [x] **1. Tests schreiben:** `splits discounted cents without changing revenue`,
      `blocks zero priced source lines`, `rejects malformed money and duplicate line IDs`,
      `preserves missing source values`, `does not reuse ambiguous variant mapping`,
      `uses Berlin date across midnight and DST`, `ignores fulfillment-only changes in review hash`.

  ```ts
  assert.deepEqual(splitEbayLineAmount(1000, 3), [
    { quantity: 2, unitCents: 333 },
    { quantity: 1, unitCents: 334 },
  ]);
  assert.equal(parseEbayMoney({ value: '1.234', currency: 'EUR' }), null);
  assert.equal(ebaySaleDate('2026-09-30T22:30:00Z'), '2026-10-01');
  ```

- [x] **2. Rot nachweisen:** `deno test --allow-env supabase/functions/_shared/ebay-order-amounts.test.ts supabase/functions/_shared/ebay-order-source.test.ts`;
      neue fehlende Funktionen müssen den Test scheitern lassen.
- [x] **3. Quelle implementieren:** Geld ausschließlich aus geprüften Dezimalstrings
      mit höchstens zwei Nachkommastellen, sicheren ganzen Cent und PostgreSQL-
      Betragsgrenzen lesen. Warenbetrag nach Rabatt plus rabattierter Versand muss
      Bestellumsatz ergeben; unbekannte Status, nicht abbildbare Steuern/Anpassungen,
      Erstattungen und fehlende Angaben erzeugen konkrete Sperrgründe. Nur `PAID` und
      `NONE_REQUESTED` mit vorhandenen leeren `refunds`-Arrays zulassen. Fehlende oder
      ungültige Refund-Arrays sind unklar und gesperrt. Kein Stückpreis aus Positions-`total`.
- [x] **4. API ergänzen:** Einzelabruf mit festem Anbieterhost und URL-kodierter
      Bestellnummer; derselbe Parser für Listen. Bestehende Anzeigefelder erhalten,
      neue `importSource: EbayOrderSource | null` ergänzen. Trading-Inseratvarianten
      als `variants` mit stabiler Kennung/SKU/Merkmalen normalisieren; fehlende
      Variantenkennung bleibt gesperrt für automatische Zuordnung. Titel ist Suchhilfe.
- [x] **5. Hash und Schlüssel implementieren:** SHA-256 über kanonisch sortierte
      buchungsrelevante Quelle, ohne Abrufzeit/reinen Versandfortschritt. HMAC-SHA-256
      über JSON-Tupel `[workspaceId, environment, accountId, orderId]`; HKDF-SHA-256
      mit Salt `flipbase:ebay:source:v1` und Info `order-booking` aus dem bestehenden
      32-Byte-Schlüssel. Tests beweisen gleiche Quelle nach Wiederverbindung und
      getrennte Schlüssel für Konto, Umgebung und Workspace.
- [x] **6. Grün nachweisen:** obige Tests plus `_shared/ebay-api.test.ts`; bestehende
      Token-, OAuth- und Listenfälle erhalten. Commit:
      `feat(core): normalize eBay order sources and exact amounts`.

## Aufgabe 2: Rechte und atomare Buchung

**Files:** Create `supabase/schemas/330_ebay_order_import.sql`,
`supabase/tests/ebay-order-import.test.sql`. Modify `supabase/config.toml`,
gegebenenfalls das bestehende Retention-Inventar in
`supabase/schemas/80_workspace_retention.sql`, generierte
`src/app/core/models/supabase.types.ts`. Migration ausschließlich per CLI erzeugen.

**Interfaces:** Alle SQL-Funktionen vollqualifiziert, `set search_path = ''`.

- Tabellen `ebay_article_mappings`, `ebay_order_snapshots`, `ebay_order_bookings`
  entsprechend Spezifikation; eindeutiger Buchungsschlüssel
  `(workspace_id, environment, source_key)`, Ziel-Fremdschlüssel mit Workspace.
- Authenticated-RPCs:
  `ebay_set_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_listing_id text, p_variation_id text, p_target jsonb) returns jsonb`;
  `ebay_remove_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_mapping_id uuid) returns boolean`;
  `ebay_record_order_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb) returns jsonb`.
- Service-RPCs:
  `ebay_store_order_snapshot(p_user_id uuid, p_connection_id uuid, p_version bigint, p_operation_id uuid, p_source_key text, p_review_hash text, p_source jsonb, p_booking_ready boolean) returns jsonb`;
  `ebay_get_order_booking(p_user_id uuid, p_connection_id uuid, p_source_key text) returns jsonb`;
  `ebay_mark_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_reason text, p_sale_id uuid) returns jsonb`;
  `ebay_clear_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_source_key text) returns boolean`.
- Buchungsantwort: `{ status: 'imported', saleId: string, alreadyRecorded: boolean }`;
  manuelle Markierung: `{ status: 'recorded_elsewhere', saleId: string | null }`.
  Kein Beleg: `{ status: 'unrecorded', saleId: null }`.

- [x] **1. SQL-Nachweise schreiben:** Normales Mitglied, anderer Nutzer mit anderem
      Konto, zweiter Nutzer desselben eBay-Kontos, fremder Workspace, archivierter
      Workspace/Zielartikel, fehlender Bestand, doppelte Position, manipulierte Kosten,
      falsche Autorisierungsfassung und direkter Tabellenzugriff. Nach zwei identischen
      Buchungsversuchen: ein Verkauf, ein Quellenbeleg und nur einmalige Bestandsmenge.
      Eine ungültige zweite Position hinterlässt null neue Verkäufe/Bestandsbewegungen.
- [x] **2. Rot nachweisen:** Neue SQL-Suite gegen eine isolierte migrierte Testdatenbank
      ausführen; fehlende Tabelle/Funktion muss scheitern, nicht durch Fehlerunterdrückung.
- [x] **3. Schema implementieren:** RLS und getrennte Policies je erlaubter Operation,
      indizierte Prüfschlüssel, keine direkten Client-Schreibrechte auf Quelle/Belege.
      Snapshots gehören dem prüfenden Nutzer und der Verbindung/Fassung. Belege haben
      keinen löschenden OAuth-Fremdschlüssel. Leser benötigen eigenes identisches
      Konto plus aktive Mitgliedschaft; bestehende Verkaufsrechte bleiben bestehen.
- [x] **4. RPCs implementieren:** Service-Aufrufe prüfen bestätigte Nutzeridentität
      und eigene Verbindung erneut. `record_sale` wird mit dem Nutzer-JWT-Kontext
      aufgerufen, niemals mit erfundener `auth.uid()`. Die Buchungs-RPC benötigt
      `security definer` für private Quelle und ausschließlich begrenzte Rechte.
      Mitgliedschaft/Workspace, Verbindung, Quellen-Transaktionssperre und Snapshot
      werden in dieser festen Reihenfolge bis Commit geschützt. Auch ein noch nicht
      vorhandener Beleg wird über seinen Schlüssel gesperrt. Bestehender Beleg wird
      vor erneuter Bestandsprüfung als Ergebnis zurückgegeben.
- [x] **5. Bestätigungsnachweis erzwingen:** Anzeige-Snapshot gilt maximal fünf Minuten
      und hat `booking_ready = false`. Nur der Server kann nach erneutem eBay-Abruf
      einen Buchungs-Snapshot mit `booking_ready = true` und höchstens 30 Sekunden
      Laufzeit erzeugen. Die Buchungs-RPC lehnt Anzeige-Snapshots, fremde Snapshots und
      ungeprüfte Kosten ab. Mengen/Preise/Datum/Plattform stammen aus der Quelle;
      `p_assignments` enthält nur genau einmal jede Quellposition und ein konkretes Ziel.
      Cent-Aufteilung aus Aufgabe 1 wird in SQL identisch geprüft und den erzeugten
      Verkaufszeilen zugeordnet. Positive Stückpreise bleiben Voraussetzung.
- [x] **6. Lebenszyklus umsetzen:** Erledigt-Markierung und Rücknahme verwenden dieselbe
      Quellensperre. Rücknahme nur für manuelle Markierung ohne Importverkauf; ein optional
      ausgewählter bereits manueller Verkauf wird dabei nicht verändert. Ein Importbeleg
      bleibt nach Verkaufsstorno/Retoure bestehen. Vorhandene eBay-Verkäufe mit gleicher
      externer Bestellnummer sperren ungeklärte Altübernahme. Kontolöschung entfernt
      Mapping/temporäre Quelle, behält minimale Geschäftsbelege im bestehenden
      Aufbewahrungsablauf; Ablaufbereinigung verarbeitet höchstens 100 Snapshots pro
      passendem Abruf, keine neue Hintergrundautomatik.
- [x] **7. Migration erzeugen und prüfen:** CLI-Hilfe lesen; im isolierten Projekt
      `supabase stop`, `supabase db diff -f ebay_order_import`. Erzeugte SQL-Datei
      vollständig mit dem deklarativen Schema abgleichen, Kopfkommentar ergänzen,
      keine existierende Migration ändern. Gegen frisch migrierte Testdatenbank
      `npx supabase gen types typescript --local` ausführen und Ausgabe sicher in die
      Typdatei schreiben. Kein Zugriff auf produktive Datenbank für diese Schritte.
- [x] **8. Grün nachweisen:** `node scripts/prepare-db-tests.mjs` und nach CLI-Hilfe
      `supabase test db supabase/tests/ebay-order-import.test.sql` sowie die betroffenen
      bestehenden eBay-/Bestands-/Verkaufs-Suiten. Schema-/Migrationsverträge:
      `node --test scripts/check-schema-registration.test.mjs scripts/check-migration-changes.test.mjs scripts/release-migrations.test.mjs`.
      Commit: `feat(core): book verified eBay orders transactionally`.

## Aufgabe 3: Serveraktionen mit erneuter Quellenprüfung

**Files:** Create `supabase/functions/ebay-account/connection-read.ts`,
`connection-read.test.ts`, `order-import.ts`, `order-import.test.ts`.
Modify `ebay-account/handler.ts`, `handler.test.ts`, `index.ts`,
`_shared/ebay-order-import-contracts.ts`, `_shared/ebay-contracts.ts`.

**Interfaces:**

- `EbayOrderReview extends AccountScope`: `snapshotId`, `reviewHash`, `expiresAt`,
  `source: EbayOrderSource`, `assignments: readonly EbayOrderAssignment[]`,
  `booking: EbayOrderBooking`; `EbayOrderBooking` ist die Antwortunion aus Aufgabe 2.
- `EbayOrderCosts`: `platformFeeCents`, `shippingCostCents`, `shippingMode`,
  `additionalCosts` mit bestehenden Kostenkategorien; beide Pflichtwerte müssen
  vorhandene nichtnegative ganze Cent sein. Kein impliziter Default null → null/0.
  `shippingMode` ist `seller_arranged | platform_prepaid | pickup | null`;
  Kostenzeilen enthalten `category`, `description: string | null`, `amountCents`.
- `EbayOrderBookRequest extends AccountScope`: `snapshotId`, `reviewHash`,
  `assignments`, `costs`; `EbayOrderBookResponse` ist `{ status: 'imported', saleId, alreadyRecorded }`
  oder `{ status: 'review_changed', review: EbayOrderReview }`.
- `EbayConnectionReadContext`: `connection: StoredEbayConnection` mit zusätzlichem
  `external_account_id: string | null`, `accessToken: string`, `operationId: string`.
- `withEbayConnection<T>(scope: AccountScope, bearer: string, store: EbayAccountStore, config: EbayConfig, action: (context: EbayConnectionReadContext) => Promise<T>): Promise<T>` kapselt
  bestehenden claim/refresh/finish-Ablauf, einschließlich einer begrenzten
  Wiederholung nach Anbieter-401. `action` erhält serverseitige Verbindung mit
  `external_account_id` und gültigen Access-Token; Token bleibt intern.
- `EbayOrderImportStore` erweitert `EbayAccountStore` um typisierte Adapter zu den
  Snapshot-/Beleg-RPCs aus Aufgabe 2 sowie den Aufruf der Buchungs-RPC mit Nutzer-Bearer.
- `createEbayOrderImportHandler(store: EbayOrderImportStore, config: EbayConfig, fetcher?: typeof fetch): (request: Request) => Promise<Response>` bearbeitet nur
  `order_review`, `order_book`, `order_status`, `order_recorded_elsewhere`,
  `order_clear_recorded_elsewhere`. Zuordnungen verwenden die RPCs aus Aufgabe 2.

- [x] **1. Tests schreiben:** `requires verified user for every import action`,
      `cannot book a review-only snapshot`, `rechecks changed source before booking`,
      `resolves a committed response loss without another provider read`,
      `releases token lock after provider failure`, `never exposes tokens or account IDs`.
      Anbieterfake zeichnet HTTP-Methoden auf: ausschließlich lesende GETs sowie
      vorhandene OAuth-Tokenaufrufe, keine Angebots-/Versand-Schreibaktion.
- [x] **2. Rot nachweisen:** `deno test --allow-env supabase/functions/ebay-account/order-import.test.ts`.
- [x] **3. Kontozugriff extrahieren:** Bestehende Listen und neue Importaktionen
      verwenden denselben geprüften Tokenablauf. OAuth-Callback und Trennen behalten
      ihre bisherigen Verträge. Payload auf 64 KiB UTF-8 begrenzen; Quellpositionen
      haben eindeutige begrenzte Kennungen, keine beliebigen Anbieter-URLs übernehmen.
- [x] **4. Review/Book implementieren:** Nutzer via `getUser`; eigene aktive Verbindung
      prüfen. `order_review` liest Einzelbestellung und speichert Anzeige-Snapshot.
      `order_book` prüft zunächst Beleg, danach eigenen Anzeige-Snapshot, liest erneut,
      vergleicht Review-Hash und erzeugt nur bei Gleichheit den kurzen Buchungs-Snapshot.
      Anschließend Buchungs-RPC über Nutzerclient aufrufen. Änderungen liefern 409
      mit typisierter `review_changed`-Antwort, Anbieterfehler keinen Buchungsversuch.
- [x] **5. Status/Markierung implementieren:** Beleg ohne eBay-Netzabruf über serverseitig
      erzeugten Quellenschlüssel lesen. Erledigt-Markierung benötigt bestätigten
      Prüfstand und nichtleeren Grund; optionaler Verkauf muss zum Workspace gehören.
      Rücknahme benötigt ausdrückliche Bestätigung und darf keine Importbelege ändern.
      Erkennung von Schemafähigkeit ergänzt `importAvailable` im Kontostatus;
      fehlende Serverfähigkeit bedeutet false und lässt bisherigen Leseablauf nutzbar.
- [x] **6. Grün nachweisen:** gezielte neue und bestehende eBay-Handler-/Callback-/
      Löschtests, anschließend `deno check` für die drei bestehenden eBay-Einstiegspunkte.
      Neue Deno-Tests ausdrücklich in `.github/workflows/ci.yml` aufnehmen, weil der
      bestehende Pflichtaufruf eine feste Dateiliste verwendet. Kein Test nur lokal.
      Deno 2.9.7 aus CI und vorhandene Edge-Runtime/Deno 2.1.4 bei Serverprobe beachten.
      Commit: `feat(core): verify eBay orders before import`.

## Aufgabe 4: Gespeicherte Artikelzuordnung und Anbieteradapter

**Files:** Create `src/app/features/marketplaces/services/ebay-order-import-api.service.ts`,
`ebay-article-mapping.store.ts`, gleichnamige `.angular.spec.ts`,
`components/ebay-article-mapping/ebay-article-mapping.component.ts`, `.html`, `.angular.spec.ts`,
`models/ebay-order-import-response.ts`, `.spec.ts`.
Modify `models/ebay-response.ts`, `.spec.ts`, `services/ebay-account-api.service.ts`,
`services/ebay-account.store.ts` und bestehende `components/ebay-account` samt Spec.

**Interfaces:**

- `EbayArticleMapping`: `id`, `listingId`, `variationId: string | null`,
  `target: EbaySaleTarget`; Scope kommt immer aus aktueller geprüfter Verbindung.
- `EbayOrderImportApiService`: `loadMappings(scope)`, `saveMapping(scope, listingId, variationId, target)`,
  `removeMapping(scope, mappingId)`, `prepareOrder(scope, orderId): Promise<EbayOrderReview>`,
  `bookOrder(request: EbayOrderBookRequest): Promise<EbayOrderBookResponse>`,
  `loadOrderStatus(scope, orderId): Promise<EbayOrderBooking>`,
  `markRecordedElsewhere(scope, snapshotId, reason, saleId?): Promise<EbayOrderBooking>`,
  `clearRecordedElsewhere(scope, orderId): Promise<void>`.
- Mapping-Store: Signals `mappings`, `loading`, `error`; `load(scope)`,
  `save(scope, listingId, variationId, target)`, `remove(scope, mappingId)`, `clear()`.
- Mapping-Komponente: Inputs `scope`, `listing`; keine Tabellenabfrage,
  Artikelauswahl über vorhandenen Picker und `buildSaleArticleEntries`.

- [ ] **1. Tests schreiben:** Serverantwort muss erwarteten Workspace/Verbindung
      enthalten; fehlende Importfähigkeit ist false. Fremde/verspätete Antworten
      verwerfen. Gleiche Inseratkennung mit zwei Varianten hält getrennte Ziele.
      Variante ohne stabile Kennung bekommt kein allgemeines gespeichertes Ziel.
      Gespeicherter Nullbestand bleibt sichtbar, ist für Buchung gesperrt.
- [ ] **2. Rot nachweisen:** `npx vitest run --project=node src/app/features/marketplaces/models/ebay-order-import-response.spec.ts` und neue gezielte Angular-Specs.
- [ ] **3. Adapter/Parser implementieren:** Geteilte Typen aus Aufgabe 1/3 importieren,
      keine Typkopien. Zuordnungen über Nutzer-RPC, Quellenaktionen über Edge-Function;
      409-Reviewänderung bewusst parsen, übrige Fehler verständlich abbilden.
      Alte Listenantwort ohne `importSource` bleibt lesbar und nicht importierbar.
- [ ] **4. Store/Picker integrieren:** Anfragegeneration bei Konto-/Workspacewechsel
      erhöhen, Signals leeren und veraltete Antworten ignorieren. Für Zuordnung nur
      verfügbare konkrete Ziele auswählen, gespeicherte ungültige Zuordnung erklären.
      Inseratansicht zeigt „Artikel zuordnen“, „Zuordnung ändern“ und „Zuordnung entfernen“.
- [ ] **5. Grün nachweisen:** neue Specs plus `ebay-response.spec.ts`,
      `ebay-account.store.angular.spec.ts`, `ebay-account.component.angular.spec.ts`;
      gezielte Format-/Lintprüfung. Commit:
      `feat(core): link eBay listings to workspace articles`.

## Aufgabe 5: Allgemeiner Übergabevertrag für die Verkaufserfassung

**Files:** Create `src/app/features/sales/models/external-sale-entry.models.ts`.
Modify `components/sale-create-modal/sale-create-modal.component.ts`, `.html`,
`.angular.spec.ts`, `sale-entry-refactor.angular.spec.ts` im selben Feature.

**Interfaces:**

- `ExternalSaleEntryLine`: `sourceLineId`, `title`, `quantity`, `unitSalePrice`,
  `target: SaleTarget | null`; Aufteilung mehrerer Zeilen derselben Quelle erlaubt.
- `ExternalSaleEntryDraft`: `revision`, `platform`, `saleDate`, `externalOrderId`,
  `shippingRevenue`, `lines`, `requireConfirmedCosts: true`.
- `ExternalSaleEntrySaveResult`: `{ status: 'saved' } | { status: 'review_changed' } | { status: 'outcome_unknown' }`.
- `ExternalSaleEntrySubmit = (input: RecordSaleInput) => Promise<ExternalSaleEntrySaveResult>`.
- Neue Inputs `externalDraft: ExternalSaleEntryDraft | null` und
  `externalSubmit: ExternalSaleEntrySubmit | null`; fehlende Inputs erhalten
  unverändert den manuellen Erstell-/Bearbeit-/Altdatenablauf.

- [ ] **1. Tests schreiben:** `requires explicit external fee and shipping costs`,
      `locks source fields while allowing article assignment`,
      `preserves manual sale defaults and edit behavior`,
      `does not persist on review_changed or outcome_unknown`.
      Konkrete Assertions: Gebühren/Versandkosten zunächst null, `canSave() === false`;
      nach ausdrücklicher Eingabe beider Werte 0 und vollständigen Artikeln true.
      Datenbankantwort saved löst created aus; andere Zustände niemals created/closed.
- [ ] **2. Rot nachweisen:** `npx vitest run --project=angular src/app/features/sales/components/sale-create-modal/sale-create-modal.component.angular.spec.ts`.
- [ ] **3. Übergabe implementieren:** Allgemeines externes Draft initialisieren,
      ursprüngliche Kosten-/Artikelaingaben bei verträglicher Revision behalten.
      Quellenzeilen können weder entfernt noch in Menge/Preis geändert werden;
      geschützte Controls trotzdem vollständig über geprüfte Formwerte übernehmen.
      Zwei aufgeteilte Zeilen derselben Quelle teilen genau ein Ziel; Artikelauswahl
      aktualisiert beide. Der Store führt sie später über stabile Draft-Reihenfolge
      und `sourceLineId` wieder zu genau einer Quellzuordnung zusammen.
      Keine eBay-Netzwerk-/Kontologik in der Form. Null/fehlend ist nicht bestätigtes 0.
- [ ] **4. Speichern anpassen:** Externe Funktion hat klaren Vorrang nur bei externem
      Draft; `saved` setzt Persistenzzustand, `review_changed` hält Formular offen,
      `outcome_unknown` verhindert Neubuchung bis Statusklärung. Neue sichtbare
      Bezeichnungen Englisch im Code; historische deutsche Bezeichner nicht umbauen.
- [ ] **5. Grün nachweisen:** neue und vorhandene Verkaufserfassungs-Specs,
      `npm run typecheck`, `npm run build`; Typprüfung ersetzt Vorlagenbau nicht.
      Commit: `feat(sales): support reviewed external sale entries`.

## Aufgabe 6: Bestellprüfmaske, Ergebnis und Rückweg

**Files:** Create `src/app/features/sales/pages/ebay-sale-review/ebay-sale-review.component.ts`,
`.html`, `.angular.spec.ts`, `services/ebay-sale-review.store.ts`, `.angular.spec.ts`.
Modify `src/app/app.routes.ts`, Marktplatz-`ebay-account` samt Specs;
`src/app/core/services/sales.service.ts` und dessen Spec für allgemeinen Refresh.

**Interfaces:**

- Lazy Route `/sales/ebay/:connectionId/:orderId` mit `unsavedEntryGuard`;
  aktiver Workspace stammt aus `WorkspaceService`, nicht aus beliebigem Routerstate.
- Review-Store: Signals `review`, `loading`, `booking`, `error`, `outcomeUnknown`;
  `load(scope, orderId)`, `submit(input: RecordSaleInput): Promise<ExternalSaleEntrySaveResult>`,
  `resolveOutcome()`, `markRecordedElsewhere(reason, saleId?)`, `clearRecordedElsewhere()`.
- `SalesService.refreshAfterExternalSale(workspaceId: string): Promise<void>`
  lädt Verkäufe, Bestand und Inventar für denselben aktiven Workspace über
  vorhandene Services; keine eBay-Logik und keine zweite Speicherung.

- [ ] **1. Tests schreiben:** `loads full source after route reload`,
      `preserves costs after changed review`, `resolves unknown outcome before retry`,
      `does not rebook after post-commit refresh failure`, `ignores stale workspace responses`,
      `marks manual order without sale or stock mutation`.
      Konkrete Assertion: Nach gespeichertem saleId und fehlgeschlagenem Refresh bleibt
      Ergebnis saved, Buchungsaufrufe genau eins, Meldung fordert Ansichtsaktualisierung.
- [ ] **2. Rot nachweisen:** neue gezielte Angular-Specs des Stores und der Seite.
- [ ] **3. Maske bauen:** Bestehendes `EntryPageLayoutComponent` und Verkaufsform,
      Hauptaktion „Verkauf buchen“, Quellenkopf mit Abrufzeit und Sperrgründen.
      Quellenzeilen aus Aufgabe 1 deterministisch in externes Draft überführen.
      Zum Öffnen Workspace-Kontext sperren, bei Zerstörung freigeben; vorhandene
      ungespeicherte-Eingaben-/beforeunload-Regeln weiterverwenden.
- [ ] **4. Ergebnis führen:** Bei review_changed neue Revision übernehmen und erneute
      Prüfung verlangen. Bei unbekanntem Ergebnis zuerst `loadOrderStatus`, nach
      bestätigtem unrecorded nur einen bewusst ausgelösten neuen Versuch zulassen.
      Erfolgreicher Beleg bleibt erfolgreich trotz lokalem Ladefehler. Navigation
      zurück nach `/marketplaces/ebay` desselben Workspaces; Verkaufslink nach Erfolg.
- [ ] **5. Bestellansicht ergänzen:** Importfähigkeit und gespeicherten Status anzeigen;
      „Bereits manuell gebucht“ mit Bestätigung/Grund und optionalem Verkauf anbieten,
      Rücknahme nur für erlaubte manuelle Markierung. Ungeeignete Bestellungen zeigen
      konkrete Sperrgründe. Kein Kunde muss technische Kennungen eintippen.
- [ ] **6. Grün nachweisen:** gezielte neue Specs und vorhandene Verkaufs-/eBay-Specs,
      Typen, Angular-Bau und Shared-UI-Check. Commit:
      `feat(sales): review and confirm eBay order imports`.

## Aufgabe 7: Parallel-, Browser- und Veröffentlichungsnachweis

**Files:** Create `supabase/test-support/ebay-order-import-concurrency.mjs`,
`e2e/ebay-order-import.spec.ts`. Modify `.github/workflows/ci.yml`,
`scripts/playwright-pr-smoke.test.mjs` nur zur Pflichtregistrierung;
`docs/AI-CHANGELOG.md`, `docs/implementation/ebay-api-integration-analysis.md`.

**Interfaces:** Parallelrunner erwartet `EBAY_TEST_DB_CONTAINER`, akzeptiert nur
ausdrücklich ausgewählte isolierte Testcontainer mit Namen `supabase_db_*` oder
`flipbase-ebay-test-*` und lehnt Produktionsname `supabase-db` ab. Testdaten erhalten
zufällige IDs; Aufräumen löscht ausschließlich die eigenen Testobjekte.
Browserfall verwendet vorhandene Test-Workspace-Fixture und serverseitig angelegte
künstliche Quelle; abgefangene Anbieterantworten ersetzen ausschließlich eBay.

- [ ] **1. Parallelfälle schreiben:** Zwei Sessions buchen dieselbe Quelle gleichzeitig:
      gleicher saleId, ein Quellenbeleg, einmaliger Abgang. Zwei verschiedene Quellen
      konkurrieren um ein verfügbares Stück: genau eine Buchung, Bestand null, kein
      Teilverkauf der anderen Bestellung. Parallelzugriff entziehen/Verbindung trennen:
      kein unberechtigter Commit. Test gegen leere isolierte Datenbank mit echter
      Rollen-/JWT-Ausführung, kein ausschließlich gemockter Nachweis.
- [ ] **2. Browserfälle schreiben:** `imports an eBay order exactly once @core-smoke`
      durch Zuordnen, unbekannte Kosten, bestätigte 0/echte Kosten, „Verkauf buchen“,
      erneuten Aufruf und nachvollziehbare Bestandsänderung führen. Zweiter Fall prüft
      Erledigt-Markierung ohne Bestandsänderung. 1440/390 Pixel, Tastatur/Fokus,
      Fehlermeldungen und AXE. Neuladen mit verlorenem Routerstate ausdrücklich prüfen.
- [ ] **3. Rot nachweisen:** neue Parallelfälle und
      `npx playwright test e2e/ebay-order-import.spec.ts --config=playwright.pr.config.ts`
      gegen Testdienste; erwartete fachliche Fehler sichtbar, keine Pflichtprüfung umgehen.
- [ ] **4. CI und Betrieb vervollständigen:** Paralleltest nach DB-Migration in vorhandenen
      isolierten DB-Check integrieren. Browserfall über bestehendes `@core-smoke`
      verpflichtend registrieren und Workflowvertrag aktualisieren. Schema zuerst,
      eBay-Funktionen inklusive gemeinsamer Quellen danach aus exakt geprüftem Merge
      veröffentlichen; bis Serverfähigkeit bestätigt ist bleibt Übernahme gesperrt.
      Bestehende Token-/Löschendpointtests erneut prüfen. Kein produktiver Importtest.
- [ ] **5. Grün nachweisen:** Parallelrunner, SQL-/Edge-/betroffene Angular-/Parsertests,
      `node --test scripts/playwright-pr-smoke.test.mjs`, Shared-UI-/Suite-Audit,
      Format/Lint geänderter Dateien, Typen und Angular-Produktionsbau. Fehlercodes
      direkt prüfen, niemals aus einer Log-Pipe ableiten. Pflichtprüfungen im PR
      vollständig abwarten; weitere lokale Komplettläufe nur bei neuem Anlass.
- [ ] **6. Gesamtstand prüfen:** Spezifikationsabdeckung, Quellvertrauen, Sperrreihenfolge,
      Centabgleich, Kostenbestätigung, Konto-/Workspace-Isolation und manuellen Verkauf
      über den ganzen Branch prüfen. Bei gewählter direkter Umsetzung einen unabhängigen
      Gesamtprüfer einsetzen; bei Einzelschritt-Assistenten deren zusätzliche Prüfungen
      erhalten. Befunde beheben und gezielt neu prüfen.
- [ ] **7. Dokumentieren und committen:** Nur tatsächlich ausgeführte Prüfungen und
      Grenzen, insbesondere offener echter Zwei-Nutzer-Test, festhalten. Commit:
      `test(core): verify eBay import isolation and duplicate protection`.
- [ ] **8. Abschlussfrage stellen:** Erst nach konkretem geprüftem Ergebnis exakt
      „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“.
      Nach Zustimmung Push, deutscher PR, erfolgreiche Pflichtchecks, Merge-Commit
      und eigener Branch-/Worktree-Cleanup. Keine öffentliche Beta-Ankündigung ohne
      Anlass nach `docs/public-beta-updates.md`.

## Selbstprüfung und Ausführung

Alle Bereiche der freigegebenen Spezifikation sind einer Aufgabe zugeordnet:
Quellvertrag/Beträge 1, Persistenz/Rechte/Lebenszyklus 2, erneute Prüfung 3,
Zuordnung 4, gemeinsame Erfassung 5, Nutzerablauf/Fehler 6, unabhängige Nachweise 7.
Die fünf Review-Fokusfälle besitzen konkrete Tests in ihren zuständigen Aufgaben.
Ergebniszustände `saved`, `review_changed` und `outcome_unknown` haben unterschiedliche
Form-/Navigationsfolgen; keine Aufgabe darf sie zu einem allgemeinen Erfolg reduzieren.

Die Aufgaben bauen auf gemeinsamen Verträgen auf und werden in dieser Reihenfolge
bearbeitet. Empfohlen ist direkte Umsetzung in dieser Sitzung mit unabhängiger
Gesamtprüfung vor dem Abschluss. Alternativ kann jede Aufgabe durch einen eigenen
Assistenten umgesetzt und vor dem nächsten Schritt separat geprüft werden.
Der Nutzer prüft zuerst diesen Plan und entscheidet die Ausführungsmethode.

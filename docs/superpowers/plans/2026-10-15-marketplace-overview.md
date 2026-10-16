# Marktplatzübersicht: Umsetzungsplan A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Alternativ nach Nutzerwahl superpowers:subagent-driven-development. Steps use checkbox (- [x]) syntax for tracking.

**Goal:** Eine gemeinsame, zugängliche Übersicht mit vorhandenen Accounts und
Inseraten liefern, ohne bestehende Marktplatzabläufe zu verändern.

**Architecture:** Ein seitenlokaler Signal-Store hält Abschnitte unabhängig.
Ein Lesedienst vereinheitlicht vorhandene Vinted-/eBay-Dienste und später den
Kleinanzeigen-Adapter. Einstellungen sind persönlich je Workspace gespeichert.

**Tech Stack:** Bestehendes Angular 22, Tailwind, Supabase, Vitest und Playwright.

**Spec:** [Spezifikation](../specs/2026-10-15-marketplace-overview-transfer-design.md).

## Umsetzungsstand

Paket A lokal umgesetzt und geprüft (16.10.2026). Abweichungen zum ursprünglichen
Testzuschnitt: Komponentenverhalten in Browser-Integrationstests statt zusätzlicher
JIT-Komponentenfixtures; zusätzlicher Vinted-Lesepfad für echte externe IDs und
Filter über die gesamte gespeicherte Quelle; Kontextanbindung der persönlichen
Einstellungen in einem eigenen Core-Service. Vorhandene Berechtigungen bleiben
verbindlich. Abschließendes Review und Integrationsfreigabe werden separat erfasst.

## Global Constraints

Alle verbindlichen Entscheidungen der Spezifikation gelten.
Keine neuen Abhängigkeiten; keine Browser-Schreibaktion in diesem Paket.
Vinted-Rechte bleiben unverändert. Neue Standard-Seitengröße 25, maximal 100.
Kein unbekannter Wert wird als null Euro oder null Inserate angezeigt.
Vor Ausführung aktuellen origin/master und docs/AI-CHANGELOG.md prüfen;
eigenen juna/-Zweig über den Worktree-Ablauf anlegen.

## Review Focus

- Anmeldung/Workspacewechsel während Einstellungsabruf: A1 verwirft alte Antworten.
- Fremde Vinted-Rechte: A2 ruft keinen geschützten Lesepfad ohne Freigabe auf.
- Fehler einer Plattform: A3 erhält die übrigen Abschnitte und deren Auswahl.
- Seitenwechsel bei ausgewählten Inseraten: A3 leert nur die betroffene Auswahl.
- Bestehender Sidebar-Kontext: A4 prüft Rückkehr aus Vinted/eBay zur Übersicht.

## Dateigrenzen

Core: MarketplaceSettingsService bleibt einziger Einstieg für Aktivierung.
Feature: MarketplaceOverviewService liest, MarketplaceOverviewStore hält Zustand,
MarketplaceOverviewComponent setzt die Seite zusammen,
MarketplaceListingSectionComponent zeigt genau einen Accountabschnitt.
Modellfunktionen sind rein. Keine Datenabfragen in Shared-Komponenten.

### Task 1: Persönliche Sichtbarkeit sicher speichern

**Files:** Ändern: src/app/core/services/marketplace-settings.service.ts und
dessen bestehende marketplace-settings.service.dom.spec.ts sowie neue marketplace-settings.service.angular.spec.ts; src/app/features/settings/pages/marketplaces-settings/
marketplaces-settings.component.ts und .html.
Neu: supabase/schemas/480_marketplace_overview.sql,
supabase/tests/marketplace-overview-settings.test.sql.
Ändern: supabase/config.toml und generierte src/app/core/models/supabase.types.ts.

**Interfaces:** Bestehende settings/isVintedEnabled/isEbayEnabled/
isKleinanzeigenEnabled/activeCount bleiben. Neu:
load(userId: string, workspaceId: string): Promise<void>;
setMarketplaceEnabled(id: MarketplaceId, enabled: boolean): Promise<void>.
UI wartet bei Speichern; bei Fehler wird der bestätigte Zustand wiederhergestellt.

- [x] Tests ergänzen: Nutzer A in Workspace 1 darf weder Werte von Nutzer B noch
      Workspace 2 lesen oder ändern; anon ist gesperrt. Serverwert gewinnt gegen
      Browserwert. Wechsel während load übernimmt keine verspätete Antwort.
      Fehlgeschlagenes Speichern lässt Sidebar und Einstellungen übereinstimmen.
- [x] Rotlauf: npm run test:angular -- src/app/core/services/marketplace-settings.service.angular.spec.ts.
      Bestehende DOM-Suite zusätzlich über npm run test:dom -- src/app/core/services/marketplace-settings.service.dom.spec.ts ausführen.
- [x] Tabelle public.marketplace_user_settings mit identity-id, user_id,
      workspace_id, vinted/ebay/kleinanzeigen und unique(user_id,workspace_id)
      definieren. Policies erlauben nur eigene Daten bei aktiver Mitgliedschaft.
      Aktuelle Defaults erhalten; ohne Serverdatensatz einmalige lokale Migration.
      Danach verwendete lokale Altwerte entfernen; keine erneute Übernahme in ein
      später angemeldetes Konto. Auth-/Workspacewechsel leert sofort lokalen State.
      Checkboxtext „In Marktplätze anzeigen“ und die Wirkung auf Sichtbarkeit nennen.
- [x] Neue Tests in src/app/core/services/marketplace-settings.service.angular.spec.ts
      grün ausführen; SQL mit npm run test:db -- supabase/tests/marketplace-overview-settings.test.sql.
      Vorher isolierte DB, registriertes Schema, erzeugte Migration und neue Typen.
- [x] Gezielte Dateien committen: feat(core): persist marketplace visibility per workspace.
      Keine Signatur; docs/AI-CHANGELOG.md mit tatsächlichen Prüfungen ergänzen.

### Task 2: Vorhandene Accounts und Inserate gemeinsam lesen

**Files:** Neu im Feature marketplaces:
models/marketplace-overview.models.ts, marketplace-overview-normalization.ts
und .spec.ts; services/marketplace-overview.service.ts und .angular.spec.ts.
Ändern: services/marketplace-api.service.ts nur falls gefilterte Leseseiten fehlen;
services/ebay-account-api.service.ts nur für nötige Leseparameter.
Neue Filter benötigen entsprechende Änderungen in supabase/functions/ebay-account/
und deren bestehenden handler-/connection-read-Tests.

**Interfaces:** Typen und loadAccounts/loadListings aus der Spezifikation.
normalizeVintedPublication(entry: MarketplaceEntry): MarketplaceOverviewListing;
normalizeEbayListing(scope: AccountScope, listing: EbayListing):
MarketplaceOverviewListing. opaque Cursor enthalten die Plattformseite und den
Query-Fingerprint; Queryänderung macht alte Cursor ungültig.

- [x] Reine Tests zuerst mit diesen Assertions schreiben:

```typescript
expect(normalizeEbayListing(scope, { ...ebayFixture, price: null }).priceCents).toBeNull();
expect(normalizeVintedPublication(vintedFixture).reference).toEqual({
  platform: 'vinted',
  workspaceId: scope.workspaceId,
  connectionId: scope.connectionId,
  externalId: vintedFixture.externalId,
});
```

Fixtures vollständig im neuen Test definieren; IDs aus der API unverändert.
Weitere Fälle: 12,34 EUR → 1234 Cent, unbekanntes Datum, identische externe ID
in zwei Accounts, übergroße Seitenanforderung und nicht unterstützte Aktion.

- [x] Rotlauf: npm run test:node -- src/app/features/marketplaces/models/marketplace-overview-normalization.spec.ts.
- [x] Vinted über bestehende Freigabeprüfung und listConnections/readAccountPreview/
      readPage anbinden. Zählung ohne bestätigte Aktivstatus-Vollständigkeit als
      unbekannt führen. eBay über loadStatus und loadListings anbinden; keine
      weiteren persönlichen Accounts erfinden. Kleinanzeigen zeigt vor Paket B
      „Kontoabgleich noch nicht verfügbar“ sowie den Einstieg in bestehende Entwürfe.
      read-only Fähigkeiten bestimmen Such-/Statusfilter: einen Filter nur anbieten,
      wenn der gesamte Suchraum server-/anbieterseitig gefiltert werden kann.
      Fehlende Anbieterfilter nicht durch einen Filter der geladenen Seite ersetzen.
- [x] Node-Test erneut grün; npm run test:angular -- src/app/features/marketplaces/services/marketplace-overview.service.angular.spec.ts.
      Servicefälle: keine Vinted-API für unberechtigten Nutzer, eBay bleibt verfügbar,
      bekannte Gesamtzahl wird nicht durch 25 geladene Zeilen ersetzt.
      Bei Backendänderung zusätzlich bestehende ebay-account/handler.test.ts und
      connection-read.test.ts mit den CI-Deno-Optionen ausführen.
- [x] Commit: feat(core): add unified marketplace listing reads.

### Task 3: Übersicht, Navigation und Auswahl liefern

**Files:** Neu unter features/marketplaces:
services/marketplace-overview.store.ts und .angular.spec.ts;
components/marketplace-overview/marketplace-overview.component.ts/.html/.angular.spec.ts;
components/marketplace-listing-section/marketplace-listing-section.component.ts/.html/.angular.spec.ts;
models/marketplace-listing-selection.ts und .spec.ts.
Ändern: marketplaces.routes.ts, core/config/workspace-navigation.ts und .spec.ts,
layout/sidebar/sidebar.component.ts und bestehende Tests.
Bestehende Shared-Bausteine und VintedListingAgeComponent verwenden.

**Interfaces:** Store provided auf der Seite, nicht global:
load(workspaceId: string): Promise<void>;
expand(account: MarketplaceOverviewAccount): Promise<void>;
setQuery(accountKey: string, query: MarketplaceListingQuery): Promise<void>;
toggleSelection(reference: MarketplaceListingReference, selected: boolean): void.
Readonly Signals für accounts, sections, loading und Fehler je Account.
AccountKey = JSON.stringify([platform,workspaceId,connectionId]).

- [x] Auswahltests zuerst: zwei Accounts mit gleicher externer ID sind getrennt;
      Seiten-/Filterwechsel leert die betroffene Auswahl; „Alle auf dieser Seite“
      verändert nur sichtbare Zeilen. Storetest verwirft Antworten aus altem Kontext
      und hält eBay sichtbar, wenn der Vintedabruf fehlschlägt.
- [x] Rotlauf der neuen Node-/Angular-Dateien über npm run test:node bzw.
      npm run test:angular -- mit den vollständigen oben genannten Dateipfaden.
- [x] /marketplaces leitet auf overview statt vinted; neue lazy Route
      /marketplaces/overview. Sidebar: Übersicht immer sichtbar, vorhandene
      Plattformreihenfolge und Vinted Feed erhalten. Kontextnavigation aus
      Vinted/eBay erhält einen normalen Link „Alle Marktplätze“.
      „Marktplätze verwalten“ verwendet denselben Settings-Service wie Einstellungen.
      Abschnitte laden erst beim Aufklappen. DataTableComponent, CustomCheckboxComponent,
      PageHeaderComponent, gemeinsame Buttons/Badges/Dialogs verwenden.
      Auswahlstatus sichtbar und zugänglich, keine funktionslosen Bulk-Aktionen.
      „Inserat erstellen“ bietet vorhandene Vinted-/Kleinanzeigen-Einstiege unter
      Berücksichtigung tatsächlicher Rechte; eBay-Neuanlegen nicht als fertig anbieten.
      Detail-/Bearbeitenaktionen navigieren mit korrektem Accountbezug.
- [x] Alle neuen Auswahl-/Store-/Komponententests grün und bestehende
      workspace-navigation.spec.ts, sidebar.component.angular.spec.ts,
      sidebar-ideas.angular.spec.ts sowie marketplaces-settings.component.angular.spec.ts
      ausführen. npm run build prüft die tatsächlichen Angular-Templates.
- [x] Commit: feat(ui): add central marketplace overview.

### Task 4: Bestehende Wege und neue Übersicht im Browser absichern

**Files:** Neu: e2e/marketplace-overview.spec.ts,
e2e/support/marketplace-overview-fixture.ts.
Ändern: scripts/playwright-pr-smoke.test.mjs; bei notwendiger Auswahl zusätzlich
playwright.pr.config.ts. Neue Fälle mit @core-smoke registrieren, nicht nur @pr-smoke.
Bestehende e2e/sidebar-navigation.spec.ts, settings-layout.spec.ts,
marketplace-accounts.spec.ts und listing-studio.spec.ts bleiben maßgeblich.

**Interfaces:** Fixture mockMarketplaceOverview(page: Page): Promise<void> stellt
zwei Vinted-Accounts, eine persönliche eBay-Verbindung, unbekannte Zählungen,
Teilfehler und Workspacewechsel bereit, ohne echte Marktplatzkonten anzusprechen.

- [x] Browserfälle schreiben: „Übersicht filtert Accounts und bewahrt fremde
      Abschnitte bei Fehlern“ und „Sichtbarkeit bleibt je Workspace erhalten“,
      jeweils 320/390/834/1440 px in Hell/Dunkel; Touch/Tastatur und AXE.
      Bestehende Kontextnavigation öffnen, zurück zur Übersicht, Auswahl löschen.
- [x] Neue Fälle vor Korrektur gezielt ausführen und beabsichtigten Fehler nachweisen.
      Ruhende isolierte Produktionsvorschau verwenden; passende Vorschaukonfiguration
      nach e2e/support/marketplace-preview.config.ts; dessen testMatch ausdrücklich um marketplace-overview.spec.ts ergänzen, keinen parallelen Build.
- [x] Pflichtfälle in scripts/playwright-pr-smoke.test.mjs ergänzen; tatsächliche
      Testtitel müssen exakt zu erzeugten Parametertiteln passen.
      Bei den vorhandenen Fällen mindestens Navigation, Einstellungen,
      Accountwechsel und mobiler Listing-Studio-Lebenszyklus ausführen.
- [x] node --test scripts/playwright-pr-smoke.test.mjs scripts/check-schema-registration.test.mjs;
      npm run test:audit; node scripts/check-admin-shared-ui.mjs;
      gezieltes ESLint/Prettier der geänderten Dateien; npm run typecheck;
      npm run build. Browserfälle gegen ruhende Vorschau grün; Befehle/Ergebnisse notieren.
- [x] Commit: test(ui): verify marketplace overview and navigation.
      Paket erst nach dem AGENTS.md-Abschlussverfahren pushen/integrieren.

## Abnahme

Alle aktivierten und berechtigten Plattformen sind zentral erreichbar;
unbekannte Zahlen bleiben unbekannt. Accounts und Auswahl vermischen sich nicht.
Alte Inserat-/Einstellungswege funktionieren. Kleinanzeigen-Abgleich und
Transfer werden noch nicht als fertig behauptet.

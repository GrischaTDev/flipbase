# Kleinanzeigen-Accounts und Inseratabgleich: Umsetzungsplan B

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Alternativ nach Nutzerwahl superpowers:subagent-driven-development. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Einen Kleinanzeigen-Account lokal eindeutig anbinden und dessen eigene
Inserate vollständig und wiederholbar in der zentralen Übersicht anzeigen.

**Architecture:** Getrennte Accountmetadaten, lokale Freigaben und Importläufe.
Die Extension liest im gebundenen Browserprofil; ein eigener Endpoint nimmt nur
streng geprüfte, accountgebundene Daten an. Bestehende Vinted-Verbindungen bleiben
technisch getrennt.

**Tech Stack:** Vorhandene Supabase Edge Functions/Postgres, Chrome Manifest V3,
Angular 22, Node-/Deno-/SQL-/Browser-Tests.

**Spec:** [Spezifikation](../specs/2026-10-15-marketplace-overview-transfer-design.md).

## Global Constraints

Paket A muss integriert sein; Beginn auf aktuellem origin/master.
Keine echte Veröffentlichung, Bearbeitung oder Löschung in diesem Paket.
Kein Secret oder Cookie im Frontend, in Diagnoseausgaben oder Browserfixtures.
Neue Tabellen mit RLS, Archivschutz und identity-id; IDs als Dezimalstrings.
Neue Schema-Datei 490_kleinanzeigen_accounts.sql nach 480 ausdrücklich registrieren.

## Review Focus

- Anbieterformular geändert: B1/B3 melden unsupported statt geratener Werte.
- Ein Browserprofil hat plötzlich Account B: B2/B3 verweigern Import für Account A.
- Widerruf während einer langen Pagination: B2/B3 akzeptieren keinen verspäteten Finish.
- Abbruch auf Seite 2 von 3: B3 bewahrt den bisherigen vollständigen Bestand.
- Fehlende Veröffentlichungszeit: B3 zeigt unbekannt statt Import-/Änderungszeit.

## Dateigrenzen

Neue Backendverträge: supabase/functions/_shared/kleinanzeigen-contracts.ts.
Neue Nutzer-API: supabase/functions/kleinanzeigen-account/{index,handler}.ts.
Neue Installations-API: supabase/functions/kleinanzeigen-local-extension/{index,handler}.ts.
Passende handler.test.ts jeweils im gleichen Ordner.
Feature-Modelle/-Dienste bleiben unter features/marketplaces.
Extension-Kontobindung und rein lesender Provideradapter werden getrennt gehalten.

### B1: Tatsächliche Kleinanzeigen-Verträge lesend sichern

**Files:** Neu: docs/research/2026-10-15-kleinanzeigen-provider-contract.md;
scripts/fixtures/kleinanzeigen-provider/identity.json, publications-page.json,
listing-form.html und processing-result.html.
Neu: tools/flipbase-extension/kleinanzeigen-provider-reader.js;
scripts/kleinanzeigen-provider-reader.test.mjs.
Fixtures enthalten ausschließlich synthetische oder nachweislich anonymisierte Werte.

**Interfaces:** Klassisches Skript, globalThis.FlipbaseKleinanzeigenReader:
parseIdentity(input: unknown): KleinanzeigenIdentity | null;
parsePublicationPage(input: unknown): KleinanzeigenProviderPage;
readFormSchema(doc: Document): KleinanzeigenProviderSchema | null.
Typen in _shared/kleinanzeigen-contracts.ts:
Identity { externalAccountId: string; displayName: string };
ProviderPage { items; nextCursor: string | null; complete: boolean };
ProviderSchema { revision: string; categoryId: string; fields; imageRules; feeState }.
fields enthalten Typ, Optionen, erforderlichen Zustand und Ziellimits;
keine vom Frontend ausführbaren Selektoren oder Skripte.

- [ ] Offizielle Quellen und vorhandenes Kleinanzeigen-Formular lesend prüfen.
      Angemeldete eigene Account-/Inseratdaten nur verwenden, wenn tatsächlich
      verfügbar und der Nutzer diesen Zugriff autorisiert hat. Ohne solchen Zugang
      keinen erfolgreichen Live-Nachweis erfinden; fehlende Identitäts-/Pagination-
      Belege im Bericht als konkrete Voraussetzung vor B2/B3 aufführen.
- [ ] Synthetische Fixtures und Tests schreiben:
      parseIdentity({}) === null; fehlende Pflichtfeldbeschreibung ergibt
      readFormSchema(...) === null. Preis-/Versand-/Kategoriewerte ausschließlich
      aus gemessenen Formularoptionen; unbekannte Werte werden nicht geraten.
      Erfolgsfixtures unterscheiden konkrete Ziel-ID, processing und aktive Anzeige.
- [ ] node --test scripts/kleinanzeigen-provider-reader.test.mjs rot ausführen;
      Parser implementieren, erneut grün. Auch Loginseite statt Inseratliste,
      wiederholter Cursor, fremde Account-ID und fehlende Datumsquelle prüfen.
- [ ] Bericht mit Herkunft, Datum, geprüften Seiten, tatsächlichen Selektoren/
      Leseformaten und deren Grenzen fertigstellen. Bestehende interne Grenzen
      65/4000 ausdrücklich bestätigen oder deren nötige Anpassung dokumentieren.
      Kein Live-Submit für diese Recherche. Nur wenn Identität, vollständige
      Pagination und lesbarer Formularvertrag belegt sind, B2/B3 beginnen.
- [ ] Commit: test(core): capture verified Kleinanzeigen provider contracts.

### B2: Kontobindung und Freigabe getrennt von Vinted speichern

**Files:** Neu: supabase/schemas/490_kleinanzeigen_accounts.sql;
supabase/tests/kleinanzeigen-accounts.test.sql;
supabase/functions/_shared/kleinanzeigen-contracts.ts und .test.ts;
die oben genannten neuen Edge-Function-Ordner.
Neu: tools/flipbase-extension/kleinanzeigen-local-core.js und
kleinanzeigen-local-background.js; scripts/kleinanzeigen-local-account.test.mjs.
Ändern: tools/flipbase-extension/background.js, flipbase-bridge.js, manifest.json;
supabase/config.toml, .github/workflows/ci.yml, package.json und generierte Typen.

**Interfaces:** KleinanzeigenAccountService und ConnectRequest aus Spezifikation.
Neue Extension-Bridge-Typen:
FLIPBASE_KLEINANZEIGEN_PREPARE_ACCOUNT, FLIPBASE_KLEINANZEIGEN_CONNECT,
FLIPBASE_KLEINANZEIGEN_STATUS, FLIPBASE_KLEINANZEIGEN_DISCONNECT.
Antwort mit requestId und success/result oder errorCode; Request-ID immer zuordnen.
Extension status meldet kleinanzeigenCapabilities explizit; reine Versionsnummer
oder vorhandenes Vinted-Postfach bestätigt keine Kleinanzeigen-Bereitschaft.

- [ ] SQL-/Handler-/Extensiontests schreiben: keine Daten fremder Workspaces;
      Bindung benötigt Nutzer und aktive Mitgliedschaft; derselbe externe Account
      wird nicht unbemerkt an ein zweites Profil gebunden. Widerruf erhöht Generation;
      altes Secret bleibt gesperrt. KA-Disconnect verändert keine Vinted-Installation.
      Browserseite erhält nur Bindungsbestätigung/öffentlichen Status, nie Secret.
- [ ] Rotlauf: node --test scripts/kleinanzeigen-local-account.test.mjs;
      deno test --no-config --node-modules-dir=none --allow-env
      supabase/functions/kleinanzeigen-account/handler.test.ts
      supabase/functions/kleinanzeigen-local-extension/handler.test.ts.
- [ ] Tabellen kleinanzeigen_connections und kleinanzeigen_local_grants definieren.
      Verbindungen eindeutig je Workspace/externer Identität, neue API gibt die
      öffentlichen Daten mit Scope zurück. Rohsecret nur im Extension-Hintergrund;
      Server speichert Hash, Nutzer, Account, Installation, Generation, Ablauf,
      Widerruf und erlaubte Aktionen. Keine pauschale Veröffentlichungsfreigabe
      aus einer bloßen Lesebindung ableiten.
      User-Endpoint mit JWT und Mitgliedschaft, Installations-Endpoint mit
      beschränktem Bearer-Secret und strikt getrennten Aktionsrechten.
      Origin-/Sender-/Topframe-Prüfung für App und Anbieter, begrenzte Nutzlasten,
      fest erlaubter Serverhost. Jedes Ergebnis erneut gegen Scope prüfen.
- [ ] Schema registrieren, Migration accounts erzeugen/prüfen, Typen regenerieren.
      npm run test:db -- supabase/tests/kleinanzeigen-accounts.test.sql grün.
      Obige Tests plus node --test scripts/local-extension-runtime.test.mjs
      scripts/local-extension-listings.test.mjs scripts/account-modal.test.mjs grün.
      Deno-Checks/Tests beider neuer Endpoints explizit in ci.yml aufnehmen;
      Node-Tests in test:workflow aufnehmen; Registrierungsprüfungen ausführen.
- [ ] Commit: feat(core): connect local Kleinanzeigen accounts.

### B3: Vollständigen Abgleich atomar übernehmen

**Files:** Erweitern: 490_kleinanzeigen_accounts.sql, beide neue Handler und Verträge;
tools/flipbase-extension/kleinanzeigen-provider-reader.js und
kleinanzeigen-local-background.js.
Neu: tools/flipbase-extension/kleinanzeigen-local-content.js;
supabase/tests/kleinanzeigen-sync.test.sql;
scripts/kleinanzeigen-local-sync.test.mjs;
supabase/functions/kleinanzeigen-local-extension/sync-handler.test.ts.
Neu: supabase/test-support/kleinanzeigen-sync-concurrency.mjs.

**Interfaces:** Nutzeraktion sync_request liefert eine SyncRun-ID.
Installationsaktionen sync_claim, sync_page und sync_finish verwenden
runId, claimToken, grantGeneration und die geprüfte externe Identität.
SyncRun.state = queued | reading | confirmed | failed | cancelled.
Jede Seite trägt requestId, pageCursor und nextCursor.
finish akzeptiert nur eine geschlossene, widerspruchsfreie Cursorfolge samt
erfolgreichem Identitätsabgleich am Ende.

- [ ] Regressionen zuerst: vollständiger Altbestand A/B/C, Seite 1 liefert A,
      Seite 2 scheitert → B/C bleiben vorhanden. Neuer vollständiger Lauf A/B
      kennzeichnet C als unavailable, ausdrücklich nicht sold.
      Duplicate-Seite zählt nicht doppelt; veralteter Lauf überschreibt keine
      neuere bestätigte Lesekopie; publishedAt bleibt bei fehlender Quelle null.
- [ ] Rotlauf: node --test scripts/kleinanzeigen-local-sync.test.mjs und
      Deno-Test sync-handler.test.ts mit den obigen CI-Optionen.
- [ ] Tabellen kleinanzeigen_sync_runs, kleinanzeigen_sync_entries und
      kleinanzeigen_publications ergänzen. Unbestätigte Seiten nur im Run-Staging
      speichern; Importabschluss überträgt Snapshot und Abwesenheiten atomar.
      Eine aktive Importlease je Account; Trigger/Policies schützen Scope und Archiv.
      Vor/zwischen/nach Pagination aktuelle Identität/Freigabe prüfen.
      Wiederaufnahme verwendet bestätigte Cursor; eine Loginseite ist kein
      vollständiger leerer Account. Lesekopie enthält Rohstatus und die vereinheitlichten
      Anzeigenzustände samt ausschließlich belegtem publishedAt.
- [ ] SQL-Tests grün sowie echte Zwei-Sitzungs-Konkurrenzprüfung im isolierten
      Postgres über kleinanzeigen-sync-concurrency.mjs. Skript in CI-Datenbankjob
      nach Schemaeinrichtung registrieren. Mit zwei gleichzeitig abgeschlossenen
      Läufen beweisen, dass kein veralteter Stand gewinnt.
      Migration sync erzeugen und Typen regenerieren; Registrierungsprüfungen grün.
- [ ] Commit: feat(core): synchronize Kleinanzeigen publications safely.

### B4: Accounts und Abgleich sichtbar bedienen

**Files:** Neu unter features/marketplaces:
services/kleinanzeigen-account.service.ts und .angular.spec.ts;
models/kleinanzeigen-response.ts und .spec.ts;
components/kleinanzeigen-accounts/kleinanzeigen-accounts.component.ts/.html/.angular.spec.ts.
Ändern: components/kleinanzeigen-workspace/kleinanzeigen-workspace.component.ts/.html,
services/marketplace-overview.service.ts und dessen Tests, marketplaces.routes.ts.
Neu: e2e/kleinanzeigen-accounts.spec.ts und passende Supportfixture.
Ändern: scripts/playwright-pr-smoke.test.mjs, README der Extension.

**Interfaces:** AccountService-Signaturen der Spezifikation; OverviewService
delegiert für platform=kleinanzeigen an readPage. Connect-/Sync-Dialog hat eindeutige
Kontoidentität, getrennte Aktionen für Prüfen, Synchronisieren, Pausieren/Trennen.
Bestehende Entwürfe bleiben über /listings erreichbar.

- [ ] Tests schreiben: zwei Accounts werden getrennt gezeigt, Accountwechsel im
      Browser verlangt richtige Sitzung, Extension ohne KA-Fähigkeit führt zur
      Einrichtung. Fehler eines Abgleichs lässt alten Datenstand sichtbar.
      Leerer vollständiger Bestand zeigt 0; unvollständiger Bestand bleibt als
      unvollständig gekennzeichnet.
- [ ] Neue Response-/Service-/Komponententests über Node-/Angular-Suite rot ausführen.
- [ ] Gemeinsame UI-Bausteine und vorhandene Seitennavigation verwenden. Import ist
      manuell auslösbar, Fortschritt und letzter vollständiger Abgleich werden
      getrennt angezeigt. Übersicht lädt keine Synchronisierung ungefragt.
      Den bisherigen Kleinanzeigen-Hinweistext durch tatsächliche Accountdaten,
      Inserate und vorhandene Entwurfsverwaltung ersetzen.
- [ ] Neue Suites und bestehende marketplace-overview.service.angular.spec.ts grün.
      Browserfälle @core-smoke bei 390/1440 px, ergänzend Überlauf/AXE bei 320/834 px,
      beide Themes, Touch und Tastatur. Bestehende marketplace-accounts.spec.ts,
      settings-layout.spec.ts und listing-studio.spec.ts gezielt mitprüfen.
      Alle neuen Node-/Deno-/SQL-/Browserfälle in tatsächlichen CI-Listen registrieren.
      Formatierung, Lint, typecheck, build, test:audit, Schema-/Smoke-Auswahlaudit grün.
- [ ] Commit: feat(ui): manage Kleinanzeigen accounts and listing sync.

## Abnahme

Ein nachweislich gebundener Kleinanzeigen-Account erscheint mit seinem
vollständig bestätigten Inseratbestand. Abbrüche löschen keine Anzeigen.
Mehrere Profile/Accounts vermischen keine Daten. Vinted-Verbindungen und bisherige
Kleinanzeigen-Entwürfe funktionieren weiter. Paket B veröffentlicht keine Anzeige.

## Explizite Testregistrierung

e2e/kleinanzeigen-accounts.spec.ts in der festen testMatch-Liste von
e2e/support/marketplace-preview.config.ts ergänzen.
Die konkrete Deno-Liste in .github/workflows/ci.yml muss zusätzlich den
_shared/kleinanzeigen-contracts.test.ts und sync-handler.test.ts enthalten;
ein Testdateiname allein aktiviert diese CI-Auswahl nicht.

## Ergänzung zu B1/B4: Privataccounts als erste Abnahme

Die [Privatkonto-Recherche](../../research/2026-10-15-kleinanzeigen-private-listing-quota.md)
ist zusätzliche Eingabe für B1. Anbieterprüfung und B4-Abnahme zuerst mit einem
Standard-Privataccount ohne PRO durchführen. Kontotyp und PRO getrennt darstellen.
Kann das Konto seinen offiziellen Kontingentstand lesend liefern, diesen mit
Abfragezeit übernehmen; fehlt ein belegbarer Stand, bleibt er unbekannt.
Ein eigener Zähler aus aktiven Inseraten wird nicht als Restkontingent ausgegeben.
Tests für privat ohne PRO und gewerblich ohne PRO unterscheiden die Kontotypen.

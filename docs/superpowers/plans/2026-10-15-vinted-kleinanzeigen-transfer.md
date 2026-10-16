# Vinted → Kleinanzeigen: Umsetzungsplan C

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Alternativ nach Nutzerwahl superpowers:subagent-driven-development. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ein eigenes Vinted-Inserat in Flipbase als Kleinanzeigen-Fassung prüfen,
veröffentlichen und mit bestätigter Ziel-ID in der Übersicht wiederfinden.

**Architecture:** Bestehende Kleinanzeigen-Entwürfe und Bildspeicherung erweitern.
Eine einzige Transferaktion bereitet die Zielfassung vor; ein dauerhafter Auftrag
steuert die Extension. Vinted-Original, Zielfassung und Ausführung bleiben getrennt.

**Tech Stack:** Vorhandenes Angular 22, Supabase/Postgres/Storage, Deno, Chrome MV3,
Node-/SQL-/Vitest-/Playwright-Tests. Keine neuen Pakete.

**Spec:** [Spezifikation](../specs/2026-10-15-marketplace-overview-transfer-design.md).

## Global Constraints

A und B integriert; neuen Zweig auf aktuellem origin/master beginnen.
Ziel zunächst genau ein Vinted-Inserat zu einem Kleinanzeigen-Account.
Kein Relisting, keine Bulk-Ausführung, kein automatisches eBay-Neuanlegen.
65/4000 sind bestehende interne Entwurfsgrenzen, keine unbesehen gültigen
Anbieterwerte; der Bericht aus B1 ist vor Formular-/Submitcode maßgeblich.
„Veröffentlicht“ verlangt Ziel-ID, passenden Account, active und verifiedAt.
Bei Gebühren oder unklarer Ausführung kein weiterer verbindlicher Klick.
Sichtbarkeitsschalter sind keine Änderung einer laufenden Auftragsfreigabe.

## Review Focus

- Kein Lagerartikel zur Quelle vorhanden: C1 erhält einen eigenständigen Zielentwurf.
- Quelltext überschreitet Ziellimit: C2/C3 erhalten den gesamten Text und Feldfehler.
- Signiertes Foto abgelaufen oder falscher MIME-Typ: C2 blockiert Bereitschaft.
- Accountwechsel/Versionskonflikt kurz vor Submit: C4/C5 stoppen vor dem Klick.
- Neustart nach Klick oder Anbieterstatus processing: C4–C6 gleichen nur lesend ab.

## Dateigrenzen

Weiterhin ein Entwurfssystem: features/listings und public.listings/listing_images.
Plattformübergreifende Auswahl/Dialog unter features/marketplaces.
Browserreader aus B1 liest; neuer kleinanzeigen-listing-runtime.js führt aus;
autofill-core.js bleibt allein für die Feldsetzung verantwortlich.
Neue Auftrags-RPCs/Endpointmodule sind Kleinanzeigen-spezifisch und öffnen keine
bestehenden Vinted-Ausführungsrechte.

### C1: Vorhandene Entwürfe um Quell-/Zielbezug und Revision erweitern

**Files:** Neu: supabase/schemas/500_kleinanzeigen_drafts.sql;
supabase/tests/kleinanzeigen-transfer-drafts.test.sql;
supabase/functions/_shared/kleinanzeigen-listing-contracts.ts und .test.ts.
Ändern: features/listings/models/listing.models.ts,
services/listing.service.ts und .angular.spec.ts,
pages/listing-editor/listing-editor.component.ts/.html und bestehende Tests,
pages/listing-overview/listing-overview.component.ts/.html und bestehende Tests,
services/listing-images.service.ts nur an itemabhängigen Stellen.
Jeweils vollständiger Präfix src/app/. Config und generierte Typen aktualisieren.

**Interfaces:** KleinanzeigenDraftContent, KleinanzeigenDraft aus Spezifikation.
Bestehende Listing-IDs bleiben UUID-Strings. ListingRow.item:
ListingEditorItem | null. Neue RPCs:
kleinanzeigen_create_transfer_draft(p_workspace_id uuid, p_target_connection_id bigint,
p_source_reference jsonb, p_content jsonb, p_request_id uuid) returns jsonb;
kleinanzeigen_update_draft(p_id uuid, p_expected_revision bigint, p_content jsonb)
returns jsonb. Bestehendes prepare_listing bleibt kompatibel.

- [ ] SQL- und Anwendungstests schreiben: source-only-Entwurf bei gültigem
      Quell-/Zielbezug möglich, bei frei erfundener Quelle abgelehnt.
      Vorhandene Artikel-/Katalogentwürfe behalten IDs, Bilder und Status.
      Zwei Updates mit derselben Revision: genau eines gewinnt; fremder Workspace
      und archivierter Workspace werden abgelehnt.
- [ ] Rotlauf der neuen Vertragstests und betroffenen listing.service-/Editor-Tests;
      SQL-Test auf isolierter DB gegen den Stand vor der neuen Migration rot.
- [ ] In der neuen deklarativen Datei Spalten laut Spezifikation am Tabellenende
      ergänzen, bestehenden Ziel-Constraint für verifizierte Quelle erweitern.
      Quellbezug und Zielkonto nur per geprüfter RPC setzen; direkte neue
      Schreibgrants vermeiden. Indizes für Zielkonto, Quellreferenz und Request-ID.
      Bestehende Eindeutigkeit offener Lager-/Katalogentwürfe erhalten; Source-only
      per Quellfingerprint/Zielaccount gegen doppelte Vorbereitung sichern.
      Editor-/Overview-/Bildcode systematisch auf die bislang erforderliche
      row.item-Zuordnung prüfen. Neue Titel-/Fotoansicht aus dem Entwurf ableiten,
      ohne künstlichen Lagerartikel. Alte /listings-Links erhalten.
- [ ] Migration erzeugen/prüfen, Typen generieren; SQL-Test und vorhandene
      supabase/tests/listings.test.sql und listing_images.test.sql grün.
      Bestehende ListingService-, ListingImagesService-, Editor- und Overviewtests
      sowie npx vitest run --project=node für geänderte Listingmodelle grün.
      npm run typecheck und npm run build für alle nullable-Templatepfade.
- [ ] Commit: feat(core): support account-bound listing transfer drafts.

### C2: Vollständige Quelle und gesicherte Bilder übernehmen

**Files:** Neu unter features/marketplaces:
models/kleinanzeigen-transfer-mapping.ts und .spec.ts;
services/listing-transfer.service.ts und .angular.spec.ts.
Neu Backend: supabase/functions/kleinanzeigen-account/transfer-source.ts,
transfer-source.test.ts, transfer-draft.ts und transfer-draft.test.ts.
Ändern: kleinanzeigen-account/handler.ts; zugehöriger JWT-Handler-Test.
Neu: services/marketplace-worker/test/vinted-transfer-source.test.ts;
services/marketplace-worker/src/vinted-transfer-source.ts, nur wenn die bestehende
Content-Leseantwort noch kein vollständiges normalisiertes Quellenmodell liefert.
Den bestehenden Inhaltspfad im marketplace-browser-http-api.ts dafür erweitern,
keinen zweiten Browser-/Loginablauf einführen.
Zusätzlich ändern: tools/flipbase-extension/vinted-local-core.js,
vinted-local-background.js, vinted-local-content.js;
supabase/functions/_shared/marketplace-local-extension-contracts.ts und
marketplace-local-extension/handler.ts einschließlich Tests.
Neu: scripts/vinted-transfer-source.test.mjs und
supabase/functions/marketplace-local-extension/source-details.test.ts.
Dies ergänzt ausschließlich den Quellen-Leseweg für lokale Vinted-Accounts.

**Interfaces:** ListingTransferService.prepare/save laut Spezifikation.
Backendfunktion:
readVintedTransferSource(scope: AccountScope, entryId: string, accessToken: string):
Promise<VintedTransferSource>.
Der Source-Loader wählt anhand executionMode den bestehenden Cloud-Inhaltspfad oder den lokalen source_details-Import; vollständige geprüfte Cache-Angaben benötigen keinen neuen Browserabruf. VintedTransferSource enthält reference, title, description, priceCents,
currency, photoReferences und beschriftete attributeHints.
Sie nutzt den vorhandenen authentifizierten
/marketplace-browser/listings/content/read-Pfad einschließlich Rechte- und
Accountprüfung; falls ein normalisierender Adapter nötig ist, bleibt dieser
read-only im bestehenden Worker. Nutzer-Token nicht loggen oder dauerhaft speichern.
Mapping:
mapVintedToKleinanzeigen(source: VintedTransferSource,
defaults: KleinanzeigenAccountDefaults): KleinanzeigenTransferPreview.
Defaults = postalCode, shippingType, priceType; keine geratenen Kosten.

- [ ] Reine Tests zuerst: Titel mit 66 Zeichen bleibt unverändert, Warnung
      title_too_long statt Kürzung; kein EUR-Preis → Preis leer/Prüfung nötig.
      Vinted-Kategorie-ID erscheint niemals als ZielcategoryId.
      Fehlender Zustand bleibt Hinweis und wird nicht zu einem erfundenen Enum.
      Quellobjekt ist nach Mapping unverändert.
- [ ] Rotlauf: npm run test:node -- src/app/features/marketplaces/models/kleinanzeigen-transfer-mapping.spec.ts.
      Deno-Tests transfer-source.test.ts und transfer-draft.test.ts mit CI-Optionen.
- [ ] Vollständige Beschreibung/Fotos über bestehenden autorisierten Vinted-Leseweg
      laden. Server bestätigt Quell- und Zielzugriff und berechnet Fingerprint aus
      normalisierter Quelle; Browserangaben allein sind kein Eigentumsnachweis.
      Lokale Vinted-Installation: neue nur lesende source_details-Aktion benötigt entryId, externalId und vollständige Quelldetails; der Server bestätigt Mitgliedschaft, bestehende Vinted-Rechte, Bindung, Generation und Zuordnung zum eigenen Inserat. Source-Reader prüft Identität vor/nach Detailabruf. Eine offline Quelle mit unvollständigem Cache führt zu einer verständlichen fehlenden Voraussetzung, nicht zu erfundenem Text. Dafür keine Vinted-Veröffentlichungsclients anschließen.
      Vinted-Zustands-/Maß-/Markenhinweise bleiben explizit sichtbar und bearbeitbar;
      keine automatische Beschreibungserweiterung ohne sichtbare Vorschau.
      Basistitel/-preis/-text müssen vor persistiertem Speichern gültig sein.
      Bilder nach Anlegen der Entwurfs-ID in den bestehenden privaten Listingpfad
      kopieren. Nur verifizierte Anbieterhosts, keine freien URLs, keine ungeprüften
      Redirects, MIME-/Dateisignatur-/Größenprüfung nach B1.
      Bildübernahme separat als unvollständig markieren, bis sämtliche Bilder
      samt Reihenfolge gesichert sind. Teilübernahme ist kein bereitstellbarer Auftrag.
- [ ] Mapping-/Service-/Deno-Tests grün; neue source_details-Tests sowie bestehende lokale Importtests ausführen. Gleiche vollständige Quelle muss lokal und über Cloud denselben Mapping-Input liefern; fremde Identität und fehlende Lesefreigabe werden abgelehnt. Zusätzlich abgelaufene Quelle, Loginfehler,
      Source-only, fehlendes Bild, Redirect auf lokalen Host und Wiederholung derselben
      Request-ID prüfen. Falls Worker betroffen, vorhandene
      vinted-listing-current-content.test.ts und vinted-listing-photo-transfer.test.ts
      sowie neuer vinted-transfer-source.test.ts laufen.
      Neue Workerdatei im bestehenden npm-Testglob überprüfen.
- [ ] Commit: feat(core): prepare Vinted to Kleinanzeigen transfers.

### C3: Zielaccount und Kleinanzeigen-Formular gemeinsam prüfen

**Files:** Neu unter features/marketplaces:
components/listing-transfer-dialog/listing-transfer-dialog.component.ts/.html/.angular.spec.ts;
components/kleinanzeigen-listing-fields/kleinanzeigen-listing-fields.component.ts/.html/.angular.spec.ts;
services/kleinanzeigen-form-schema.service.ts und .angular.spec.ts.
Ändern: marketplace-listing-section und vinted-listings sowie
vinted-listing-detail mit ihren bestehenden HTML-/Angular-Tests.
Ändern: features/listings/pages/listing-editor als vollständiger Zieleinstieg.
Neu Backendmodule: kleinanzeigen-account/form-schema.ts und .test.ts.

**Interfaces:** Dialoginputs source: MarketplaceListingReference,
targetConnectionId: string | null; output saved: KleinanzeigenDraft.
KleinanzeigenFormSchemaService.load(scope: AccountScope, categoryId: string):
Promise<KleinanzeigenProviderSchema>. Schema kommt über den gebundenen
Extension-Lesepfad aus B1/B2, nicht aus geratenen statischen Kategorie-IDs.
Ein Request erhält requestId und beendet sich bei nicht erreichbarem Profil
mit needs_login/unavailable, statt unbegrenzt zu warten.

- [ ] Komponententests zuerst: „Inserieren auf …“ bietet nur erlaubte Ziele;
      nur Kleinanzeigen ist im ersten Transferweg ausführbar.
      Account ist sichtbar und ausdrücklich gewählt. Langer Titel kann vollständig
      korrigiert werden. Kategorieänderung entfernt nur ungültige abhängige Felder,
      erhält Titel/Text/Preis/Fotos und lädt neue Pflichtfelder.
- [ ] Neue Angular-Tests rot; danach bestehenden Shared-Dialog und Formularfelder
      mit Reactive Forms zusammensetzen. Übernahmewarnungen stehen am Feld oder
      in einer kompakten Liste. „Entwurf speichern“ und „Inserieren“ sind getrennt.
      Speichern ohne Zielkategorie erlaubt, Inserieren erst mit vollständigem
      aktuellen Schema und gesicherten Bildern. Dialogabbruch bei ungespeicherten
      Änderungen abfragen; bestehender Guard auf vollständiger Editorseite.
- [ ] Übersicht, Vinted-Liste und Detailseite rufen denselben Transferdienst/Dialog
      auf. Keine separate Kopierlogik in diesen drei Einstiegen.
      Nach Speichern führt „Vollständig bearbeiten“ auf /listings/<bestehende UUID>.
      Kein zweites Kleinanzeigen-Entwurfssystem oder doppeltes Preisfeld.
- [ ] Neue Tests plus bestehende vinted-listings.component.angular.spec.ts,
      vinted-listing-detail.component.angular.spec.ts und Listing-Editor-Tests grün.
      form-schema.test.ts mit ungültigem Account, veralteter Schemaantwort und
      Schemafehler ausführen; npm run build.
- [ ] Commit: feat(ui): review platform-specific listing transfers.

### C4: Dauerhafte, doppelsichere Veröffentlichungsaufträge bereitstellen

**Files:** Neu: supabase/schemas/510_kleinanzeigen_publication_jobs.sql und
511_kleinanzeigen_job_execution.sql;
supabase/tests/kleinanzeigen-publication-jobs.test.sql und
kleinanzeigen-publication-execution.test.sql;
supabase/test-support/kleinanzeigen-publication-concurrency.mjs.
Neu: features/marketplaces/services/kleinanzeigen-listing-job.service.ts
und .angular.spec.ts; models/kleinanzeigen-listing-job.ts und .spec.ts.
Backend: kleinanzeigen-account/listing-jobs.ts/.test.ts;
kleinanzeigen-local-extension/listing-handler.ts/.test.ts und listing-photo.ts/.test.ts.
Config, CI-Registrierung und generierte Typen erweitern.

**Interfaces:** enqueue/load/reconcile aus der Spezifikation.
User-API: listing_enqueue, listing_status, listing_reconcile.
Installations-API: job_claim, job_check, job_begin, job_finish, job_photo.
Scope, claimToken, grantGeneration und Versionsnummer werden überall geprüft.
Public SQL-Funktionen kleinanzeigen_enqueue_listing,
kleinanzeigen_claim_listing, kleinanzeigen_begin_listing,
kleinanzeigen_finish_listing, kleinanzeigen_reconcile_listing;
die vollständigen Eingaben entsprechen jeweils diesen Requestverträgen,
Rückgabe jsonb. Client ruft ausschließlich den geprüften API-Adapter auf.

- [ ] SQL-/Handlerfälle zuerst: doppelte requestId liefert denselben Job; geänderte
      Nutzlast bei derselben ID ist Konflikt. Ein unresolved Job je Entwurf und
      eine Schreibaktion je Account. Kein Job mit veralteter Entwurfsrevision,
      fehlenden Bildern, fremder Freigabe oder falschem Zielaccount.
      confirmed ohne Ziel-ID/active/verifiedAt wird abgelehnt.
- [ ] Deno- und Modelltests rot; Datenbankfälle gegen Vorzustand ebenfalls rot.
- [ ] Jobs speichern unveränderlichen Inhalt/Bildreihenfolge und Freigabegeneration.
      Atomarer Claim mit 120-Sekunden-Lease; job_check verlängert sie nur bei unveränderter Generation und Zustand claimed. Erneuerung alle 30 Sekunden während Formular-/Fotoarbeit, beendet durch Abschluss/Abbruch. Nach begin
      keine automatische erneute Beanspruchung zum Submit.
      processing-Ergebnis mit belegter Ziel-ID bleibt writing mit providerState
      processing; lesende Nachprüfung kann später confirmed ergeben.
      Fehlende aktive Lease nach begin wird outcome_unknown.
      Reconcile kann confirmed, needs_user_action oder outcome_unknown liefern,
      aber niemals direkt neu einreihen. Autorisierungswiderruf verhindert begin.
      Bildabruf nur für den beanspruchten Job und dessen Snapshot.
      Erfolg und Import der eigenen Ziel-Lesekopie atomar speichern.
- [ ] SQL-/Deno-/Angular-Tests grün. Echte Konkurrenzprüfung mit zwei DB-Sitzungen:
      zwei Browser können niemals beide begin erfolgreich abschließen.
      Abbruch vor begin darf erneut geclaimt werden, danach nicht.
      Migrationen erzeugen/prüfen, Typen generieren, neue SQL-Dateien registrieren.
      Konkurrenzskript in den bestehenden CI-DB-Job aufnehmen.
- [ ] Commit: feat(core): queue confirmed Kleinanzeigen publication jobs.

### C5: Extension führt genau einen überprüften Submit aus

**Files:** Neu: tools/flipbase-extension/kleinanzeigen-listing-runtime.js;
scripts/kleinanzeigen-listing-runtime.test.mjs.
Ändern: kleinanzeigen-local-background.js, kleinanzeigen-local-content.js,
autofill-core.js und kleinanzeigen-autofill.js, background.js/manifest.json nur
für notwendige Registrierung. README und stabile Manifestversion aktualisieren.
Ergänzen: scripts/kleinanzeigen-provider-reader.test.mjs und bestehende Autofilltests.

**Interfaces:** globalThis.FlipbaseKleinanzeigenListing.run(job, adapter):
Promise<KleinanzeigenListingOutcome>. Adaptermethoden:
readIdentity, checkGrant, loadCurrentSchema, fill, verifyUploads, detectFee,
begin, submitOnce, readResult, finish.
Outcome: confirmed | processing | failed | needs_user_action | outcome_unknown.
Alle Adaptermethoden geben strukturierte Resultate zurück, kein Erfolg aus Click().
Neue Auftrags-Tabs sind jobgebunden; alter pending-Autofill darf nicht gleichzeitig
denselben Tab verändern.

- [ ] Runtime-Tests zuerst: fehlende Kategorie oder nur 2/3 hochgeladene Bilder →
      submitOnce wird nie gerufen; falsche Identität oder widerrufene Freigabe ebenso.
      detectFee liefert paid/unknown → needs_user_action ohne Submit.
      Nach begin und simuliertem Absturz bleibt submitOnce-Aufrufzahl 1,
      auch nach erneuter Runtimeinstanz.
- [ ] node --test scripts/kleinanzeigen-listing-runtime.test.mjs rot;
      dann Runtime über vorhandenen Autofillkern implementieren.
      Vor Submit Konto, grantGeneration, Schema, Bilder und kostenfreien Zustand
      frisch prüfen. begin dauerhaft bestätigen und den möglichen Submissionzustand
      lokal speichern, bevor der einmalige Click geschieht.
      Nur B1-belegte Selektoren/Erfolgsbelege verwenden. Login, Challenge und
      Buchungsschritte anzeigen; nicht umgehen oder kostenpflichtig fortsetzen.
- [ ] Nach Submit Ziel-ID und Status aus demselben Account lesen. Bei processing
      nur den Status nachladen. Geht die finish-Antwort verloren, dasselbe Ergebnis
      erneut melden; nicht noch einmal inserieren. Unklarer Stand bleibt sichtbar
      und blockiert erneutes Erstellen. Legacy-Autofill bleibt nutzbar und behauptet
      weiterhin ausschließlich Formularübergabe.
- [ ] Runtime-/Provider-/Account-/Sync-Tests grün sowie bestehende
      local-extension-runtime.test.mjs, local-extension-listings.test.mjs und die
      vorhandene src/app/features/listings/kleinanzeigen-autofill-core.dom.spec.ts über npm run test:dom -- ausführen. Neue Tests in test:workflow
      registrieren. Persistentes Chrome-Profil testen: Extension-Service-Worker
      beenden/Browser neu starten während writing; anschließend nur Abgleich.
      Diesen Test auch unter Linux mit den CI-Browserversionen ausführen.
      CI-Konfiguration für einen echten MV3-Test ergänzen; reine JSDOM-Tests ersetzen ihn nicht.
- [ ] Commit: feat(core): publish Kleinanzeigen listings through verified jobs.

### C6: Gesamten Weg und Teilergebnisse abnehmen

**Files:** Neu: e2e/vinted-kleinanzeigen-transfer.spec.ts,
e2e/support/kleinanzeigen-transfer-fixture.ts.
Ändern: scripts/playwright-pr-smoke.test.mjs; bei benötigtem Startadapter neue
scripts/start-kleinanzeigen-browser-fixture.mjs und dessen .test.mjs.
Passende Registrierung in playwright.pr.config.ts/CI nur soweit für Auswahl und
den persistenten Extension-Browser aus C5 erforderlich.
Dokumentation und docs/AI-CHANGELOG.md aktualisieren.

**Interfaces:** Webfixture bildet beide APIs, Quelldaten, Formschema, Jobs und
Kleinanzeigen-Lesekopie ab. Sie darf mocked confirmed nicht als Live-Nachweis
ausgeben. Der separate echte Extensiontest aus C5 bleibt Pflicht für den Submitweg.
Jobstatus-Polling in UI: alle 2 Sekunden nur solange Dialog/Seite und Job aktiv;
nach 2 Minuten offenem processing in 10-Sekunden-Abstand. Bei Hintergrundtab
pausieren, bei Rückkehr Status laden; DestroyRef beendet alle Timer/Requests.

- [ ] E2E zuerst: eigenes Vinted-Inserat ohne Lagerzuordnung wählen, Zielkonto,
      Formular mit fehlender Kategorie und langem Titel korrigieren, Bilder
      umsortieren, Entwurf wieder öffnen, veröffentlichen. Danach genau eine
      Zielzeile mit derselben Ziel-ID und unverändertem Quellinserat erwarten.
      Zweiter Doppelklick/Tab erzeugt keinen zweiten Job oder Entwurf.
- [ ] Weitere Fälle: 1 Bild fehlt, Preis/Währung unbekannt, Schemawechsel,
      falsches Konto, Extension veraltet, Browser offline, Freigabe widerrufen,
      bezahlter Schritt, processing, Verbindungsabbruch nach begin und verlorenes
      finish. Ergebnis unbekannt bietet „Status prüfen“, keinen erneuten Submit.
      Lange Titel/Beschreibungen und 0 EUR nicht pauschal mit „fehlt“ verwechseln.
- [ ] Neue Tests @core-smoke bei 320/390/834/1440 px und Hell/Dunkel, Touch,
      Tastatur, Fokus-Rückgabe und AXE. Rohstatus, bereite Entwürfe und echte
      Veröffentlichung sind in Text und Badge unterscheidbar.
      Bestehende listing-studio.spec.ts, vinted-listing-drafts.spec.ts,
      vinted-listing-edge-cases.spec.ts, vinted-workspace-ui.spec.ts sowie
      marketplace-overview.spec.ts und kleinanzeigen-accounts.spec.ts gezielt prüfen.
- [ ] Testregistrierung vor Push prüfen:
      node --test scripts/playwright-pr-smoke.test.mjs
      scripts/check-schema-registration.test.mjs scripts/check-migration-changes.test.mjs;
      npm run test:audit; node scripts/check-admin-shared-ui.mjs.
      Deno-CI-Liste für neue Handler-/Fototests, Node-Workflow-Liste und echten
      Extensiontest kontrollieren. SQL-/Konkurrenztests, betroffene bestehende/neue
      Node-/DOM-/Angular-/Workerfälle, Format/Lint/typecheck/build bestehen.
      Umfangreiche Integration rechtfertigt abschließend npm run verify.
      Exitcodes unverändert auswerten, keine Pipe zum Kürzen der Testausgabe.
- [ ] Browserprüfungen gegen ruhenden Produktionsstand; alle versteckten
      Baukonfigurationen in isolierter Kopie erhalten. Kein gleichzeitiger Build.
      Linux-/MV3-Abnahme sowie relevante CI-Versionen dokumentieren.
      Einen echten kostenlosen Testartikel erst nach dessen ausdrücklicher
      Auswahl/Freigabe veröffentlichen; Ziel-ID, Account, Felder und Bilder prüfen.
      Ohne diesen Nachweis den automatischen Weg als noch nicht live abgenommen
      ausweisen, nicht als vollständig bestätigte Produktionsfunktion.
- [ ] Commit: test(ui): verify the complete Vinted to Kleinanzeigen transfer.
      Danach die genaue Abschlussfrage aus AGENTS.md stellen; erst mit Freigabe
      Push/PR/Pflichtprüfungen/Merge und Aufräumen durchführen.

## Abnahme

Ein eigenes Vinted-Inserat ist über die zentrale Übersicht auf dem ausgewählten
Kleinanzeigen-Account veröffentlicht und durch externe Ziel-ID und Status belegt.
Original und Lagerzuordnung bleiben korrekt. Fehlende Daten sind bearbeitbar,
Fotos gesichert, Gebühren und unbekannte Ergebnisse werden nicht übergangen.
Die Veröffentlichung wird nach Browser-/Netzwerkfehlern niemals blind wiederholt.

## Explizite Testregistrierung

Die neue e2e/vinted-kleinanzeigen-transfer.spec.ts zusätzlich in
e2e/support/marketplace-preview.config.ts unter testMatch registrieren, zusammen
mit marketplace-overview.spec.ts und kleinanzeigen-accounts.spec.ts.
Die Preview-Konfiguration hat eine feste Liste; ein --grep allein entdeckt
eine dort fehlende Datei nicht. Neue source_details-Deno- und Node-Tests in die
tatsächlichen ci.yml-/test:workflow-Listen aufnehmen und Auswahltests ergänzen.

## Ergänzung zu C5/C6: Kontingent und Gebühren bei Privataccounts

Erster vollständiger Abnahmefall ist ein Standard-Privataccount ohne PRO.
Runtime-/Browserfälle um die Schwellen 99/100/101 und um extern erstellte bzw.
gelöschte Anzeigen im Zeitraum ergänzen. Diese Zahlen sind synthetische
Testfixtures, keine dauerhaft gültige Gebührenkonfiguration.
Auch bei angezeigtem Restkontingent den tatsächlichen Gebührenhinweis prüfen;
bei Widerspruch oder unklarem Preis vor Submit anhalten.
Ein fehlendes PRO-Abo darf weder die Verbindung blockieren noch automatisch
Privatkonditionen auswählen. Normales Verlängern ist nicht Teil dieses
Transferwegs; spätere Relisting-Ausführung bekommt eigene Kontingenttests.

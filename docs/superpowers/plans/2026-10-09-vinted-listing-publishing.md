# Vinted-Inserate: Umsetzungsplan

> **Ausführung:** Der Nutzer hat die Umsetzung am 09.10.2026 mit „dann los“
> freigegeben. Auf aktuellem `origin/master` paketweise mit
> `superpowers:executing-plans` umsetzen. Push und reale Anbieter-Schreibaktionen
> benötigen ihre eigene Freigabe.

**Aktueller Stand:** Auf `638b2ace` begonnen; eigene Entwürfe, private Fotos,
Vorlagen und Editor als geprüfte Grundlage umgesetzt. Neuanlage und vollständige
Bearbeitungsmaske am angemeldeten Vinted geprüft; weitere Kategoriearten,
Anbietergrenzen und Schreib-/Ergebnisbelege noch offen. Offizielle Fotoanzahl
und gemeinsame Formularleser ergänzt. Pakete 2/3 teilweise umgesetzt; Paket 4
enthält eigene Freigaben, unveränderliche Auftragsannahme, Abbruch und sichtbaren
Verlauf, lokale/Cloud-Ausführungsprotokolle und einen geprüften Worker-Ablauf
mit privatem Fotobezug, nativer Fotoeingabe und geprüfter Feldvorbereitung.
Speicher-/Ergebnisadapter und automatische Abholung fehlen noch.
Pakete 6/7 offen; Paket 5 enthält Terminmodell und
atomaren Ersatz geplanter Aufträge und einen angeschlossenen Planungsdialog für
vorhandene wartende Aufträge. Neuanlageaktionen und Ausführer fehlen weiterhin.
Einzelheiten und Prüfgrenzen stehen im
[Anbieter- und Umsetzungsbericht](../../research/2026-10-09-vinted-listing-provider-contract.md).

**Ziel:** Ein vollständiger Vinted-Editor mit Fotos, gespeicherten Entwürfen,
Vorlagen, sofortiger/geplanter Veröffentlichung und späterer Bearbeitung.

**Architektur:** Fachlich getrennte Inseratentwürfe und Aufträge innerhalb des
bestehenden Vinted-Bereichs. Lokale Erweiterung und Cloud verwenden denselben
Auftragsvertrag und die vorhandenen Kontosperren. Den bisherigen Bildeditor
als gemeinsame darstellende Komponente wiederverwenden.

**Technik:** Angular 22, Tailwind, Supabase, vorhandene Chrome-Erweiterung und
Marketplace Worker. Keine ungefragten Major-Updates oder neue Bibliotheken.

**Produktentwurf:** [Bedienung, Verträge und Abnahme](../specs/2026-10-09-vinted-listing-publishing-design.md).
**Planstatus:** Umsetzung seit „dann los“ freigegeben und begonnen. Eigene und
Vinted-Entwürfe sowie die Pause nach 30 Minuten Verspätung sind die gewählte
Grundlage. PR #356/#357 sind bereits in der verwendeten Masterbasis enthalten;
fremde Arbeitszweige werden nicht verändert.

## Gemeinsame Vorgaben und Reihenfolge

- Englische Bezeichner, deutsche Du-Texte, Branches `juna/`, KI-Name Juna.
- Shared Components und `#fcc601`; Signals, OnPush, Reactive Forms, externe HTML.
- `public`-Tabellen mit RLS und einzelnen Policies; deklarative Schema-Dateien
  registrieren, Migrationen erzeugen und ansehen, Typen neu generieren.
- Keine UI-Datenbankabfragen, kein `postgres_changes`, keine neuen Sammelservices.
- Pflichtfelder und Grenzen aus aktueller Anbieterbeobachtung bestätigen.
- Pro abgeschlossenen Paket gezielte Prüfungen und PR-Abschluss gemäß AGENTS.md.
- Zuerst Editor/Entwürfe/Vorlagen, anschließend Veröffentlichung und Planung,
  dann vollständige Bearbeitung und manuelles Relist. Kontotransfer bleibt später.

## Besondere Prüffälle

- Zwei Geräte speichern dieselbe Revision: neuere Arbeit bleibt bestehen (Paket 2).
- Kategorieänderung invalidiert Größe: gezielter Hinweis statt Datenverlust (Paket 3).
- Upload endet erst nach Konto-/Workspacewechsel: kein fremder Bildbezug (Paket 2/3).
- Termin liegt im Sommerzeitwechsel oder Executor fällt aus: klare Fälligkeit (Paket 5).
- Vinted speichert, aber die Antwort geht verloren: kein doppeltes Inserat (Paket 4).

## Paket 1: Anbieterformular und Anschlussstellen bestätigen

**Teilstand:** Neuanlage, Entwurf-/Hochladen-Aktionen und vollständige
Bearbeitungsmaske gelesen. Bomberjacken und Kinderfußballschuhe belegen
kategorieabhängige Größen; Farbe erlaubt zwei, Material drei Werte.
Sendungsgrößen, Dateiformate, Markenbeschränkungen, KI-Fotohinweis und
kostenpflichtige Push-Option sind dokumentiert. Weitere Kategorien,
Pflichtvalidierung und belastbare Ergebnisse bleiben offen. Bis zu 20 Fotos
sind durch die offizielle Vinted-Hilfe bestätigt; die beobachteten äußeren
ARIA-Auswahlelemente sind Grundlage gemeinsamer lokaler/Cloud-Leser.

**Dateien:** Neu `docs/research/2026-10-09-vinted-listing-provider-contract.md`;
prüfen `services/marketplace-worker/src/vinted-browser-listing-edit.ts`,
`tools/flipbase-extension/vinted-local-background.js`,
`supabase/functions/_shared/marketplace-local-extension-contracts.ts` und die
nach Merge vorhandenen Verhandlungsverträge. Kein fremder Zweig wird geändert.

- [ ] Aktuelles Neuanlage- und Bearbeitungsformular lesend prüfen; Pflichtfelder,
      Kategorien, abhängige Werte, Bildgrenzen und Ergebnisbelege dokumentieren.
      Keine geratenen Endpunkte, IDs oder aus Bleam kopierten Grenzwerte.
- [ ] Vorhandene Kategoriequelle und Bild-/Storage-Verträge abgleichen; neue
      Auswahlwerte fachlich getrennt ergänzen statt eine feste Kleidungsliste bauen.
- [ ] Gemeinsamen `VintedListingContent`-Vertrag mit bestätigten Feldtypen und
      `VintedListingResult` mit `confirmed`, `failed`, `outcome_unknown` definieren.
      `confirmed` verlangt Aktion, externe ID, Konto und überprüften Zustand.
- [ ] Prüfungen für fehlende Kategorieangaben, ungültige Fotos, Dezimalpreise,
      ein eindeutig erkanntes Ergebnis und erfolgreiche Antwort ohne ID festlegen.
- [ ] Bericht lesen und offene Providerfragen vor dem Schreibadapter klären.
      Ein realer Veröffentlichungsnachweis erfolgt später mit einem ausdrücklich
      ausgewählten Testinserat; die Leseprüfung ersetzt diesen Nachweis nicht.

**Abnahme:** Vollständiger Formularvertrag; Unterstützung echter Vinted-Entwürfe
und vollständiger Bearbeitung konkret belegt oder präzise eingeschränkt.

## Paket 2: Entwürfe, Bilder und Vorlagen dauerhaft speichern

**Dateien neu:** `supabase/schemas/460_marketplace_listing_drafts.sql`,
`461_marketplace_listing_images.sql`, `462_marketplace_listing_templates.sql`;
passende Dateien unter `supabase/tests/`; unter
`src/app/features/marketplaces/models/` die Dateien `vinted-listing-draft.ts`,
`vinted-listing-content.ts`, `vinted-listing-template.ts`; unter `services/`
die fachlich getrennten `vinted-listing-draft.service.ts`,
`vinted-listing-image.service.ts`, `vinted-listing-template.service.ts`.
**Ändern:** `supabase/config.toml`, generierte Supabase-Typen und geprüfte
Storage-Policies. Bei inzwischen belegten Nummern Schema-Präfixe neu einordnen.

**Schnittstellen:** `loadDraft(id)`, `saveDraft(id, expectedRevision, content)`,
`uploadImage(draftId, file)`, `setImageOrder(draftId, expectedRevision, imageIds)`,
`saveTemplate(name, fields)`, `applyTemplate(content, template)`; Inhaltstyp aus
Paket 1. Konflikte liefern den aktuellen Stand, keine stille Überschreibung.

- [ ] Tests zuerst: unvollständiger Entwurf erlaubt, Workspace-/Kontotrennung,
      zwei gleichzeitige Revisionen, fremde Artikelzuordnung und Storage-Pfade.
- [ ] Tabellen, Indizes, RLS und RPCs implementieren; neue interne IDs als
      `bigint generated always as identity`, bestehende UUID-Bezüge beibehalten.
- [ ] Bildoriginale und Varianten eindeutig zuordnen; Uploadfehler und verwaiste
      Dateien bereinigen, gemeinsam verwendete Originale nicht versehentlich löschen.
- [ ] Services mit geordnetem Speichern, Konflikten und Kontextprüfung umsetzen.
      Vorlagenfeld-Auswahl, Vorschau und fehlende Platzhalterwerte prüfen.
- [ ] Migration per isoliertem `supabase db diff` erzeugen, SQL vollständig lesen,
      auf Testkopie anwenden, betroffene pgTAP-Tests und Typengenerierung ausführen.
- [ ] Service-/Modelltests gezielt ausführen, Format/Lint und Diff prüfen.

**Abnahme:** Ein Entwurf einschließlich Fotos und Revision kann nach Neustart
auf einem zweiten Gerät korrekt geladen werden; Vorlagen sind gespeichert.

## Paket 3: Vollständigen Editor und Entwurfsübersicht bauen

**Dateien neu:** `components/vinted-listing-editor/` und
`components/vinted-listing-drafts/` unter `features/marketplaces/`, jeweils
TS/HTML/Angular-Spec. Fachliche Feldgruppen in kleine Feature-Komponenten trennen.
**Ändern:** `marketplaces.routes.ts`, vorhandene Vinted-Navigation,
`components/vinted-listings/`. Den darstellenden
`features/listings/components/listing-image-editor/` nach
`shared/components/listing-image-editor/` verschieben; beide Features über einen
datenbankfreien Bildtyp anbinden, vorhandene Kleinanzeigen-Tests erhalten.

**Schnittstelle:** Editor lädt/speichert über die Services aus Paket 2. Geplante
Lazy-Routen `listings/new`, `listing-drafts/:draftId`; konkrete neue Routen vor
allgemeinen Inserat-/Wildcard-Routen registrieren. Bestehende URLs erhalten.

- [ ] DOM-Tests zuerst: neue leere Seite legt nichts an, automatische Speicherung,
      Fehler mit erhaltener Eingabe, Navigation bei ungesichertem Zustand.
- [ ] Zweispaltigen Editor mit Shared-Seitenkopf/Feldern und sichtbarem Zielkonto
      bauen. Entwürfe und gespeicherte Vorlagen sind bereits nutzbar; spätere
      Veröffentlichungsschaltflächen erst mit funktionierender Ausführung anbieten.
- [ ] Kategorienabhängige Merkmale aus Paket 1, Preisquelle, optionale
      Artikelübernahme und Vorlagenvorschau mit gezielten Konflikthinweisen umsetzen.
- [ ] Bildraster mit Dateiauswahl, Ziehen, Touch-/Tastatursortierung, Titelbild,
      Fortschritt und existierendem Zuschnitt/Drehen verbinden. Fehler pro Bild.
- [ ] Entwurfsübersicht mit Status/Suche/Leer-/Fehlerzuständen und Fortsetzen bauen;
      gemeinsame Tabellen-/Listenbausteine gemäß Designvertrag verwenden.
- [ ] Betroffene Angular-Tests, `node scripts/check-admin-shared-ui.mjs`,
      Format/Lint, `npm run typecheck` und `npm run build` ausführen. E2E/AXE
      auf Mobil/Desktop und hell/dunkel, auch Kleinanzeigen-Regression prüfen.

**Abnahme:** Fotos, Kategorien, Merkmale, Entwürfe und Vorlagen sind vollständig
bedienbar. Die Oberfläche verspricht noch keine nicht implementierte Veröffentlichung.

## Paket 4: Sofortige Veröffentlichung lokal und in der Cloud

**Teilstand:** Revisionsgebundene Aufträge, getrennte Schreibfreigaben und
Cloud-/lokale Claim/check/begin/finish-Verträge sind umgesetzt. Der native
Cloud-Veröffentlichungsbaustein verbindet Feldvorbereitung, Originalfotos,
einmaliges Speichern und frische Inhalts-/Foto-/Aktivstatusprüfung einer
konkreten Ergebniskennung. Die feste getrennte Browseraktion überträgt große
Originale in begrenzten Teilen mit aktuellen Freigaben. Cloud-Inserate werden
in der bestehenden gemeinsamen Auftragsverteilung vor automatischen
Favoritenaufträgen angenommen. Beide Container und der vollständige
getrennte Browserablauf sind mit abgefangenen Anbieteranfragen geprüft.
Private Status-Broadcasts aktualisieren den Verlauf des gespeicherten Entwurfs;
bei Wiederverbindung wird der aktuelle Stand erneut gelesen. Laufende Abfragen
und Planungsdialoge merken Meldungen vor. Rechte- und Kontextwechsel verwerfen
alte Antworten. Datenbank- und WebSocket-Browsertests prüfen den gesamten Weg.
Noch offen: lokale Browserausführung, vollständige Editor-Merkmalsauswahl,
native Entwürfe und der konkret freigegebene Livefall.

**Dateien neu:** `supabase/schemas/463_marketplace_listing_jobs.sql`,
passende SQL-Tests, `_shared/marketplace-listing-contracts.d.ts`,
Worker `src/vinted-browser-listing-publish.ts`,
`src/marketplace-listing-runner.ts`, `src/supabase-marketplace-listing-store.ts`,
zugehörige `test/*.test.ts`, Erweiterung `vinted-listing-executor.js` und
`scripts/local-extension-listings.test.mjs`.
**Ändern:** lokale Edge-Handler/-Verträge, Extension-Dispatch und Manifest,
Worker-Broker/-Start/-isolierte Browseraktionen sowie Verlauf und Editorservice.

**Schnittstellen:** `enqueueListing(draftId, expectedRevision, action, requestId)`
erzeugt genau einen dauerhaften Auftrag; Aktion `publish` oder `vinted_draft`.
Claim/check/begin/finish übernehmen dieselben Konto-/Executor-/Widerrufsregeln
wie vorhandene Nachrichtenjobs. Kein Versand aus einem UI-Klickhandler.

- [ ] Tests zuerst: doppelter Klick, falsches Konto, widerrufene Freigabe,
      paralleler Ausführer, veraltete Erweiterung und fehlende Bilder.
- [ ] Auftrag mit fester Revision und Bildreferenzen atomar speichern;
      Pflichtfelder und aktueller Artikelstatus werden erneut geprüft.
- [ ] Kontoidentität vor Absenden prüfen, Upload abwarten, Felder lesen und mit
      Auftrag vergleichen. Frische temporäre Bild-URLs nur im Ausführungsweg.
- [ ] Ergebnis-ID und Anbieterstatus bestätigen; Antwortverlust, Tab-Schließen
      oder Leaseablauf nach Schreibbeginn als unklar behandeln. Nur Beleg/Abgleich
      wiederholen. Keine Neuanlage allein anhand ähnlichem Titel bestätigen.
- [ ] Lokalen und Cloud-Executor sowie private Status-Broadcasts verbinden;
      Journal zeigt wartend/laufend/bestätigt/fehlgeschlagen/unklar.
- [ ] SQL-, Edge-, Extension- und Worker-Tests einschließlich Neustart ausführen;
      bestehende Nachrichten/Favoriten/Verhandlung regressionsprüfen. Beide Builds
      und die tatsächliche Worker-Verpackung prüfen.

**Abnahme:** Synthetischer Ablauf und ein später freigegebener einzelner
Livefall belegen den Anbietererfolg. Kein Erfolg nur aus Auftragsannahme.

## Paket 5: Zeitplanung und verpasste Termine

**Teilstand:** Terminmodell mit expliziter Zeitzone, UTC-Berechnung,
Sommerzeitlücke/-doppelzeit und bewusster Auswahl sowie Prüfung auf zukünftige
Termine umgesetzt. Fälligkeit und beide Ausfallregeln sind modellseitig
geprüft. Dauerhafte Aufträge, serverseitige Fälligkeit und atomarer Terminersatz
sind ergänzt; der Verlauf zeigt Zeitzone und MEZ/MESZ. Der Dialog enthält Datum,
Uhrzeit, IANA-Zone, Schnelltermine, die Auswahl der doppelten Stunde und beide
Ausfallregeln. Vorhandene wartende Aufträge lassen sich mit dem gespeicherten
Entwurf aktualisieren; die bisherige Aktion und Fotoeinstellung übernimmt die
Datenbank. Noch keine Neuanlageaktionen oder tatsächliche Veröffentlichung:
Ausführeranschluss und Anbieterergebnis bleiben offen.

**Dateien:** Jobschema aus Paket 4 deklarativ ergänzen; neu
`models/vinted-listing-schedule.ts` samt Modelltest und
`components/vinted-listing-schedule-dialog/` samt TS/HTML/Angular-Spec;
Runner, Entwurfsübersicht, Editor und Journal erweitern.

**Schnittstellen:** `scheduleListing(draftId, expectedRevision, scheduledAt,
timeZone, latePolicy, requestId)`, `replaceScheduledListing(jobId, expectedVersion,
draftRevision, scheduledAt)`, `cancelListingJob(jobId, expectedVersion)`.
Zeitzone und Ausfallregel entsprechen dem abgestimmten Produktentwurf.

- [ ] Tests zuerst: Sommerzeitlücke/-doppelzeit, Vergangenheit, fehlender Executor,
      Neustart und gleichzeitig erfolgender Abbruch/Claim.
- [x] Planungsdialog mit Datum, Uhrzeit, Zeitzone, Schnellterminen und erklärter
      Ausfallregel bauen. Zeitpunkt auch serverseitig validieren.
- [ ] Dauerhafte Fälligkeit im bestehenden Dispatch prüfen; Browser-Timer sind
      nicht die Auftragsablage. Wartende Jobs lassen sich vorher abbrechen/ersetzen.
- [x] Geplante Inhalte bleiben an eine Revision gebunden; „Planung aktualisieren“
      ersetzt alte unbegonnene Aufträge atomar. Keine heimliche Inhaltsänderung.
- [ ] Fälligkeit, Wartegrund und überfällige Pause sichtbar machen; beide
      Ausfallregeln mit Fake-Uhr testen, nicht durch langes echtes Warten.
- [ ] Gezielte SQL-/Executor-/Angular-/E2E-Tests, AXE, Format/Lint und Builds.

**Abnahme:** Termine bleiben nach Neustart erhalten; Ausführung bei Ausfall folgt
der ausdrücklich gespeicherten Regel und kann kein zweites Inserat erzeugen.

## Paket 6: Bestehende Inserate vollständig bearbeiten

**Dateien:** `vinted-listing-detail` und `vinted-browser-listing-edit.ts`
erweitern, Editor und Jobvertrag wiederverwenden; neu
`components/vinted-listing-detail-panel/` und falls nötig ein allgemeiner
Shared-Rahmen für die rechte Detailansicht mit externem HTML und Fokusprüfung.
Lokale Erweiterung unterstützt denselben `update`-Auftrag wie die Cloud.

- [ ] Tests zuerst: vollständiger Iststand, extern veränderter Artikel,
      reservierter/verkaufter Artikel, Fotoänderung und Konto-/Workspacewechsel.
- [ ] Detailansicht rechts mit Fotos, Kennzahlen, Verlauf, Vinted-Link und
      eindeutiger Aktion „Bearbeiten“; direkte URL und mobile Seite erhalten.
- [ ] Gemeinsamen Editor mit frischem Iststand vorbelegen. Lokales Speichern und
      „Änderungen bei Vinted speichern“ eindeutig unterscheiden.
- [ ] Aktuellen Anbieterstand vor Update vergleichen, Konflikt erklären;
      alle bestätigten Felder/Fotos speichern und extern erneut bestätigen.
- [ ] Vorhandene drei-Felder-Bearbeitung ohne Funktionsverlust ablösen. Nach
      Bestätigung Lesekopie und Kennzahlen gezielt aktualisieren.
- [ ] Beide Executorpfade, Versionskonflikte, Tastatur/Escape/Fokusrückkehr,
      Desktop/Mobil, hell/dunkel und AXE prüfen; Angular-/Worker-Bau ausführen.

**Abnahme:** Erstellen und Bearbeiten verwenden dieselbe vollständige Maske;
kein Erfolgstext für bloß lokal gespeicherte Änderungen.

## Paket 7: Manuelles erneutes Einstellen

Dieses Paket nach dem bestätigten Veröffentlichungsweg konkretisieren; die
Reihenfolge beim Anbieter ist vorab zu prüfen. Eigene Dateien
`vinted-listing-backup.service.ts`, `vinted-listing-relist.ts` und ein
`vinted-listing-relist-dialog` halten Backup, Ablauf und Bedienung getrennt.

- [ ] Vollständige Kopie inklusive Originalfotos und Anbieter-ID sichern;
      belegen, dass der Sicherungsstand für eine Neuanlage reicht.
- [ ] Reihenfolge von Entfernung/Neuanlage und zulässige Relist-Aktion bestätigen.
      Teilzustände und Wiederaufnahme vor Implementierung festlegen.
- [ ] Vorschau, optionale echte Inhaltsänderungen und bewussten Relist-Auftrag
      anbieten; alte/neue ID und Ergebnis im Journal verknüpfen.
- [ ] Unterbrechung nach Entfernung und nach Neuanlage getrennt testen;
      kein Verlust der Sicherung und kein blindes erneutes Veröffentlichen.
- [ ] Manuelles Relist mit einzeln freigegebenem Testfall abnehmen. Automatische
      Zyklen, Kontotransfer und Auto-Restock bleiben ein späterer eigener Plan.

## Prüf- und Veröffentlichungsgrenze

Die Umsetzung ist freigegeben. Die eigene Speichergrundlage wird ausschließlich
im Arbeitszweig und in einer isolierten lokalen Testdatenbank geprüft. Vor
Integration den Stand von `origin/master`, Schema-Nummern und Dateipfade erneut
abgleichen. Keine alten/fremden Zweige zusammenführen. Die produktive Datenbank
und installierte Erweiterung werden durch diese Arbeit nicht geändert.

Jedes Implementierungspaket ergänzt relevante Tests und endet mit Format/Lint,
Diffcheck, passenden Builds sowie seinem fachlichen Abnahmenachweis. Alle
Pflichtprüfungen laufen im jeweiligen PR. Nach abgeschlossener Umsetzung
gemäß AGENTS.md fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen
Tests mergen?“ Ein echter Vinted-Schreibtest benötigt einen konkret ausgewählten
Artikel und die Freigabe dieser Aktion; Mock-Erfolg ersetzt ihn nicht.

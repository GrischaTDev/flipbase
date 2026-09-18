# 🤖 KI-Änderungsprotokoll

Neue Sitzungen werden hier oben ergänzt: Datum, Assistent, Thema sowie Auftrag,
Änderung und tatsächlich ausgeführte Prüfungen. Die Vorgaben aus `AGENTS.md` gelten
unverändert.

Die vollständige bisherige Historie ist im
[Archiv bis zum Stand vom 16. September 2026](AI-CHANGELOG-archive-2026-09-16.md)
bytegleich erhalten. Das Archiv liegt im selben Ordner, damit seine relativen
Dateiverweise weiterhin denselben Ausgangspunkt haben.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Navigation und Upload-Button vereinheitlicht

**Auftrag:** Die nach dem Theme-Umbau ergänzte gelbe Seitenmarkierung an aktiven
Sidebar-Einträgen entfernen, weil sie nicht zur bestehenden Admin-Navigation passt.
Außerdem prüfen, ob „Bilder hinzufügen“ im Bildoptimierer wirklich die gemeinsame
Button-Komponente verwendet.

**Änderung:** Die zusätzliche `box-shadow`-Seitenmarkierung der aktiven Sidebar
sowie die entsprechende Unterkante der mobilen Navigation wurden entfernt; der aktive
Zustand verwendet wieder ausschließlich die gemeinsame abgerundete Brand-Fläche.
„Bilder hinzufügen“ war tatsächlich als lokal gestyltes `label` umgesetzt. Der
sichtbare Auslöser verwendet jetzt `ButtonComponent` mit `variant="primary"` und
`size="lg"`; nur das technisch notwendige versteckte Datei-Input bleibt nativ.
Die Designrichtlinie hält beide Entscheidungen verbindlich fest.

**Prüfung:** Ausstehend bis zum PR-Lauf; betroffen sind Styles und der
Bildoptimierer-Header.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Theme-Konsistenz im hellen Design und Bildoptimierer

**Auftrag:** Das helle Theme soll das echte Flipbase-Gelb sichtbarer verwenden statt
gold-brauner Ersatzfarben. Der Admin-Badge soll als auffällige rote Rollenkennzeichnung
erhalten bleiben. Bildoptimierer und Fotoguide sollen dieselbe Flipbase-Designsprache
wie der restliche Admin verwenden.

**Änderung:** Brand-Flächen im hellen Theme sind heller und tragen dunklen Text für
ausreichenden Kontrast; aktive Navigation erhält zusätzlich eine echte gelbe
Markenmarkierung. Brand-Badges verwenden im hellen Theme das Logo-Gelb. Für den
Plattform-Admin gibt es einen eigenen roten Badge-Ton statt Brand oder Critical.
Der gemeinsame `ModalShellComponent` verwendet die zentralen Theme-Farben und bietet
einen Brand-Ton. Der Fotoguide wurde vom eigenen nativen Dialog auf den Shared
`ModalShellComponent` umgestellt. Bildoptimierer-Komponenten verwenden für Auswahl,
Fokus, Warnung, Erfolg, Fehler und Editor-Akzente die zentralen Flipbase-Variablen;
alte Indigo-, Sky-, Amber- und Emerald-Akzente wurden in diesem Feature entfernt.
Die Designrichtlinie dokumentiert diese Nutzerentscheidungen.

**Prüfung:** Ausstehend bis zum PR-Lauf; betroffen sind Theme, Shared Badge/Modal und
der Bildoptimierer. Geplant sind Formatierung, Lint, Typprüfung, Build,
Accessibility-Browser-Smoke sowie die relevanten Angular-Tests.

## 2026-09-18 – ChatGPT GPT-5.6 Sol (OpenAI) – Flipbase Theme und lesbare AI-Regeln

**Auftrag:** Die uneinheitlichen Farben von Toasts, Badges, Header, Navigation und
Statusdarstellungen auf eine gemeinsame Flipbase-Designsprache ausrichten. Danach die
AI-Regeln so ergänzen, dass englische Code-Namen zugleich konkret, lesbar und am
Projektzweck orientiert bleiben; PR-Titel und PR-Beschreibungen ausdrücklich auf
Englisch festlegen.

**Änderung:** Zentrale Theme-Datei `src/styles/flipbase-theme.css` mit verständlichen
Farbrollen für Brand, Erfolg, Warnung, kritisch und neutral in Light/Dark. Shared
Badges, Toasts und Buttons sowie Header, Workspace-Status und Dashboard-KPIs greifen
auf diese Rollen zurück. Toasts erhalten eine neutrale Oberfläche und sauber
ausgerichtete Icon-/Text-/Close-Spalten. `AGENTS.md` verlangt jetzt zusätzlich
intention-revealing English names, bevorzugt konkrete Projekt-/Fachnamen vor
abstraktem Jargon, und definiert PR-Titel sowie PR-Beschreibungen ausdrücklich als
englisch.

**Prüfung:** PR-CI nach den UI-Änderungen: Formatierung, ESLint, Typprüfung, Build,
Browser-Smoke inklusive AXE, Node-, DOM- und beide Angular-Test-Shards erfolgreich.
Die anschließende reine Dokumentationsänderung an `AGENTS.md` wurde im selben PR
ergänzt.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Einkauf drucken

**Auftrag:** Teil 3 des Einkaufsumbaus. Nutzerentscheidungen: eigene Druckseite wie
beim Prüfbeleg, Druckknopf nur auf der Detailseite.

**Änderung:** Neue Seite `/purchases/:id/print` mit Kopf (Einkaufsnummer,
Bezeichnung, Datum), Verkäufer-Snapshot samt Quelle, Bestellnummer und Angebotslink,
Positionstabelle, Kostenaufstellung mit Rabatt und Zusatzkosten, Gesamtkosten nach
derselben Regel wie die Detailseite sowie der Liste hinterlegter Belege. Die
Bedienleiste verschwindet beim Drucken; gedruckt wird über den Browserdialog, auch als
PDF. Die Aufbereitung liegt als reine Funktion in `utils/purchase-print.ts`; die
Kostenart-Bezeichnungen wurden dafür aus der Kostenübersicht in
`utils/purchase-cost-labels.ts` ausgelagert. Der Prüfbeleg mit der Historie bleibt
unverändert und separat. Keine Datenbankänderung.

**Prüfung:** Vitest für den Einkaufsbereich (30 Dateien, 279 Tests), Typprüfung,
ESLint, Prettier, Test-Audit und Shared-UI-Prüfung mit Exitcode 0. Der Angular-Bau
läuft wegen der lokalen Node-Version nur in der CI.

## 2026-09-18 – Claude Opus 5 (Anthropic) – Einkaufsbelege als private Dateien

**Auftrag:** Teil 2 von 3 des Einkaufsumbaus, nach dem veröffentlichten Teil 1 (PR #103).
Nutzerentscheidungen: Löschen nur vor dem Abschluss, im Demo-Modus kein Upload, Anzeige
als Vorschau im Dialog. Konzept und Plan liegen unter
`docs/superpowers/specs/2026-09-18-purchase-documents-design.md` und
`docs/superpowers/plans/2026-09-18-purchase-documents.md`.

**Änderung:** Neuer privater Bucket `purchase-documents` (20 MiB, PDF/JPG/PNG/XML) mit
kanonischem Pfad je Workspace, Einkauf und Beleg. Neue Tabelle `purchase_documents` mit
RLS je Operation: lesen und anlegen für Mitglieder, löschen nur bei nicht abgeschlossenem
Einkauf, kein Ändern. Dieselben Bedingungen gelten für die Datei in `storage.objects`.
Trigger schreiben `purchase_document_added` und `purchase_document_removed` in die
vorhandene Historie. Der neue Dienst prüft Typ, Endung und Größe vor dem Upload, legt
erst die Datei und dann die Metadaten an und nimmt die Datei zurück, wenn die Metadaten
scheitern; das Entfernen löscht erst den Eintrag, damit die Datenbankregeln entscheiden.
Neue Belegkarte auf der Einkaufs-Detailseite mit Liste, Belegart-Auswahl, Vorschau
(Bild oder PDF aus dem privaten Bucket) und Download. Belege lassen sich auch nach dem
Abschluss ergänzen; ein Hinweis erklärt, dass sie dann nicht mehr entfernt werden können.
Im Demo-Modus ist der Upload gesperrt.

**Prüfung:** Datenbanktests und vollständige PR-CI auf `feat/purchase-documents` grün
(Migration, Policies, Bau, Browser-Smoke). Lokal: Vitest node (1423), angular (877) und
dom (250), Typprüfung, ESLint, Prettier, Test-Audit und Shared-UI-Prüfung mit Exitcode 0.
Die Supabase-Typen kommen aus einem GitHub-Lauf, nicht von Hand.

**Offen:** Sichtprüfung im Browser (lokales Node unter dem Minimum der Angular CLI);
Teil 3 (Einkauf drucken) folgt. Ein Wiederherstellungstest der gesicherten
Storage-Dateien ist weiterhin eine Betriebsaufgabe und nicht Teil dieses PRs.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Einkauf: Quelle, Verkäufer-Snapshot und Nachtrag

**Auftrag:** Übernahme des Einkaufsumbaus von ChatGPT. Nutzerentscheidungen: drei PRs
nacheinander (dieser ist Teil 1), Migration und Typen über einen GitHub-Runner statt
lokalem Docker, Weiterarbeit auf `feat/purchase-workflow-20260916`, Bezeichnungsfeld
aus PR #59 mit aufnehmen, Grund beim Nachtrag optional. Konzept und Plan liegen unter
`docs/superpowers/specs/2026-09-17-purchase-seller-details-design.md` und
`docs/superpowers/plans/2026-09-17-purchase-seller-details.md`.

**Vorgefunden:** Der Zweig enthielt nur Transferreste (Base64-Teile und einen
Einmal-Workflow) und lag 18 Commits zurück. Das entpackbare Paket war ein
unvollständiger Diff gegen `08d1707` mit 25 Frontenddateien, ohne Datenbankteil. Es
diente als Nachschlagewerk; übernommen wurde daraus kein Code. Transferdateien
entfernt, `master` gemergt.

**Änderung:** `purchases` erhält Verkäufer-Snapshot (Art, Name, Plattform-Benutzername,
Anschrift, Ländercode), `external_order_id` und `seller_details_version`. Anlegen und
Entwurfsspeichern übernehmen die Felder und zählen die Version bei geänderten
Herkunftsangaben hoch. Die neue Funktion `update_purchase_seller_details` trägt
Herkunftsangaben auch bei abgeschlossenen Einkäufen nach, prüft Mitgliedschaft,
erlaubte Felder, Workspace-Zugehörigkeit und erwartete Version und schreibt ein
Fachereignis `purchase_seller_details_updated` mit Grund. Kosten, Positionen, Bestand
und Abschlussstatus bleiben unberührt. Formular zeigt Bezeichnung, Quelle,
Benutzername, Verkäuferart, Name, Anschrift, Angebotslink und Bestellnummer;
die Auswahl eines gespeicherten Verkäufers kopiert dessen Angaben bewusst. Detailseite
zeigt den Snapshot und öffnet bei abgeschlossenen Einkäufen einen Nachtragsdialog mit
Konfliktmeldung. Liste und Suche berücksichtigen einmalige Verkäufer.

**Prüfung:** Vollständige Vitest-Projekte node (1409) und angular (866), Typprüfung,
ESLint, Prettier, Test-Audit und Shared-UI-Prüfung mit Exitcode 0. Migration und
Supabase-Typen wurden im GitHub-Runner erzeugt; die Typdatei enthielt zusätzlich
bisher nicht übernommene Sniper-Tabellen. Von den neuen Datenbanktests waren im
dritten Lauf neun Prüfungen grün, darunter Nachtrag nach Abschluss, unveränderte
Kosten und Bestände sowie das Ereignis mit Grund.

**Nachtrag 18.09.2026:** Nach der Umstellung des Repositories auf öffentlich laufen die
GitHub-Prüfungen wieder. Migration, erzeugte Typen und Datenbanktests sind bestätigt:
49 Testdateien mit 1803 Prüfungen bestanden, darunter die neue Datei
`purchase_seller_details.test.sql`. Die committeten Typen sind byteweise identisch mit
den im Lauf erzeugten. Der vorläufige Workflow `purchase-seller-schema-preview.yml`
wurde vor dem Review entfernt.

**Offen:** `supabase db diff` scheitert am vorhandenen Schema (50_sniper.sql nutzt
`is_platform_operator` vor 99_platform_admin.sql); die Migration wurde deshalb aus den
Schemadateien zusammengestellt. Teil 2 (Belege) und Teil 3 (Einkauf drucken) folgen als
eigene PRs. Eine Sichtprüfung im Browser steht aus, weil das lokale Node unter dem
Minimum der Angular CLI liegt.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Dashboard mit Gewinn, Ausgaben, Vorzeitraum und offenen Kosten

**Auftrag:** Die Dashboard-Empfehlung vom 13.09. auf aktuellem `master` umsetzen.
Zweig `feat/dashboard-kpis` von `origin/master` (`a971725`). Entscheidungen des
Nutzers: Gewinn als Verkaufsgewinn; Vergleich mit dem gleich langen Zeitraum davor;
offene Kosten wie Shopify (nur Verkäufe mit Kosten im Gewinn, Umsatz ohne Kosten
getrennt) plus Einkaufsliste; Node lokal nicht aktualisieren. Konzept in
`docs/superpowers/specs/2026-09-17-dashboard-kpis-design.md`.

**Änderung:** Oben Gewinn, Umsatz und Ausgaben (Einkäufe nach Kaufdatum plus
Verkaufskosten), darunter Bestandswert, verkaufte Artikel und Marge. Jede
Zeitraumkennzahl mit Veränderung gegenüber dem Vorzeitraum (Prozent, bei der
Marge Prozentpunkte). Gewinn, Marge und Bestandswert bleiben bei einzelnen
offenen Kosten sichtbar und weisen den fehlenden Teil aus. Neuer Bereich
„Offene Kosten“ mit Einkauf, Grund und Link. Diagramm und Verkaufsjournal
unverändert; keine Schemaänderung.

**Prüfung:** Service-, Modell- und Komponententests einschließlich AXE; komplette
Vitest-Projekte node (1389) und angular (859), `npm run typecheck`, ESLint,
Prettier, `npm run test:audit` und Shared-UI-Prüfung mit Exitcode 0. Angular-Bau
und Sichtprüfung im Browser lokal nicht möglich (Node 22.16.0 unter dem Minimum der
Angular CLI); der Bau läuft im PR.

**Nachtrag zu PR #101:** Nach dem Deployment von `sha-a971725` lesend geprüft:
Nike, adidas und Ralph Lauren stehen auf `ready`/`ok`, Vinted-Zugang `ready`,
907 neue Funde in den ersten zehn Minuten, `failed=0`.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Gesperrten Vinted-Filter nachträglich freigegeben

**Auftrag:** Nachprüfung von PR #99 im Betrieb. Zweig
`fix/sniper-legacy-blocked-queries` von `origin/master` (`ea9ba63`).

**Befund (lesend auf dem Hetzner-Server):** Nach dem Deployment von `sha-ea9ba63`
steht `sniper_origin_state` wieder auf `ready`; in den ersten Minuten kamen 212 neue
Funde, Nike und adidas melden `ok`. Der am 16.09. gesperrte Filter „Ralph Lauren“
bleibt aber auf `blocked`: `dueQueries` schloss `blocked` schon in der
Datenbankabfrage aus, sodass der in #99 ergänzte Backoff in `isDue` die Zeile nie
erreichte. Der Test in #99 prüfte nur `isDue`, nicht den Abfragefilter.

**Änderung:** Die Abfrage schließt nur noch `invalid` aus. Alte `blocked`-Zeilen
laufen über den vorhandenen `forbidden`-Backoff und werden beim nächsten
erfolgreichen Abruf auf `ready` gesetzt.

**Prüfung:** Neuer Test auf die tatsächlichen Abfrageparameter schlug vorher fehl
und besteht danach; alle 186 Sniper-Unit-Tests grün, ESLint und Prettier sauber.
Wirkung im Betrieb steht bis zum Deployment aus.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Deutsche Dateinamen auf Englisch umgestellt

**Auftrag:** Die noch deutsch benannten Dateien umbenennen. Zweig
`refactor/english-filenames` von `origin/master` (`ca5a993`).

**Änderung:** Rein mechanischer Commit ohne Logikänderung. Zwölf Dateien unter
`src/` (u. a. `speicher-migration.ts` → `storage-migration.ts`,
`stammdaten-filter.ts` → `master-data-filter.ts`, `supabase-schreiben.ts` →
`supabase-write.ts`, `formular-bindungen.spec.ts` → `form-bindings.spec.ts`) und
`scripts/version-generieren.mjs` → `scripts/generate-version.mjs`; Importe,
npm-Lebenszyklusskripte und Pfadkommentare angepasst. Das npm-Skript
`version:generieren` heißt jetzt `version:generate`.

**Bewusst unverändert:** `deploy/erstinstallation.sh` und
`deploy/cron-aufraeumen-n8n-server`, weil der Server sie unter diesem Namen
verwendet; `landing/datenschutz` als öffentliche Adresse; „kleinanzeigen“ als
Markenname. Deutsche Funktions- und Variablennamen innerhalb der Dateien (z. B.
`uebernehmeAltenBrowserSpeicher`, `nurAktive`, `schreibeImHintergrund`,
`VERSION.nummer`) bleiben offen für einen eigenen Schritt.

**Prüfung:** `npm run typecheck` Exitcode 0, die zehn umbenannten Testdateien
bestehen (125 Tests), `npm run test:audit` Exitcode 0, ESLint und Prettier sauber,
Versionsskript unter neuem Namen ausgeführt. Kein Verweis auf die alten Namen
außerhalb der Dokumentationshistorie. Der Angular-Bau lief lokal nicht, weil das
installierte Node 22.16.0 unter dem Minimum der Angular CLI liegt; er wird im PR
geprüft.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Vinted-Bot nach einzelner 403 dauerhaft gesperrt

**Auftrag:** Der Vinted-Bot sammelt wieder keine Daten. Ursache finden und beheben.
Zweig `fix/sniper-forbidden-recovery` von `origin/master` (`ca5a993`).

**Befund (lesend auf dem Hetzner-Server, vom Nutzer freigegeben):** Container
`flipbase-sniper` läuft gesund, protokolliert aber alle fünf Sekunden nur
`origin_blocked reason=forbidden`. `sniper_origin_state` steht seit 16.09.2026
00:48:35 UTC auf `blocked` ohne Ablaufzeit. Auslöser war eine einzelne 403 beim
Filter „Ralph Lauren“ (`consecutive_failures = 1`); Nike und adidas waren
Sekunden zuvor erfolgreich. Letzter gespeicherter Fund 00:48:05 UTC. Um 15:17 UTC
lud der Bot die Vinted-Startseite erfolgreich (`vinted_last_success_at`), die
Sperre blieb trotzdem bestehen. Seit AP1 vom 15.09. setzt eine 403 Origin und
Filter dauerhaft auf `blocked`; weder Bot noch Admin-Bereich heben das auf, auch
nicht das Reaktivieren eines Filters oder ein Container-Neustart.

**Änderung:** Eine 403 startet eine ablaufende Abkühlphase (5, 10, 20, 40, dann
60 Minuten); danach prüft der vorhandene Einzelprobeabruf den Zugang. Bereits
gespeicherte Dauersperren gelten als abgelaufene Abkühlphase bzw. laufen über
den vorhandenen Backoff für `forbidden`, sodass sich der Produktionszustand nach
dem Deployment ohne Datenmigration löst. Zweiter Commit: Eine Probe-Reservierung,
die ein beendeter Prozess nicht freigeben konnte (z. B. Neustart beim
Deployment), wird nach fünf Minuten übernommen statt dauerhaft zu blockieren.
Keine Schema-, Migrations- oder Frontend-Änderung.

**Prüfung:** Neue Regressionstests für Retry-Politik, Scheduler, `isDue` und
`OriginStateStore` schlugen vor der Änderung fehl und bestehen danach; alle
185 Sniper-Unit-Tests grün, ESLint und Prettier sauber. Lokale Typprüfung meldet
nur das fehlende lokale `dotenv`-Paket, das ebenso auf `master` auftritt. Keine
Produktionsdaten geändert. Die Gegenprüfung gegen eine echte PostgREST-API und
die Wirkung im Betrieb stehen bis zum Deployment aus.

## 2026-09-17 – Claude Opus 5 (Anthropic) – Übersicht offener Punkte

**Auftrag:** Offene Punkte im Projekt zusammenstellen. Reine Analyse, keine
Code-, Schema- oder Zweigänderung.

**Befund:** Offene PRs #58 und #59 (je 128 Commits hinter `master`); auf `master`
fehlt weiterhin ein Eingabefeld für die Einkaufsbezeichnung, das #59 ergänzt.
Unvollständiger Übertragungszweig `feat/purchase-workflow-20260916` mit
Base64-Teilen und Einmal-Workflow. Die drei Fix-Zweige vom 05.09. sind laut
`git cherry` inhaltsgleich in `master` und nur noch aufzuräumen. Produktübergang laut
`2026-09-08-product-transition-checklist.md` noch nicht abgeschlossen
(`tracking_mode`/`line_kind` und Legacy-RPCs vorhanden). Neun deutsch benannte
Dateien in `src/app/core/services/`. Dashboard-Kennzahlen-Empfehlung vom 13.09.
nicht umgesetzt. Viele gemergte Zweige lokal und remote nicht aufgeräumt.

**Prüfung:** `git fetch --prune`, Vorsprung/Rückstand aller Zweige gegen
`origin/master`, `git cherry`, `gh pr list`/`gh issue list` (keine offenen Issues),
Suche nach Offen-Markierungen in Protokoll, Archiv, Plänen und Audits sowie
Stichproben im Code.

## 2026-09-16 – Claude Opus 5 (Anthropic) – Unbenutzte Einkaufskategorie entfernt

**Auftrag:** Offene Reste aus dem Plan
`docs/superpowers/plans/2026-09-14-product-categories-brands.md` erledigen, nachdem
Codex den Zweig `feat/product-categories-brands` am 14.09.2026 zu Ende geführt und
gemergt hat.

**Befund:** `purchase.service.ts` gab noch `single_item_category` und
`addItemToPurchase(…).category` als freien Kategorietext an den Artikel-Service
weiter. Kein Formular und kein Test übergibt diese Werte, und die Datenbank setzt
den Kategorietext seit dem Trigger `sync_category_brand_text()` ausschließlich aus
`category_id`. Die Felder waren damit wirkungslos und irreführend.

**Änderung:** Die vier Zeilen entfernt (Feld im Payload-Typ, Weitergabe beim
Einzelartikel, Parameter und Weitergabe in `addItemToPurchase`). Keine
Verhaltensänderung.

**Prüfung:** Prettier und ESLint auf `purchase.service.ts`, `npm run typecheck`
(Exitcode 0), `purchase.service.spec.ts`, `purchase-create-persistence.spec.ts`
und `purchase-detail.component.angular.spec.ts` (3 Dateien, 88 Tests bestanden).

## 2026-09-16 – ChatGPT – Abschluss der CI-Dokumentation

**Auftrag:** Die nach PR #96 offenen Aufräumpunkte angehen. Keine weitere
Testreduzierung oder Angular-Optimierung beauftragt.

**Änderung:** Den Abschluss der CI-Vereinfachung in das zentrale Protokoll
übernommen. Die vorherige vollständige Protokolldatei wird mit demselben Git-Blob
`17c987d1989d4a9db61bce71e897cf855d4c41d2` archiviert, nicht gekürzt oder
rekonstruiert. Der ursprüngliche
[Arbeitsstand des CI-Nachtrags](development/2026-09-16-lean-ci-log.md) bleibt als
historischer Zwischenstand erhalten; seine offene zentrale Übernahme ist durch
diesen Eintrag erledigt. Anwendung, Tests und Workflows bleiben unverändert.

**Prüfung:** PR #96 und dessen Merge-Stand erneut gelesen. Der Produktionsjob
bestätigt erfolgreiches Deployment und erfolgreiche öffentliche Versionsprüfung.
Die identische Blob-ID sichert den unveränderten Inhalt der bisherigen Historie.
Die Formatprüfung dieser Dokumentationsänderung erfolgt im regulären PR.

**Offen:** Der gemergte Remote-Branch `ci/lean-validation-20260916` konnte über die
verfügbare GitHub-Schnittstelle nicht gelöscht werden. Es wurde keine Löschung
behauptet und kein zusätzlicher Workflow für eine Löschung eingerichtet.

## 2026-09-16 – ChatGPT – CI auf Kernabläufe reduziert und ausgeliefert

**Auftrag:** Die automatische Prüfung einer kleinen SaaS-Lösung vereinfachen und
unnötige Pflicht- und Zusatzläufe entfernen.

**Änderung:** Sechs allgemeine Browser-Kernfälle statt 17. Die vier bestehenden
Daten- und Geldfälle bleiben inhaltlich unverändert. Zwei kurze Fälle prüfen
Appstart/Navigation sowie das Speichern und Wiederöffnen eines Artikels mit Bild.
Die 13 übrigen bisherigen Pflichtfälle bleiben gezielt manuell ausführbar. Der
erweiterte markierte Bestand umfasst einschließlich der zwei neuen Fälle 19
Tests.

Tägliche und wöchentliche Zusatzläufe sowie das separate Benchmark-System wurden
entfernt. Traces im Pflichtlauf sind nur zur gezielten Diagnose einschaltbar;
Fehler-Screenshots bleiben aktiv. Die Prüfung der Browser-Testauswahl wurde auf
zwei tatsächliche Listenaufrufe vereinfacht.

Der Schalter `application_tests` verhindert fachfremde Frontend-Testjobs bei reinen
Änderungen am Bot-Paket `services/sniper/`. V2-Nachweise binden die Wiederverwendung
an den geprüften Dateistand und Umfang. Bei Frontendänderungen bleiben alle
vorhandenen Node-, DOM- und Angular-Fälle aktiv. Die bestehenden Datenbank-, Bot-,
Image-, Migrations- und Deployment-Jobblöcke bleiben unverändert.

**Abwägung:** Zusätzliche Feature- und UI-Browsertests sind außerhalb des
Kernbestands nicht automatisch als Merge-Voraussetzung erzwungen. Bei relevanten
Änderungen sind sie gezielt vor dem Merge auszuführen und im PR zu dokumentieren.
Die Browserfälle verwenden Demo-Daten oder Mocks und ersetzen keine echten
Backend-Auth- oder RLS-Prüfungen. Details stehen in den
[aktuellen Testregeln](testing/lean-ci.md).

**Verifiziertes Ergebnis:**
[PR #96](https://github.com/GrischaTDev/flipbase/pull/96) wurde nach erfolgreicher
CI mit Merge-Commit `b3b41c63182403900aa3e853f04defed249a3500` integriert. Der
[PR-Prüflauf](https://github.com/GrischaTDev/flipbase/actions/runs/35097477856)
bestand im ersten Versuch: Formatierung, ESLint, Typen, actionlint,
Workflowprüfungen, Node/DOM, beide Angular-Gruppen, Datenbankprüfungen,
Migrations-Transaktionstest, Bot-Prüfungen, Build und Required checks.

Der vollständige Browserjob benötigte 1:58 statt zuvor 8:56 Minuten; der
Testschritt einschließlich Appstart 1:22 statt 8:18 Minuten. Die beobachtete
Differenz des Browserjobs beträgt 6:58 Minuten, rund 78 Prozent. Das ist ein
Vergleich regulärer Läufe mit bewusst unterschiedlichem Prüfumfang, keine
Beschleunigung derselben 17 Tests und keine Hochrechnung auf die gesamte
GitHub-Rechnung. Die erste Angular-Gruppe benötigte weiterhin 7:24 Minuten.

Der anschließende
[Produktionslauf](https://github.com/GrischaTDev/flipbase/actions/runs/35098360646)
hat das Image veröffentlicht, das Deployment ausgeführt und die öffentlich
ausgelieferte Version erfolgreich geprüft.

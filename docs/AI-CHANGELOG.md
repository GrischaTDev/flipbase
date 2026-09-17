# 🤖 KI-Änderungsprotokoll

Neue Sitzungen werden hier oben ergänzt: Datum, Assistent, Thema sowie Auftrag,
Änderung und tatsächlich ausgeführte Prüfungen. Die Vorgaben aus `AGENTS.md` gelten
unverändert.

Die vollständige bisherige Historie ist im
[Archiv bis zum Stand vom 16. September 2026](AI-CHANGELOG-archive-2026-09-16.md)
bytegleich erhalten. Das Archiv liegt im selben Ordner, damit seine relativen
Dateiverweise weiterhin denselben Ausgangspunkt haben.

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

# Betroffene Funktionen prüfen

Eine Galeriekorrektur prüft die Galerie und ihre tatsächlichen Abhängigkeiten.
Unabhängige Verkaufs- oder Einkaufsabläufe werden dabei nicht erneut
durchgespielt. Lokal genügt ein gezielter Entwicklungsnachweis; die ausgewählte
Freigabeprüfung erfolgt auf GitHub. Format, Lint, Typprüfung und der erforderliche
Angular-Bau bleiben bestehen.

## Ein Änderungsplan, zwei Ausführungsumfänge

`scripts/preflight.mjs` verbindet Änderungserkennung, Anwendungsauswahl und
Marketplace-Auswahl. Im PR zählt die GitHub-Basis, beim Hauptzweig-Push der
vorherige Commit. Lokal zählt der gemeinsame Vorfahr mit dem frisch abgerufenen
`origin/master`, einschließlich Index, Arbeitskopie und neuer nicht ignorierter
Dateien. Umbenennungen berücksichtigen alten und neuen Pfad. Git-Konflikte und
ein ungültiger Vergleich sind Fehler.

```bash
# Lokalen Entwicklungsumfang und CI-Freigabeumfang anzeigen
npm run preflight:plan

# Nur den lokalen Entwicklungsumfang ausführen
npm run preflight

# Native Anbieter-/Erweiterungsbrowser ausdrücklich lokal hinzunehmen
npm run preflight -- --native

# Vollständigen ausgewählten Umfang bewusst nachbauen
npm run preflight -- --ci

# Anderer Zielzweig oder maschinenlesbarer Plan
npm run preflight:plan -- --base origin/master
npm run preflight:plan -- --json
```

`--full` ist ein Alias für `--ci`. Die Planansicht ist kein Testnachweis.
Der Standardlauf führt schnelle betroffene Tests, Qualität und den nötigen Bau
aus. Er verlangt keinen lokalen Nachbau von GitHub-Datenbanken, Browsermatrizen,
Workflowfixtures oder privilegierten Images. Diese Bereiche bleiben separat im
Freigabeplan sichtbar; ihre planmäßige Ausführung nur in CI ist kein lokaler
Fehler. Ein tatsächlich ausgewählter lokaler Fehler oder ein fehlendes Werkzeug
wird dagegen nicht als Erfolg gewertet.

Der vollständige Aufruf benötigt alle Voraussetzungen seiner Auswahl. Er
übernimmt Fehlercodes der Kindprozesse und bleibt bei einer nicht ausführbaren
Pflichtintegration unvollständig. Marketplace-Images sind weiterhin ausschließlich
auf dem dokumentierten GitHub-gehosteten Linux-Wegwerfrunner erlaubt; `--ci`,
`--full` oder `CI=true` heben das nicht auf. Details stehen unter
[Voraussetzungen und Hostgrenzen](lean-ci.md#ausdrücklicher-vollständiger-nachbau-und-voraussetzungen).

## Anwendungstests und Fachzuordnung

`scripts/affected-tests.mjs` liest lokale TypeScript-/JavaScript-Imports,
Reexports und relative Angular-Ressourcen. Rückwärts verfolgte Abhängigkeiten
beziehen Verbraucher gemeinsamer Bausteine ein. Neue Quellen und Tests zählen
mit; ignorierte Abhängigkeiten und Bauausgaben nicht. Routensammlungen und
übergreifende Container begrenzen die Ausbreitung auf unabhängige Funktionen.
Explizite Typimporte bleiben für Unit- und Typprüfung sichtbar, erweitern aber
keinen Browser-Laufzeitgraphen. Reine Typdateien verlangen keinen Seitenrundgang.
Indirekt erreichte API-/Kontosammler verteilen eine einzelne Fachänderung nicht
erneut auf alle unabhängigen Funktionen. Direkte Änderungen dieser Sammler
behalten ihren ausdrücklich zugeordneten Schutzumfang.

- **Anwendungstests:** Direkt geänderte oder abhängige Node-, DOM- und
  Angular-Dateien; nur benötigte Suiten erhalten einen Job. Lokal prüfen
  generische Controls ihre eigenen Unitverträge, in CI zusätzlich alle
  abhängigen Komponenten. Bei breiten CI-Plänen werden Tests auf Teilgruppen verteilt.
- **Scripts:** Änderungen wählen passende Geschwistertests lokal. Die vollständigen
  Workflowverträge laufen bei einschlägigen Script-, Workflow-, Deployment-,
  Konfigurations- und Lockfileänderungen in CI.
- **Fachbrowser:** `featureSpecs` und konkrete Marketplacebereiche wählen
  bestehende betroffene Abläufe. Ein kleiner allgemeiner Kern sichert breite
  Änderungen ab; die umfassende Layoutregression ist keine Standardzugabe.
- **Geänderte Browserdateien:** Dieselben ausdrücklich registrierten
  Repräsentanten wie bei einer Fachänderung. Eine Testdateiänderung erzwingt
  nicht sämtliche Parameterkombinationen; einzigartige Fehleraussagen und neue
  oder unbekannte Titel bleiben erhalten.
- **PWA und Dienste:** Eigene CI-Prüfungen für einschlägige Service-Worker-,
  Offline-, Update-, Push-, Worker-, Sniper- und Landingänderungen.

| Änderung                        | Erwarteter Nachweis                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Galerie oder deren HTML         | Abhängige Anwendungstests und repräsentativer Artikelablauf                         |
| Altersberechnung eines Inserats | Alters-/Artikeltests; keine gesamte Vinted-Arbeitsfläche                            |
| Einkaufsübersicht               | Betroffener Einkaufsablauf; keine unabhängigen Verkäufe                             |
| Gemeinsames Formular            | Betroffene Tests und repräsentative Verbraucher; Entwürfe bei entsprechendem Risiko |
| `public/sw.js`                  | PWA-Scriptprüfungen und Produktions-PWA in CI                                       |
| Dokumentation und `AGENTS.md`   | Format und vorgeschriebener Lintnachweis; keine Anwendungstests und kein Bau        |
| Rechte oder Datenbankschema     | Einschlägige Rechte-, Datenintegritäts- und Migrationsfälle in CI                   |
| Worker-Formularcode             | Zugehörige native Anbieterfixtures und notwendige Dienst-/Imageprüfungen            |
| Session-`.dockerignore`         | Session-Imageprüfung wegen des veränderten Baukontexts                              |

Globale oder unbekannte Abhängigkeiten wählen schnelle Anwendungstests
konservativ breit. Jeder geänderte unbekannte gemeinsame Pfad wird einzeln
bewertet; eine zusätzliche Featureänderung darf den Rückfall nicht verdecken.
Rechte, Kontentrennung, Migrationen, Originalerhalt und Anbieter-Schreibgrenzen
behalten ihre einschlägigen Pflichtfälle. Neue Funktionen müssen passend
zugeordnet werden. Der Selektor erfindet keine fehlende Browserabdeckung.

## Browserumfang nach Risiko

`scripts/browser-test-selection.mjs` enthält den ausdrücklich gewählten Kern
und die Regeln für repräsentative Varianten. `buildBrowserMatrix` bildet daraus
die CI-Gruppen. Die vorhandenen vollständigen Tests bleiben für Diagnose und
bewusste Regression erhalten.

| Projekt         | Inhalt                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| `core-smoke`    | Kleiner ausdrücklich benannter allgemeiner Kern für breite Änderungen        |
| `ui-layout`     | Sechs gemeinsame UI-Verbraucher ohne Datenbank                               |
| `ui`            | Betroffene geprüfte UI-Fixtures ohne Datenbank                               |
| `changed-ui`    | Direkt geänderte UI-Fixtures mit registrierten Repräsentanten ohne Datenbank |
| `layout`        | Ausdrücklich gewählte Layoutfälle mit Backend                                |
| `chromium`      | Betroffene Fachabläufe mit repräsentativen Varianten                         |
| `changed-tests` | Direkt geänderte Backendfälle mit registrierten Repräsentanten               |

Die konkrete Fachauswahl hat Vorrang vor Kern und Layout. Direkt geänderte
Browserdateien haben wiederum Vorrang vor den anderen Gruppen. So erscheinen
Fälle nicht mehrfach in verschiedenen Gruppen. Auflistungstests prüfen
nichtleere Gruppen, eindeutige Zuordnung und den erwarteten Umfang. Eine
Testauflistung bestätigt die Auswahl, nicht das Browserverhalten.

Eine normale UI-Gruppe enthält höchstens zwei zugeordnete Dateien. Drei
betroffene UI-Dateien laufen daher in zwei parallelen Teilgruppen, statt ihre
verschiedenen Abläufe nacheinander in einem Job zu sammeln. Dies ist ein
Aufteilungsbudget, keine Zusage einer bestimmten Minutenzahl. Innerhalb der
Gruppe bleiben ein Worker, gleiche Erwartungen und derselbe ausgewählte
Fallumfang bestehen; direkt geänderte Fälle behalten ihre eigene Gruppe.

Die datenbankfreien Gruppen sind auf die ausdrücklich geprüfte Dateiliste in
`browser-test-selection.mjs` begrenzt. Neue Dateien erhalten diese Einstufung
erst nach Prüfung ihrer API- und Sitzungsfixtures. Backendgruppen behalten die
echte Anmeldung und Datenbank. `PLAYWRIGHT_BASE_URL` kann für UI-Gruppen eine
ruhende eigene Vorschau vorgeben; dann startet Playwright keinen weiteren Server.

Nicht jede Änderung benötigt jede Breite, beide Farbschemata und Maus/Touch.
Repräsentative Telefon-/Desktopvarianten und zusätzliche AXE-, Fokus- oder
Bedienfälle nach der tatsächlich geänderten Oberfläche auswählen. Ein
Darstellungsfehler erhält seine fehlerauslösende Variante; fachliche
Fehlerfälle behalten ihre Erwartungen. Ein zusätzlicher lokaler Linuxlauf ist
bei konkreten Plattform- oder Ressourcenfragen sinnvoll, keine pauschale
Voraussetzung für PWA- oder UI-Änderungen.

Bekannte mehrfach parametrisierte Geschäftsabläufe laufen einmal mit dem
explizit gewählten Repräsentanten; echte Layoutfamilien behalten bis zu zwei
Varianten. Bedingte Aussagen im Testkörper bestimmen die Auswahl mit: Die
Mosaikprüfung braucht beispielsweise ihre zusätzlichen Desktop-/Status- und
Fotogegenproben. Es gibt keinen allgemeinen Filter für „dark“ oder eine beliebige
Bildschirmbreite. Die vollständige Matrix bleibt in der manuellen Regression
verfügbar. Ein neuer eigenständig benannter Fehlerfall wird ohne Manifeständerung
nicht unterdrückt.

Browserprüfungen laufen gegen eine ruhende Vorschau mit synthetischen Daten.
CI-Matrixjobs verwenden eigene lokale Datenbanken und frische Testkonten.
Die Fixture erneuert zu kurze Sitzungen vor einem Browserkontext und teilt
keine rotierenden Refresh-Tokens zwischen Workern. Ausdrücklich anonyme
Testzustände bleiben erhalten. Produktionsanmeldung und Sitzungsgrenzen werden
für schnellere Tests nicht verändert.

Leere Auswahl startet keinen Browserjob und zählt nicht als bestandener
Browsertest. Kein `--passWithNoTests` und keine abgeschwächten Erwartungen.
Ein fehlgeschlagener ausgewählter Pflichtjob verhindert die Freigabe.

## Marketplace-Erweiterung und Images

`scripts/marketplace-check-selection.mjs` verfolgt lokale Imports vorhandener
nativer Workerbrowserdateien transitiv. Direkt geänderte Fixtures und Tests
wählen ihre Verbraucher; globale Paket-/Prüfänderungen wählen alle relevanten
nativen Fälle. Anbieter-Schreibprüfungen bleiben synthetisch und erhalten ihre
Konten-, Gebühren-, Kontingent-, Originalbild- und Wiederholungsschutzgrenzen.

Die Kleinanzeigen-Erweiterung läuft in ihrem eigenen CI-Job und wird nicht in
jedem Anwendungsbrowser-Shard wiederholt. Native Workerbrowser verwenden ihre
gesperrte Playwright-Version. Auf GitHub nutzen Installation, Sandboxvorbereitung
und Tests denselben temporären Browserpfad. Ein erforderliches AppArmor-Profil
ist auf den exakten Browserpfad begrenzt; die Chromium-Sandbox bleibt aktiv.
Lokales Ausführen dieses Hostsetups ist ausgeschlossen.

Die Imageauswahl berücksichtigt echte Docker-COPY-Quellen und Ignoredateien.
Worker-/Brokerintegration und Sandbox-/Profilprüfungen teilen sich Sessionbau
und Import-Smoke. Session-Stopp, Isolation und Veröffentlichungsgrenzen bleiben
Bestandteil der echten Imageprüfungen. PR-Prüfworkflow und der ausschließlich
auf `master` zulässige Publisher behalten getrennte Rechte.

## Nachweis und bewusste Gesamtprüfung

Lokale Nachweise und ausstehende CI-Freigabe im PR getrennt benennen. Vor dem
Merge müssen alle ausgewählten CI-Pflichtjobs erfolgreich sein. Der
Wiederverwendungsnachweis bindet Git-Dateibaum und Auswahlhash einschließlich
Marketplaceumfang. Alte oder abweichende Nachweise ersetzen keinen aktuellen
Lauf. Ohne passenden Nachweis prüft CI nach dem Merge erneut.

Einzelne Pfade lassen sich für die Diagnose weiterhin ausdrücklich wählen:

```bash
node scripts/affected-tests.mjs --paths src/app/shared/components/product-gallery/product-gallery.component.html
```

`AFFECTED_TEST_PLAN` übergibt den Plan an `run-affected-tests.mjs`;
`browser --list` kontrolliert die Auswahl ohne Browserstart. Neue oder
verschobene Tests benötigen auch einen passenden Registrierungs-/Auswahltest.
Ein einzeln bestandener Fall beweist nicht seine richtige CI-Zuordnung.

Vor Beta-Meilensteinen oder bei begründetem Diagnosebedarf die vollständige
Regression bewusst starten. `npm run test:e2e:pr` bleibt als Kern-Diagnoselauf,
`npm run test:e2e:nightly` beziehungsweise „Optional quality checks“ als
vollständiger manueller Browserlauf verfügbar. Es gibt keinen täglichen oder
wöchentlichen Zeitplan.

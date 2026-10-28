# Betroffene Funktionen prüfen

Eine Änderung an der Fotogalerie löst ihre bestehenden Regressionen aus, keinen
unabhängigen Verkaufsablauf. Globale oder unsicher zuordenbare Änderungen
behalten eine breite Prüfung. Format, Lint, Typprüfung und der erforderliche
Anwendungsbau bleiben bestehen.

## Ein Plan für lokalen Vorabcheck und CI

`scripts/preflight.mjs` verbindet die vorhandene Änderungserkennung, die
Anwendungsauswahl und die Marketplace-Auswahl. In einem PR wird mit der von
GitHub vorgegebenen Basis verglichen, beim Hauptzweig-Push mit dem vorherigen
Commit. Lokal wird der gemeinsame Vorfahr mit `origin/master` verwendet;
zusätzlich werden Index, Arbeitskopie und neue nicht ignorierte Dateien erfasst.
Umbenennungen berücksichtigen alten und neuen Pfad. Unaufgelöste Konflikte oder
ein ungültiger Vergleich führen zu einem Fehler.

```bash
# Gesamten betroffenen Prüfumfang nur anzeigen
npm run preflight:plan

# Diesen Umfang ausführen
npm run preflight

# Anderer Zielzweig oder maschinenlesbarer Plan
npm run preflight:plan -- --base origin/master
npm run preflight -- --json
```

Die Planansicht erzeugt keinen erfolgreichen Testnachweis. Der ausführende
Vorabcheck bricht bei fehlenden benötigten Werkzeugen oder einem fehlgeschlagenen
Kindprozess ab. Er übernimmt dessen Fehlercode. Ausgewählte Marketplace-Images
bleiben im lokalen Plan sichtbar, können wegen ihrer privilegierten Hostprüfungen
aber nur auf dem wegwerfbaren GitHub-gehosteten Linux-Runner ausgeführt werden.
Lokal bricht der Vorabcheck dafür vor den Ausführungsbefehlen als **unvollständig**
ab; auch `CI=true` hebt diese Grenze nicht auf. Extension- und native
Worker-Browserbefehle bleiben separat lokal nutzbar. Die gemeinsamen Befehle stehen
in `ci-checks.mjs`, `run-affected-tests.mjs` und `run-marketplace-checks.mjs`;
GitHub stellt davor Node, Browser, Deno beziehungsweise lokale Supabase bereit.
Die [Voraussetzungen](lean-ci.md#lokale-voraussetzungen) gelten auch lokal.

## Anwendungstests und Fachzuordnung

`scripts/affected-tests.mjs` liest lokale TypeScript-/JavaScript-Imports,
Reexports und relative Angular-Ressourcen. Die Abhängigkeiten werden rückwärts
verfolgt: Änderungen eines gemeinsamen Bausteins beziehen seine Verbraucher ein.
Die Dateiaufnahme enthält auch neue Quellen und Tests, aber keine ignorierten
Abhängigkeiten oder Bauausgaben.

- **Anwendungstests:** Direkt geänderte oder abhängige Node-, DOM- und
  Angular-Dateien. Nur benötigte Suiten bekommen einen Job. Breite Angularpläne
  werden mit höchstens 60 Dateien pro Teilgruppe aufgeteilt.
- **Fachbrowser:** Die Zuordnung `featureSpecs` und konkrete Marketplacebereiche
  wählen vorhandene Browserdateien. Fachliche Fehler- und Grenzfälle werden
  nicht durch historische Tags ausgeschlossen.
- **Geänderte Browserdateien:** Alle enthaltenen Fälle und Varianten laufen in
  `changed-tests`, auch wenn sie keine Markierung tragen.
- **PWA:** Ein eigener Job erhält die zwei Produktions-Testbauten und prüft
  Service Worker, Offline-Einkauf, Entwürfe, Update und Push-Navigation.
- **Dienste:** Worker-, Push-, Sniper- und Landingprüfungen werden für ihren
  Bereich beziehungsweise bei Änderungen gemeinsamer Prüfwerkzeuge ausgewählt.

| Änderung                        | Erwartete Auswahl                                                       |
| ------------------------------- | ----------------------------------------------------------------------- |
| Galerie oder deren HTML         | Artikel-Browserfälle und abhängige Anwendungstests                      |
| Altersberechnung eines Inserats | Alters-/Artikeltests, keine ganze Vinted-Arbeitsfläche                  |
| Einkaufsübersicht               | Einkaufstests ohne unabhängige Verkaufsabläufe                          |
| Gemeinsames Formular            | Betroffene Einsatzstellen, gegebenenfalls Offline-Entwürfe              |
| `public/sw.js`                  | Produktions-PWA und PWA-Skriptprüfungen                                 |
| Dokumentation und `AGENTS.md`   | Markdown-Formatierung                                                   |
| Worker-Formularcode             | Zugehörige native Browserfixtures und notwendige Dienst-/Imageprüfungen |
| Session-`.dockerignore`         | Session-Imageprüfung, weil sich der tatsächliche Baukontext ändert      |

Routensammlungen und übergreifende Container bilden bewusst Grenzen. Ein
indirekter Verbraucher soll nicht jede unabhängige Unterfunktion auswählen.
Direkte Änderungen dieser Sammlungen erhalten den breiteren Umfang.

Globale Konfiguration, zentrale Anmeldung/Rechte, Schema, App-Provider,
gemeinsame Testvorbereitung und unbekannte Bereiche wählen konservativ breit.
Bei unbekannten gemeinsamen Dateien wird jeder geänderte Pfad einzeln geprüft;
eine zusätzliche unabhängige Featureänderung kann diesen Rückfall nicht verdecken.
Neue Funktionen müssen der passenden Fachzuordnung zugeordnet werden. Eine
fehlende Browserabdeckung wird durch den Selektor nicht erfunden.

## Browsergruppen ohne verlorene oder doppelte Fachfälle

`scripts/browser-test-selection.mjs` enthält den ausdrücklich gewählten Kern
und die begrenzten Layoutfamilien. `buildBrowserMatrix` ist die gemeinsame
Quelle für lokale Aufrufe und CI-Matrix.

| Projekt         | Inhalt                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| `core-smoke`    | 20 ausdrücklich benannte zentrale Abläufe für breite Änderungen                |
| `layout`        | Markierte Fälle der gemeinsamen Layoutdateien, ohne bereits gewählte Kernfälle |
| `chromium`      | Fachlich zugeordnete Regressionen                                              |
| `changed-tests` | Vollständige direkt geänderte Browserdateien                                   |

Eine konkret betroffene Fachdatei hat Vorrang vor Kern und Layout. Ihre Fälle
werden aus diesen beiden Gruppen herausgenommen und vollständig der Fachgruppe
zugeordnet. Dadurch bleiben beispielsweise unmarkierte Bankzuordnungs- und
Speicherfehlerfälle erhalten, wenn zugleich das Lockfile geändert wurde.
Direkt geänderte Testdateien haben wiederum Vorrang vor allen anderen Gruppen.

Ausschließlich bekannte mehrfach parametrisierte Layoutfamilien reduzieren im
normalen Fachlauf die zusätzlichen 320-/834-Pixel-Varianten. 390/1440 Pixel und
beide Farbschemata sowie besondere Fehler-, Fokus- und Bedienungsfälle bleiben.
Bei direkt geänderten Testdateien gilt diese Einschränkung nicht. Die vollständige
manuelle Regression behält sämtliche Varianten.

Kern und Layout erhalten jeweils eine Teilgruppe. Umfassende Fach- und
Änderungsgruppen verwenden bis zu drei Teilgruppen, höchstens so viele wie
Dateien; gezielte Fachgruppen verwenden eine. Jeder tatsächliche Aufruf startet
sein globales Setup mit frischer Anmeldung. Die CI gibt jedem Matrixjob außerdem
eine eigene lokale Datenbank. Eine explizit übergebene Teilgruppe wird nicht
nochmals aufgeteilt.

Leere Auswahl startet keinen Browserjob. Der Runner akzeptiert sie nicht als
bestandenen Test und verwendet kein `--passWithNoTests`. Fehler stoppen den
lokalen Gesamtaufruf; CI sammelt die Ergebnisse der unabhängigen Matrixjobs.

## Marketplace-Erweiterung und Images

`scripts/marketplace-check-selection.mjs` verfolgt die lokalen Imports der
bestehenden nativen Workerbrowserdateien transitiv. Direkt geänderte Fixtures
und Tests wählen ihre Verbraucher. Globale Paket-/Prüfänderungen wählen alle
nativen lokalen Fälle. Die besondere Session-Stopp-Prüfung bleibt Bestandteil
des echten Session-Imagechecks.

Die Kleinanzeigen-Erweiterung läuft einmal im eigenen Job und wird nicht mehr
in jedem Anwendungsbrowser-Shard wiederholt. Die Imageauswahl erfasst die
wirklichen Docker-COPY-Quellen und Ignoredateien. Worker-/Brokerintegration und
Sandbox-/Profilprüfungen teilen sich einen Sessionbau und einen Import-Smoke.
Alle bestehenden Prüfungen der Isolation und Veröffentlichungsgrenzen bleiben.

Der wiederverwendbare Prüfworkflow `marketplace-worker-image.yml` enthält
ausschließlich Jobs mit Leserechten. Der separate `marketplace-image-publish.yml`
veröffentlicht nur nach manuellem Start auf `master`: zuerst Extension und native
Workerbrowser, dann der gemeinsame Imagebau samt Prüfungen, danach Login und Push
derselben Images im selben Job. Änderungen an beiden Workflowdateien wählen alle
Marketplace-Prüfbereiche. Schreibrechte des Publishers erreichen den PR-Aufrufer
nicht; GitHub validiert auch bedingt ausgeschlossene Jobs eines aufgerufenen Workflows.

## Nachweis und vollständige Regression

Die Sammelprüfung verlangt Erfolg für jeden ausgewählten Job. Fehler, Abbrüche
oder unerwartetes Überspringen verhindern die automatische Veröffentlichung.
Eine erzwungene Merge-Sperre durch Branch Protection wird für GitHub Free im
privaten Repository nicht vorausgesetzt.

Ein wiederverwendbarer PR-Nachweis bindet den Dateibaum und den SHA-256-Wert aus
Bereichsauswahl, Anwendungsplan und Marketplaceplan. Andere Auswahlen oder alte
Nachweise ersetzen keine erneute Prüfung. Ohne passenden Nachweis wird der
aktuelle Umfang nach dem Merge ausgeführt.

Für eine Diagnose können einzelne Pfade weiterhin ausdrücklich gewählt werden:

```bash
node scripts/affected-tests.mjs --paths src/app/shared/components/product-gallery/product-gallery.component.html
```

Mit `AFFECTED_TEST_PLAN` kann `run-affected-tests.mjs` denselben Plan ausführen;
`browser --list` prüft die Auswahl ohne Browserstart. Die Auswahltests benutzen
hierfür die echte Playwright-Auflistung, einschließlich gemischter Änderungen,
vollständiger geänderter Dateien und nichtleerer Teilgruppen.

`npm run test:e2e:pr` führt den festen Kern als allgemeinen Diagnoselauf aus.
Die vollständige Browserregression bleibt über `npm run test:e2e:nightly`
beziehungsweise „Optional quality checks“ manuell verfügbar. Es gibt keinen
zusätzlichen Zeitplan und keine still gekürzten Pflichtprüfungen.

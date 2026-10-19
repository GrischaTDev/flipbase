# Betroffene Funktionen prüfen

Bei normalen Änderungen laufen die betroffenen Tests. Ein fertiger Verkaufsablauf
wird bei einer unabhängigen Änderung an der Fotogalerie nicht erneut durchgespielt.
Lint, Formatierung, Typprüfung und der erforderliche Bau bleiben bestehen.

## Auswahl

`scripts/affected-tests.mjs` vergleicht den PR mit seiner Basis beziehungsweise
einen Push mit seinem vorherigen Stand. Es liest lokale TypeScript-/JavaScript-
Verweise, Reexports und relative Angular-Ressourcen. Die Abhängigkeiten werden
rückwärts verfolgt: Wird ein gemeinsamer Baustein geändert, werden auch seine
Verbraucher berücksichtigt. Gelöschte Pfade bleiben dabei auflösbar.

- **Anwendungstests:** Nur direkt geänderte oder davon abhängige Modell-, DOM-
  und Angular-Testdateien. Nur benötigte Testsuiten bekommen einen Job.
  Die vollständige Angular-Auswahl wird mit höchstens etwa100 Dateien je Gruppe
  aufgeteilt. Alle Dateien bleiben enthalten; das Zehn-Minuten-Limit je Job bleibt bestehen.
- **Browserfälle:** Die berührten Funktionen werden über die ausdrücklich
  gepflegte Zuordnung `featureSpecs` und Marketplace-Unterbereiche bestehenden
  Browserdateien zugeordnet. Bei gezielter Auswahl laufen die zugehörigen Dateien
  vollständig. Direkt geänderte Browserdateien werden ebenfalls vollständig geprüft.
- **PWA:** Ein eigener paralleler Job prüft Service Worker, Offline-Einkauf,
  Entwürfe, Push-Navigation und Installation, wenn diese Bereiche oder deren
  Abhängigkeiten geändert wurden. Zwei echte Produktions-Testbauten bleiben erhalten.
- **Dienste:** Worker-, Push- und Landingpage-Prüfungen im Qualitätsjob werden
  nur für ihren Bereich oder breite Konfigurationsänderungen ausgeführt.

Beispiele am aktuellen Repository:

| Änderung                        | Erwartete Auswahl                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| Fotogalerie oder deren HTML     | Artikel-Browserfälle und abhängige Anwendungstests; kein Einkauf, Verkauf oder PWA-Lauf |
| Altersberechnung eines Inserats | Alters-/Artikeltests; keine gesamte Vinted-Arbeitsfläche                                |
| Einkaufsübersicht               | Einkaufstests; keine unabhängigen Verkaufsabläufe                                       |
| Gemeinsam genutztes Formular    | Abhängige Einsatzstellen, gegebenenfalls auch Offline-Entwürfe                          |
| `public/sw.js`                  | Produktions-PWA und PWA-Skriptprüfungen                                                 |
| Dokumentation und `AGENTS.md`   | Dokumentationsprüfung                                                                   |

Routensammlungen und übergreifende Vinted-Container dürfen durch eine indirekte
Berührung nicht wieder sämtliche darunterliegenden Funktionen auswählen. Werden
diese Sammlungen selbst geändert, ist der breitere Funktionsbereich betroffen.

Globale Konfiguration, zentrale Anmeldung/Rechte, Schemaänderungen und unbekannte
Dateibereiche wählen vorsichtshalber den bisherigen umfassenden PR-Prüfumfang.
Auch Laufzeitabhängigkeiten der zentralen App-Provider und der globalen
Testvorbereitung zählen dazu. Lazy-Routen bilden dabei eine Grenze, damit eine
Änderung an einem einzelnen Bildschirm nicht zum globalen Appstart hochgestuft wird.
Eine neue Funktion oder ein neuer gemeinsam verwendeter Dienst muss bei der
Zuordnung berücksichtigt werden. Neue Testdateien allein beweisen keine neue
Abdeckung. Bereiche ohne bestehende Browserfälle erhalten dadurch keine erfundene
Browserabsicherung; fehlende Abdeckung ist im PR ausdrücklich zu benennen.

## Lokal prüfen

Die geplante Auswahl lässt sich ohne Browserstart anzeigen:

```powershell
node scripts/affected-tests.mjs --paths src/app/shared/components/product-gallery/product-gallery.component.html
```

Die Ausgabe ist ein JSON-Plan. Mit diesem Plan können dieselben CI-Befehle laufen:

```powershell
$env:AFFECTED_TEST_PLAN = node scripts/affected-tests.mjs --paths src/app/shared/components/product-gallery/product-gallery.component.html
node scripts/run-affected-tests.mjs unit angular 1/1
node scripts/run-affected-tests.mjs browser --list
```

Der Browserlauf benötigt zum tatsächlichen Ausführen weiterhin die normale lokale
Testumgebung. `--list` prüft die Auswahl ohne Browserstart. Eine leere Auswahl
überspringt den betreffenden CI-Job; der Runner akzeptiert sie nicht als bestandenen
Test und verwendet kein `--passWithNoTests`.

Die Zuordnung wird durch `scripts/affected-tests.test.mjs` und die echte
Playwright-Auflistung in `scripts/playwright-pr-smoke.test.mjs` abgesichert. Änderungen
an Testauswahl, Workflows, Abhängigkeiten oder Testkonfiguration brauchen selbst
den breiten Prüfumfang. Dieser einmalige Lauf ist kein Zeitnachweis einer späteren
gezielten Funktionsänderung.

## Frische Sitzung je Browsergruppe

Der Browserstarter führt die Standardauswahl (`chromium`) und vollständig
geänderte Dateien (`changed-tests`) nacheinander als getrennte Playwright-Aufrufe
aus. Jeder Aufruf durchläuft das globale Setup und erhält eine eigene frische
Testsitzung. Ein langer erster Lauf kann dadurch die Anmeldung der zweiten Gruppe
nicht verbrauchen. Die umfassende Standardauswahl wird zusätzlich in drei
gleichmäßig verteilte Teilgruppen aufgeteilt; auch jede dieser Teilgruppen
startet mit eigenem globalen Setup und frischer Anmeldung. Eine reine Auflistung,
gezielte Auswahl oder ausdrücklich übergebene Teilgruppe wird nicht nochmals
unterteilt. Der Test der echten Playwright-Auflistung bestätigt, dass die drei
Teilgruppen sämtliche vorgesehenen Fälle genau einmal enthalten.
Die ausgewählten Fälle, Wartezeiten und Schutzprüfung der
verbleibenden Sitzungsdauer bleiben unverändert. Ein Fehler stoppt vor der
nächsten Gruppe und bleibt der Exitcode des Gesamtaufrufs.

## Freigabe und vollständige Regression

Die CI-Sammelprüfung verlangt Erfolg für jeden ausgewählten Job und einen
übersprungenen Status für nicht ausgewählte Jobs. Fehler oder Abbrüche eines
ausgewählten Jobs blockieren weiterhin Veröffentlichung und Merge.

Ein wiederverwendbarer PR-Nachweis bindet Dateibaum, technische Prüfbereiche einschließlich der Dienstauswahl und
einen SHA-256-Wert des konkreten Testplans. Ein Nachweis mit anderer Auswahl oder
altem Format ersetzt keine erneute Prüfung. Bei fehlendem Nachweis wird der für
den Merge tatsächlich betroffene Umfang erneut geprüft.

Der bisherige vollständige PR-Lauf bleibt mit `npm run test:e2e:pr` verfügbar;
die erweiterte Regression mit `npm run test:e2e:nightly` beziehungsweise dem
Workflow „Optional quality checks“. Es wird kein neuer Zeitplan eingerichtet.
Umfassende Prüfungen werden gezielt bei breiten Änderungen, Fehlersuche oder auf
ausdrücklichen Wunsch ausgeführt.

# CI-Wartezeit vor dem Merge

Stand: 15. Oktober 2026. Untersuchung von Juna auf ausdrücklichen Nutzerauftrag.
Keine Änderung an Workflows, Testauswahl oder Pflichtprüfungen.

## Bewertung und Ziel

Rund 23 Minuten Wartezeit auf jeden normalen PR sind für Flipbase ein zu langer
Standard. Eine universelle Grenze nach Repositorygröße gibt es nicht. DORA fordert
Feedback in wenigen Minuten und nennt ungefähr zehn Minuten als Obergrenze;
Martin Fowler nennt zehn Minuten für die meisten Projekte als erreichbare Richtlinie.
Dies ist eine Empfehlung für die schnelle Integrationsprüfung, keine verbindliche
Höchstzeit für jede denkbare vollständige Release-, Last- oder Langzeitprüfung.

Für Flipbase vorgeschlagene Ziele, noch keine gemessenen Zusagen:

- Zunächst alle bestehenden Pflichtprüfungen in höchstens zehn Minuten abschließen.
- Danach bei üblichen Änderungen fünf bis acht Minuten anstreben.
- Schnelle Fehler zu Syntax, Typen und Fachlogik früh sichtbar machen.
- Seltene umfassende Prüfungen dürfen länger dauern; welche Prüfung zwingend vor
  jedem Merge laufen muss, ist eine eigene fachliche Entscheidung.

## Messung

Quelle: GitHub-Actions-Metadaten und vollständige Joblogs für
[PR #423](https://github.com/GrischaTDev/flipbase/pull/423),
[Lauf 38801587028](https://github.com/GrischaTDev/flipbase/actions/runs/38801587028).
PR-Erstellung bis zum erfolgreichen Ende: 23 Minuten 43 Sekunden.
Der eigentliche Merge wurde erst nach Abschluss ausgeführt und dauerte nur wenige
Sekunden. Die Wartezeit wird durch die vorhergehenden Prüfungen bestimmt.

| Browserjob-Schritt                                              |       Dauer |
| --------------------------------------------------------------- | ----------: |
| npm-Abhängigkeiten installieren                                 |        11 s |
| Chromium/WebKit und Systempakete installieren                   |        51 s |
| Lokales Supabase starten                                        |  1 min 54 s |
| PR-Browserlauf: 160 erfolgreiche Fälle, ein Worker              | 16 min 14 s |
| PWA-Skriptprüfungen                                             |        23 s |
| Zwei Produktions-Testbauten und PWA-Browserfälle                |  3 min 14 s |
| Supabase stoppen                                                |        23 s |
| Gesamter Browserjob einschließlich kleiner Einrichtungsschritte | 23 min 22 s |

Der PR-Browserlauf startet zusätzlich den Angular-Entwicklungsserver. Die gemessenen
16 Minuten 14 Sekunden enthalten dessen Start und die Vorbereitung des Testkontos.
Der PWA-Lauf meldet 35 ausgewählte Fälle, davon 34 erfolgreich und einen übersprungen.

Andere Jobs laufen bereits parallel: Qualität 4 min 40 s, Node 43 s, DOM 53 s,
Angular-Gruppe 1 5 min 44 s und Angular-Gruppe 2 9 min 19 s. Der längste Angularjob
wäre nach einer reinen Browseroptimierung der nächste Engpass.
Seine 122 Testdateien benötigen laut Vitest-Bericht 536,09 s. Die kumulierten
Import-/Umgebungszeiten sind deutlich größer als die kumulierte eigentliche
Testzeit; wegen paralleler Prozesse dürfen diese Summen nicht als zusätzliche
verstrichene Zeit addiert werden. Weitere Profilierung ist nötig, bevor einzelne
Tests oder Angular selbst als Ursache benannt werden können.

Die vorigen PR-Läufe bestätigen das Muster:

| Lauf        | Gesamter PR-Lauf |  Browserjob |
| ----------- | ---------------: | ----------: |
| 38742147213 |      23 min 10 s | 22 min 49 s |
| 38796502742 |      23 min 27 s |      23 min |
| 38801587028 |      23 min 43 s | 23 min 22 s |

Die anschließende Veröffentlichung des unveränderten geprüften Dateistands lief
in [Lauf 38804915913](https://github.com/GrischaTDev/flipbase/actions/runs/38804915913)
in 3 min 8 s erfolgreich durch. Die Tests wurden dabei nach dem vorhandenen
Dateistandnachweis wiederverwendet. Hier entstand kein zweiter 23-Minuten-Lauf.

## Ursachen im aktuellen Aufbau

- `playwright.pr.config.ts` erzwingt einen Worker. Sämtliche 160 ausgewählten
  PR-Browserfälle laufen im selben Job nacheinander. `fullyParallel: true` hebt
  diese Beschränkung ohne mehrere Worker oder Jobs nicht auf.
- Derselbe Job führt danach PWA-Skripte, zwei Produktions-Testbauten und weitere
  Browserfälle aus. Diese zusätzlichen Minuten verlängern den kritischen Pfad.
- Die PR-Auswahl ist eine breite Regression mit zahlreichen Layout-, Geräte- und
  Farbvarianten. Die Bezeichnung „Browser smoke“ beschreibt den Umfang nicht mehr gut.
- Die Änderungserkennung unterscheidet große Bereiche wie Anwendung, Dienste und
  Datenbank. Eine begrenzte UI-Änderung erhält dadurch den breiten Anwendungslauf.
- Browserberichte werden im aktuellen Workflow nur bei Fehler oder Abbruch
  hochgeladen. Der erfolgreiche Lauf enthält nur Gesamtzeiten und Fortschrittspunkte;
  die langsamsten einzelnen Browserfälle sind damit noch nicht nachgewiesen.
- npm-Installation ist mit elf Sekunden nicht der Haupthebel. Wenige explizite
  Wartepausen wurden gefunden, erklären aber keine 23 Minuten.

## Empfohlene Reihenfolge

1. **Bestehende Browserpflichtfälle auf vier getrennte Jobs verteilen.** Je Job
   eigene lokale Datenbank und ein Worker; damit bleiben Reproduzierbarkeit und
   Datenisolation erhalten. Vier Worker auf derselben kleinen Maschine sind
   kein gleichwertiger Ersatz. Alle Fälle bleiben verpflichtend. Zusätzliche
   Rechner erhöhen die insgesamt verbrauchten Runner-Minuten und brauchen freie
   GitHub-Kapazität. Zunächst Auswahl und Isolation prüfen und mehrfach messen.
2. **PWA-Prüfung als eigenen parallelen Pflichtjob ausführen.** Beide echten
   Produktions-Testbauten und die Update-/Offlinefälle bleiben bestehen. Der
   abschließende Pflichtstatus muss alle Teiljobs einschließen, auch bei Fehlern.
3. **Angular-Importkosten und Verteilung untersuchen.** Die bisherige Spanne
   zwischen den zwei Gruppen ist groß. Weitere Gruppen oder eine bessere
   Verteilung erst mit Messung und ausreichendem Arbeitsspeicher festlegen.
   Ohne diesen Schritt begrenzen momentan 9 min 19 s den schnelleren PR-Lauf.
4. **Zeitberichte auch bei Erfolg sichern.** Pro Test und Job messen, langsamste
   Fälle sichtbar machen, Laufzeitbudget und Auswahllisten automatisch prüfen.
5. **Anschließend Testumfang fachlich ordnen.** Kritische Abläufe für Anmeldung,
   Berechtigungen, Bestand, Geld und betroffene Änderungen vor Merge erhalten.
   Zusätzliche Wiederholungen und große Gerätematrizen auf ihren Mehrwert prüfen.
   Eine Verlagerung ist nicht Teil dieser Untersuchung und braucht eine konkrete
   Abdeckungsentscheidung; bestehende Regeln verlangen derzeit den vollen PR-Lauf.

Ein grobes Rechenbeispiel verdeutlicht das Potenzial: Rund 16 Minuten Browserlauf
verteilt auf vier gleichmäßig ausgelastete Jobs ergeben ungefähr vier Minuten
Prüflast je Job, zuzüglich jeweils Einrichtung und Anwendungsstart. Das ist keine
Prognose für den tatsächlichen nächsten Lauf. Setupkosten, ungleiche Tests,
Warteschlangen und der längste andere Pflichtjob bleiben zu berücksichtigen.

## Ergänzung: Brauchen wir diesen Browserumfang bereits?

Auf Nachfrage wurde die tatsächliche PR-Auswahl ohne Testausführung mit Playwright
erneut aufgelistet: 160 Fälle in 32 Dateien. Darunter 27 Fälle für responsive
Verwaltungsansichten, acht für die Einkaufsansichten in vier Breiten und zwei
Farbschemata, sechs für die Vinted-Arbeitsansicht und 13 für Artikelrandfälle.
Diese Zahlen beschreiben die Auswahl pro Datei, keine überschneidungsfreien
fachlichen Kategorien und keinen Nachweis unnötiger einzelner Fälle.

Playwright steuert einen echten Browser, füllt Formulare, klickt Aktionen und
prüft sichtbare Ergebnisse, Fokus, Überläufe und teilweise Datenbankzustände.
Einige Fälle arbeiten mit einer echten lokalen Testdatenbank; zahlreiche
Layoutfälle ersetzen Serverantworten durch definierte Testdaten. Die untersuchten
Vinted-Ansichtsfälle bedienen keine echten Vinted-Inserate.

Eine kleine Zahl wichtiger Browserabläufe ist bereits für die Beta sinnvoll:
Zugangsprüfung, Einkäufe speichern, Verkäufe und Bestandsänderung, Erhalt von
Entwürfen. Berechnungen, Datumsgrenzen und viele Fehlerkombinationen können
zusätzlich auf einer schnelleren Ebene geprüft werden. Eine vollständige
Geräte-/Farbschemamatrix jedes Features als Pflicht bei jeder Änderung ist eine
andere Entscheidung als die grundsätzliche Nutzung von Browserautomation.

Die erste Empfehlung, zunächst den vorhandenen Umfang auf mehr Rechner zu
verteilen, löst die Laufzeit, bewertet aber dessen Angemessenheit noch nicht.
Aufgrund der Nachfrage sollte vor dem Umbau zuerst jeder Pflichtfall nach Risiko,
zusätzlichem Erkenntnisgewinn und Änderungsbezug eingeordnet werden: kleines
Kernpaket bei jedem PR, passende Zusatzfälle bei betroffenen Funktionen und die
vollständige Matrix regelmäßig. Gemeinsame Änderungen müssen weiterhin die
betroffenen Einsatzstellen abdecken. Kritische Daten- und Rechteprüfungen dürfen
dabei nicht durch reine Bildschirmtests ersetzt oder erst nach der Auslieferung
ausgeführt werden. Erst danach ist die erforderliche Parallelisierung festzulegen.

Grundlage: [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
beschreibt viele schnelle kleine Tests und wenige umfassende Ablaufprüfungen.
Es gibt keine allgemeingültige Mindestanzahl an Browserfällen. Die konkrete
Neuzuordnung und ihre Prüflücken sind noch offen; keine Auswahl wurde verändert.

## Quellen

- [DORA: Continuous integration](https://dora.dev/capabilities/continuous-integration/):
  wenige Minuten, ungefähr zehn Minuten als Obergrenze; Effizienz, mehr Rechenleistung
  oder getrennte längere Prüfphasen als Maßnahmen.
- [Martin Fowler: Continuous Integration](https://martinfowler.com/articles/continuousIntegration.html#KeepTheBuildFast):
  Zehn-Minuten-Richtlinie für die meisten Projekte und mehrstufige Prüfung.
- [Playwright: CI](https://playwright.dev/docs/ci#workers): ein Worker als stabiler
  Standard; Verteilung auf mehrere CI-Jobs für breitere Parallelisierung.
- [Playwright: Sharding](https://playwright.dev/docs/test-sharding): Aufteilung
  und Testverteilung; gleich viele Fälle bedeuten nicht automatisch gleiche Laufzeit.

Die Befunde beruhen auf drei erfolgreichen PR-Läufen, den aktuellen Konfigurationen
und offiziellen Quellen. Kein neuer vollständiger CI-Lauf wurde für diese Analyse
ausgelöst. Linux-/Lastmessungen der vorgeschlagenen Aufteilung stehen aus.

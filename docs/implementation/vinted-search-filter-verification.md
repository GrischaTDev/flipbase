# Vinted-Suchfilter: Umsetzungs- und Prüfnachweis

Die Arbeit liegt auf `juna/vinted-search-filters`, ausgehend vom frisch
abgerufenen `origin/master` (`46c96ec64827da999a5c3d8648542d47bfd69240`).
Primäre Arbeitskopie und Planungszweig wurden nicht verändert. Die ursprünglichen
Messungen unter `docs/research/2026-10-29-vinted-search-filter-*` bleiben als
historischer Nachweis erhalten. Es gab keinen Push, PR, Merge oder Rollout dieser
Aufgabe. Zum Abschluss am 30.10.2026 wurde der zwischenzeitlich integrierte
Pipeline-Stand `155fe32312684a357a763cea8737a72238c839ab` per Fast-forward in
den eigenen Zweig übernommen. Alle 2.732 gesicherten App-, Datenbank-, Dienst-,
Test- und Bauquelldateien bleiben bytegleich; die fremde und die eigene
Changelog-Historie sind vollständig erhalten.

## Verhalten

Identische Quellparameter können mehrere lokale Titelregeln bedienen. Kategorien,
Marken, Preise und vorhandene Suchtexte werden nicht erweitert. Jeder Empfänger
prüft seine Titelbegriffe und Ausschlüsse; Übernahme und Fehlerstatus sind durch
aktive Revision und Cursor geschützt. Neue Teilabfragen werden still eingelesen.
Ein gemeinsamer Artikel bleibt einmal gespeichert und kann mehreren Filtern
zugeordnet sein. Beide Reihenfolgen von neuer und bereits eingelesener Teilabfrage
sind geprüft.

Aufholstände gehören jeweils zu Filter, Revision und gewählter Teilabfrage.
Auch nach mehreren Alleinrunden eines schnelleren Filters oder einem Speicherfehler
bleibt der eigene ältere Ausschnitt eines langsameren Empfängers maßgeblich.
Gemeinsame Rohseiten werden je Empfänger nur bis zu seiner eigenen Überlappung
übernommen; Abdeckung und Seitenzahl können deshalb im selben Auftrag abweichen.
Die höchstens 2.048 Ausschnitte werden nur nach akzeptierter Übernahme fortgeschrieben.
Ohne Vergleichsstand ist die Abdeckung eines bereits eingelesenen Empfängers unbekannt.

Der bestehende Browser lädt nach regulärem Sitzungsaufbau seriell ohne Cache.
Auch der Rückweg zur normalen Sitzungserneuerung muss frisch laden. Anbieter-
ablehnungen werden nicht durch verborgene Wiederholungen umgangen. Das begrenzte
Aufholen lädt höchstens drei Seiten; fehlgeschlagene Speicherung verschiebt den
letzten bestätigten Quellausschnitt nicht. Die Diagnose ist keine Zusage über
die Vollständigkeit des Marktplatzes.

Private Feed-Nachrichten enthalten ausschließlich `{refresh:true}`. Der Client
lädt anschließend über die bestehende Berechtigungsprüfung nach; ältere Feedseiten,
Favoriten, Wiederverbindung und das vorhandene Rückfall-Polling bleiben erhalten.

Die Verwaltung zeigt kompakte Bedingungen und Status. Vollständige Bedingungen
und genaue Abrufdaten sind aufklappbar. Explizite Puffer-Vorschläge enthalten
`puffer`, `pufferjacke`, `puffer jacke`, `pufferjacken` und `puffer jacken`.
Es gibt kein unscharfes Präfixmatching und keine automatische Änderung alter
individueller Filter oder ihrer Alle-/Oder-Verknüpfung.

## Tatsächliche Prüfungen

Die Rohprotokolle liegen in `.superpowers/sdd/vinted-search-filters/`.
Erwartet rote Regressionen sind dort ausdrücklich als `red` gekennzeichnet.

| Prüfung                                                        | Ergebnis                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI-Auswahl mit Node 22                                         | 558 Dateien, 6.057 Tests bestanden: Node 2.741, DOM 369 und Angular 2.947 in fünf Gruppen mit zwei Arbeitern                                     |
| Vollständige Sniper-Suite unter Linux/Node 22                  | 46 Dateien, 452 Tests bestanden, keine Auslassung; zwei CPUs und 2 GiB Speicher                                                                  |
| Diensttypprüfung, Dienstbau und Produktionsimage               | erfolgreich                                                                                                                                      |
| Isolierter Image-Start ohne Netz/Schreibrechte                 | erfolgreich                                                                                                                                      |
| Echter Linux-Chrome im Produktionsimage                        | Sandbox, privater CDP, Cache, Sitzungsauffrischung, ursprüngliche Ablehnung, Abbruch, Profil-/Cookieerhalt, 40 Abrufe und Tabwechsel erfolgreich |
| Echter lokaler Chrome: dieselbe gecachte URL erhält später 307 | roter Fehler reproduziert; nach Korrektur frischer Katalog und genau eine reguläre Sitzungserneuerung                                            |
| Frisch angewandte tatsächliche Migration                       | 134 SQL-Dateien, 5.074 Assertions erfolgreich                                                                                                    |
| Gezielte SQL-Verträge                                          | 199 Assertions erfolgreich                                                                                                                       |
| Migrationshistorie und SQL-Dateiinhalt                         | exakt übereinstimmend                                                                                                                            |
| Security-Advisors, Schemaregistrierung, Migrationsschutz       | erfolgreich, keine Advisor-Befunde                                                                                                               |
| Gesamter Datenbankjob einschließlich Nebenläufigkeit           | erfolgreich; zusätzliche Marketplace-/Push-Reservierungs- und Präzisionsprüfungen bestanden                                                      |
| Release-Migrationen in isoliertem PostgreSQL 16                | echte Transaktionen, Fehler, Wiederholung und Freigaben erfolgreich; Testcontainer und Netz entfernt                                             |
| Marketplace-Deno-Prüfungen mit CI-Deno 2.9.7, Worker-Typen/Bau | erfolgreich; Worker 727 bestanden, 8 bestehende Auslassungen                                                                                     |
| Root-Typen, Format, Lint, Actionlint, Suite-Audit              | erfolgreich; nach Übernahme der aktuellen Pipeline erneut geprüft                                                                                |
| Landingpage-Vertrag                                            | 45 bestanden                                                                                                                                     |

Die erste Deno-Prüfung mit dem vorhandenen Deno 2.7.5 scheiterte an fremden
RequestInit-Typen. Mit separat bereitgestelltem, offiziell geprüftem CI-Deno
2.9.7 bestehen dieselben unveränderten Prüfungen. Keine Projektabhängigkeit oder
globale Laufzeit wurde aktualisiert.

Der gemeinsame Windows-Preflight wurde tatsächlich ausgeführt. Der bestehende
Runner benötigt eine vollständig erhaltene `PATH`-Umgebung; der erste Versuch
scheiterte daran, der nächste erreichte Format, Lint, Typen und Workflowtests.
Ein vorhandener Zeilenendentest wurde durch LF in der eigenen geänderten
`supabase/config.toml` behoben. Die Readiness-Fixture besteht auch unter Windows,
wenn der vorhandene Git-Bash statt des gleichnamigen WSL-Starters verwendet wird.
Die zwei übrigen Windows-Fehler betreffen ausdrücklich für Linux geschriebene
Marketplace-Hostgrenzentests: Der echte Windows-Prozess darf kein zulässiger
GitHub-Linux-Runner werden, und `/bin/bash` ist dort kein nativer Pfad. Beide
unveränderten Verträge bestehen im isolierten Linux-Gesamtlauf. Die echten
Marketplace-Host-Imageprüfungen werden auf dem Entwicklerhost nicht gestartet.
Kein fehlgeschlagener Gesamtlauf wird als bestandener Preflight ausgegeben.

Ein erneuter paralleler Anwendungslauf traf unter Last zwei unveränderte
10-Sekunden-Hooklimits. Beide betroffenen Dateien bestehen danach mit denselben
Zeitlimits und zwei Arbeitern (56 Fälle). Der folgende Lauf in den fünf
CI-Angulargruppen deckte außerdem 34 unbehandelte Fehler des bestehenden
Verkaufs-Routentests auf: eingebettete fremde Dienste führten echte, im Test nicht
vorgesehene Hintergrundabfragen aus. Die eine Testdatei isoliert diese Dienste
jetzt an ihren Grenzen und lässt jede unerwartete Serverabfrage ausdrücklich
fehlschlagen. Alle Verkaufs-/Router-/Tabellenassertionen bleiben erhalten.
Rot: 17 bestandene Fälle plus 34 unbehandelte Fehler; grün: dieselben 17 Fälle,
keine unbehandelten Fehler. Die umfassenden Gruppen wurden anschließend erneut
mit insgesamt 6.057 erfolgreichen Fällen ausgeführt; ein Lauf mit unbehandelten Fehlern zählt nicht als bestanden.

## Abschließende UI- und Linux-Nachweise

Der endgültige Produktionsbau, 31 gezielte Angularfälle und sieben Fach-
Browserfälle bestehen. Sie prüfen Anlegen, Bearbeiten, Pause, Löschen,
Mehrmarken, Pluralvarianten und Ausschlüsse, Bedingungen, Fehler, Fokus, Tastatur,
Touch, Hell/Dunkel und AXE. Aufklappbare Bedingungen, Abrufdetails und Titelhilfe
sind tatsächlich per Tastatur geprüft. Ein einziger Seitentimer lässt relative
Zeiten auch bei API-Ausfall weiter altern und wird vollständig abgeräumt.

Vier visuell geprüfte vollständige Aufnahmen zeigen zwölf synthetische Filter
und die neue Anlage: Desktop/Hell sowie schmal/Dunkel. Die Desktopübersicht
benötigt 1.272 statt 1.869 Pixel Höhe. Die Dateien sind zusätzlich außerhalb des
Worktrees unter der lokalen Ergebnisablage gesichert und im Chat verlinkt.
Die umfassende aus dem endgültigen Plan abgeleitete Browsermatrix besteht mit 567 Fällen in neun Gruppen mit
unveränderten Auswahlregeln, Zeitlimits und nur einem Arbeiter je Gruppe.
Die lokale Angular-Vorschau nutzt lediglich `--watch=false`, damit während der
Prüfungen kein Neubau die Seite neu lädt.

Der ergänzende Linux-Gesamtlauf unter Ubuntu 24.04 und Node 22.23.2 besteht:
647 Workflowfälle, keine Fehler, die eine vorgesehene separat bestandene
Release-Migrationsintegration ausgelassen; Shared-UI-Audit 257 Dateien ohne Befund.
Die PWA-Skripte bestehen mit 46 Fällen. Drei echte PWA-Bauten einschließlich
historischem Vorgänger und anschließend die unveränderten 43 Browserfälle mit
Playwright 1.62.1, Chromium/Android und WebKit ergeben 42 bestandene Fälle und
eine vorgesehene Desktop-Auslassung mit entsprechendem Androidfall. Die finalen
Appquellen stimmen per Hash mit der geprüften Kopie überein; spätere Sniper-
Änderungen sind keine Abhängigkeit dieses Baus. Eigene Linux-Testcontainer,
Volume und Image-Tag wurden nach Export der Nachweise entfernt.

Nach Übernahme der zwischenzeitlich integrierten Pipeline wurde derselbe
Workflow auf `155fe323` erneut vollständig unter Linux ausgeführt:
**674 bestanden, keine Fehler, eine separat bestandene Release-Migrationsfixture
ausgelassen**. Der Shared-UI-Audit bleibt bei 257 Dateien ohne Befund. Die alten
647er-Protokolle bleiben als früherer Stand erhalten; maßgeblich ist
`linux-quality-upstream/workflow-155fe32.log`. Auch diese zusätzliche eigene
Prüfumgebung wurde entfernt. Der normale Produktionsbau auf dem aktualisierten
Zweig besteht ebenfalls; die vorhandenen Budget-/CommonJS-/Importwarnungen werden
nicht als behobene Fehler ausgegeben.

## Befehle und verbleibende Grenze

Der endgültige Auswahlplan ist unverändert umfassend; sein Auswahlnachweis lautet
`7e16feec06d5fa44a9dc2a918f564ab36215eb10c6e112c2f5bff3c6808e5853`.
Die Anwendungsgruppen wurden mit den durch den gemeinsamen Plan bestimmten
Suites und Gruppen ausgeführt:

```text
vitest run --project=node --shard=1/1 --maxWorkers=2
vitest run --project=dom --shard=1/1 --maxWorkers=2
vitest run --project=angular --shard=1/5 --maxWorkers=2
vitest run --project=angular --shard=2/5 --maxWorkers=2
vitest run --project=angular --shard=3/5 --maxWorkers=2
vitest run --project=angular --shard=4/5 --maxWorkers=2
vitest run --project=angular --shard=5/5 --maxWorkers=2
```

Die Browserauswahl verwendet unverändert die Projekte und Gruppen aus
`buildBrowserMatrix`: Kern 2, Layout 13 + 13, Chromium 107 + 107 + 106 + 106 + 106,
geänderte Verwaltungsfälle 7. Insgesamt **567 bestanden**, Gesamtexitcode 0.
Kein Testlimit, Retry oder fachlicher Erwartungswert wurde gelockert.

Weitere tatsächlich ausgeführte gemeinsame Befehle sind `npm run preflight:plan`,
`npm run preflight`, `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm run test:audit`, `npm run build`, `npm run test:db`, `npm run test:workflow`,
`npm run test:pwa:scripts` und `npm run test:e2e:pwa`; die Dienst-/Workerbefehle,
Dockerstarts und Datenbank-Nebenläufigkeitsbefehle stehen in den zugehörigen
Rohprotokollen. Die Windows-PATH-Korrektur erhält lediglich den vorhandenen
Suchpfad; sie verändert keine Testauswahl.

**Kein pauschal grüner Windows-Preflight:** Die zwei oben beschriebenen
Linux-spezifischen Hostgrenzentests verhindern dort den erfolgreichen Gesamtlauf.
Ihre unveränderten Verträge sind im erfolgreichen aktuellen Linux-Workflow
enthalten. Alle übrigen ausgewählten lokalen Bereiche wurden tatsächlich
ausgeführt. Der verbindliche GitHub-Pflichtlauf vor einem Merge steht weiterhin
aus. Zum Zeitpunkt dieser lokalen Messungen war noch kein PR freigegeben oder
erstellt. Am 30.10.2026 hat der Nutzer die PR-Erstellung, den Merge nach
erfolgreichen Pflichtprüfungen und die anschließende Bereinigung ausdrücklich
beauftragt; die GitHub-Ergebnisse werden im PR festgehalten.

## Späterer Rollout

Die Produktion setzt nach dokumentierter Wiederherstellung weiterhin ausdrücklich
30 Starts/min, 10.000 ms Mindestabstand und 5.000 ms Diensttakt. Der Code allein
ändert das nicht. Sicherung, gezielte spätere Umstellung auf 24/2.500/1.000 und
Kontrolle der tatsächlich geladenen Werte stehen in
[`services/sniper/README.md`](../../services/sniper/README.md#gleichmäßige-abrufe-und-zugriffspausen).
Anbieterpausen bleiben erhalten. Diese Umsetzung hat keine Produktionswerte
verändert und verspricht keine feste Abrufrate oder Fundlatenz.

# Warenwirtschaft: Integrationsstand vom 4. September 2026

## Ergebnis

`origin/master` bis `a2ccddb` ist in `feature/purchase-inventory-overhaul` integriert. Änderungen von Claude Code und Gemini sind erhalten. Kein Push, keine Produktionsmigration und kein Deployment ausgeführt. Der fremde Zweig `feature/deal-monitor-subscriptions` blieb unangetastet.

Die Korrekturwelle behebt sechs bestätigte Bereiche:

- Fehlende oder noch nicht abgeschlossene Einkaufskosten bleiben unbekannt, statt Gewinn aus vermeintlichen Nullkosten zu berechnen. Aktuelle Einkaufsdaten haben Vorrang vor älteren eingebetteten Beziehungen.
- Inventar und Dashboard berechnen den Restwert aus demselben Kostenpool: 100 Euro minus 33,34 Euro ergibt 66,66 Euro, ohne Rundungsabweichung durch Durchschnittspreise.
- Diagramm, Tooltip und Tastaturansicht unterscheiden unbekannte Werte von echten null Euro.
- Das Prüfarchiv liest alle Tabellen und das Journal aus einem gemeinsamen Datenbankstand.
- Artikelzusatzkosten und die Kostenzuordnung von Mengenverkäufen sind zusätzlich im Archiv enthalten. Die CSV-Spalten entsprechen den erzeugten Datenbanktypen.
- Deklaratives Schema und Berechtigungen sind abgeglichen. Die neue Migration wurde automatisch erzeugt und nur in einer getrennten lokalen Datenbank angewendet.

Zusätzlich wartet das Deployment auf die erforderliche Sniper-Prüfung, verwendet den feststehenden Commit und meldet Fehler beim Kopieren der Landingpage zuverlässig.

## Abschließende Prüfungen

| Prüfung                 | Ergebnis                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`        | Exitcode 0: Formatierung, Lint, Typen, Workflowtests, Teststrukturprüfung, Anwendungstests und Produktionsbuild                             |
| Anwendungstests         | 1.404 bestanden: 956 Node, 129 DOM, 319 Angular; fünf bestehende Angular-Tests übersprungen                                                 |
| Workflowtests           | 21 bestanden; ein POSIX-Test unter Windows übersprungen. Der Fehlerpfad wurde zusätzlich mit Git Bash und einer Docker-Attrappe geprüft     |
| Browser                 | Alle sechs Chromium-Tests bestanden: Anmeldung, Rechtshinweisdialog, Einkaufsnavigation, einmaliger Verkauf, Diagramm mit Maus und Tastatur |
| Datenbank               | 19 Dateien, 864 Assertions bestanden, einschließlich 22 Prüfarchivtests                                                                     |
| Schema-Abgleich         | Nach Migration keine Abweichungen; keine DROP-Anweisungen in der ausgelieferten Migration                                                   |
| Kritische Testabdeckung | Alle sechs ausgewählten Geldpfade geprüft; insgesamt 99,68 % Statements und 95,13 % Verzweigungen. Keine Schwellen gesenkt                  |
| Sniper                  | Typprüfung und 73 Tests bestanden; kein externer Live-Collector gestartet                                                                   |

Die Datenbankprüfungen liefen ausschließlich im lokalen Projekt `flipbase-overhaul-integration`. Die gemeinsam verwendete Entwicklungsdatenbank enthält bereits fremde Änderungen und wurde nicht zurückgesetzt.

## Bewusste Entscheidungen und Grenzen

Die unabhängige Nachprüfung der sechs korrigierten Befunde fand keine verbleibenden wichtigen Fehler (P0–P2) und keine wichtigen neuen Regressionen im geprüften Umfang. Sie ersetzt keine vollständige erneute Prüfung aller ursprünglichen Planaufgaben.

- Zwei zusätzliche Archivdateien (`item-costs.csv`, `sale-line-lot-allocations.csv`) machen Kosten nachvollziehbar; sie ändern keine Geschäftsdaten.
- Bestehende Exportrechte für Eigentümer, Administratoren und Buchhaltung bleiben erhalten.
- Das Archiv ist auf insgesamt 100.000 Datensätze und 50 MiB JSON begrenzt. Darüber entsteht eine ausdrückliche Fehlermeldung, kein unvollständiges Archiv. Es ist kein vollständiges Infrastrukturbackup. Die Größengrenze ersetzt keinen Lasttest.
- Kein angemeldeter Browser-End-to-End-Test des Archivdownloads durchgeführt; Rechte und Datenumfang sind auf Datenbank- und Serviceebene geprüft. Keine pauschale rechtliche oder WCAG-Freigabe.

## Nachtrag: Änderungsverlauf und Archivierung abgeschlossen

Die unten ursprünglich offenen Punkte 2 und 3 sind inzwischen in `6f27a68` und `029ee41` umgesetzt und unabhängig geprüft. Der Änderungsverlauf erscheint direkt an Einkauf, Artikel und Verkauf. Inhaber können Arbeitsbereiche archivieren und wiederherstellen; Lesen und Export bleiben möglich, operative Änderungen sind serverseitig gesperrt. Details und Tabellenumfang stehen in [Workspace-Archivierung](../../workspace-retention.md).

Der Abschlusslauf auf `029ee41` besteht `npm run verify` einschließlich 1.428 Anwendungstests und Produktionsbuild, 952 Datenbankprüfungen und sechs Chromium-Tests. Zwei echte parallele Datenbanksitzungen bestätigen den Schutz gegen gleichzeitige Buchung und Archivierung. Beide Aufgabenreviews sind ohne kritische oder wichtige Befunde freigegeben. Die neuen Ansichten wurden lokal im Demo-Modus auf Desktop und Mobil geprüft; ein angemeldeter Inhaber-Browsertest bleibt als ergänzende Testlücke offen. Rechte und Schreibschutz sind durch Datenbanktests belegt. Keine Produktionsänderung ausgeführt.

## Ursprünglich offene Punkte und aktueller Stand

1. Einstellungsinhalte vollständig in getrennte Seiten aufteilen; derzeit existiert die Navigation, aber noch eine gemeinsame große Komponente.
2. Erledigt: Änderungsverlauf direkt an Einkauf, Inventarartikel und Verkauf einbinden.
3. Erledigt: Arbeitsbereiche archivieren und wiederherstellen.
4. Landingpage korrigieren: mobile Überbreite, Kontraste, widersprüchliche Funktionsversprechen, Beta-/Registrierungsablauf und Rechtstexte. Details im [Landingpage-Bericht](2026-09-04-landing-integration-review.md).

Ein grüner Integrationslauf bedeutet deshalb nicht, dass sämtliche Aufgaben des ursprünglichen Gesamtplans erledigt sind oder die Anwendung bereits live ist.

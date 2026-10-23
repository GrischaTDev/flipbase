# eBay-Verkaufsprüfung: integrierte Abnahme

Stand: 23. Oktober 2026. Prüfung durch Juna im eigenen Zweig
`juna/ebay-sales-review`. Die aktuellen Hauptzweigänderungen bis `8281c9d1`
sind enthalten. Dieses Protokoll beschreibt lokale Nachweise; ein produktiver
Rollout und eine echte Handy-Pushzustellung sind damit nicht bestätigt.

## Fachliche Prüfungen

- Inserat mit Bestand verbinden, gespeicherte Bestellung mit Bild öffnen und
  vorhandene Zeilen bei Rücknavigation oder vorübergehendem Abruffehler erhalten.
- Historische Bestellung zuerst abgleichen: einen vollständigen vorhandenen
  Verkauf einschließlich bereits verkaufter Artikel zuordnen oder bewusst einen
  neuen Entwurf bearbeiten. Keine zweite Buchung oder erneute Bestandsbewegung.
- Neuen verknüpften Verkauf automatisch reservieren und unter „Zu prüfen“ sowie
  in der persönlichen Glocke anzeigen. Vor der Bestätigung bleiben bestätigte
  Verkaufszahl, Umsatz und Gewinn unverändert.
- Belegte Gebühren einschließlich 0 übernehmen; unbekannte Kosten leer lassen.
  Käuferporto und tatsächliche Versandkosten getrennt speichern, erneut öffnen
  und erst nach Prüfung endgültig buchen. Eine verlorene Antwort erzeugt bei
  Wiederholung keinen zweiten Verkauf.
- Private Daten nach Rechteentzug oder Kontotrennung verwerfen. Interne
  Reservierungen bleiben mit Grund und bewusster Bestätigung klärbar, auch wenn
  die persönliche eBay-Statusprüfung scheitert. Konkurrierende Antworten dürfen
  keinen neuen Vorgang oder Nutzerkontext überschreiben.
- Die falsche Erstattungssperre für den belegten Fall der Bestellung mit
  Endnummer 7587 ist durch Regressionen abgesichert: ausdrücklich leere
  Bestell-Erstattungen erlauben das fehlende Positionsfeld. Echte,
  widersprüchliche oder insgesamt fehlende Nachweise bleiben gesperrt.

## Automatisierte Nachweise

| Bereich               | Ergebnis                                                                                                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datenbank             | Regulärer chronologischer Supabase-Reset mit allen Migrationen und Seed; 130 SQL-Dateien, 4.882 Assertions erfolgreich. Sechs echte Konkurrenzszenarien für Doppelbuchung, Rechteentzug und reservierten Bestand ebenfalls erfolgreich.                                                                         |
| Schema und Typen      | 31 tatsächliche Funktionskörper direkt gegen die deklarativen UTF-8-Quellen geprüft; neue Objekte, Rechte und RLS stimmen überein. Typen aus der frisch aufgebauten lokalen Instanz erzeugt. Seit diesem Nachweis keine SQL- oder DB-Typänderung.                                                               |
| Anwendung             | 231 Node-Dateien mit 2.692 Fällen, 48 DOM-Dateien mit 354 Fällen und 263 Angular-Dateien mit 2.749 Fällen erfolgreich. Die drei danach korrigierten Angular-Dateien zusätzlich vollständig mit 64 Fällen geprüft, darunter 23 neue Regressionen: insgesamt 5.818 unterschiedliche Anwendungsfälle.              |
| Auswahl und Qualität  | 72 Auswahl-/Registrierungsfälle einschließlich echter Playwright-Auflistung erfolgreich. Audit: 542 Dateien, 4.912 Testdefinitionen und 13.407 Assertions. Vollständige Typprüfung, Lint und Formatprüfung erfolgreich.                                                                                         |
| Edge Functions        | Die fünf einschlägigen Check-/Testbefehle des CI-Workflows unter Linux/Deno 2.9.7 erfolgreich: 219 + 30 + 25 = 274 Fälle und die tatsächlichen Funktionseinstiege geprüft.                                                                                                                                      |
| Hintergrunddienst     | 28 Workerfälle, Typprüfung und Bau unter Linux mit unverändertem Lockfile erfolgreich; danach keine Workerquelländerung.                                                                                                                                                                                        |
| Workflow und Release  | 551 tatsächliche Workflowfälle abgedeckt, einschließlich echter Docker-/Nginx-/Compose-Prüfungen, PowerShell-Harness und isolierter PostgreSQL-Transaktionsprüfung. Gemischter Linux-/Windows-Nachweis; kein rein unter Linux ausgeführter Gesamtlauf behauptet. Neue Auswahländerungen danach separat geprüft. |
| Produktions-PWA       | Zwei echte Produktionsbauten mit unveränderter Sicherheitsrichtlinie: 36 Fälle erfolgreich, ein beabsichtigter Desktop-Skip. Derselbe eingefrorene Updatefall besteht unter Android-Emulation. Chromium, Android-Updatekontexte und WebKit sowie die PWA-Skripte erfolgreich.                                   |
| eBay-Browserabläufe   | Drei bestehende beziehungsweise erweiterte Abläufe mit echter lokaler Anmeldung/Datenbank und isoliertem Anbieter erfolgreich. Zusätzliche Desktop-/Touchabläufe prüfen Zuordnung, Kostenspeicherung, Reservierung, Glocke, Kontotrennung und interne Klärung.                                                  |
| Breite Browserauswahl | Abschluss der verbleibenden Gruppen wird vor Freigabe ergänzt.                                                                                                                                                                                                                                                  |
| Produktionsabbild     | Abschließender Abbild- und Paketnachweis wird vor Freigabe ergänzt.                                                                                                                                                                                                                                             |

Die tatsächliche Auswahl gegen den Hauptzweig ist umfassend: 231 Node-, 48 DOM-
und 263 Angular-Dateien, 61 Browserdateien plus die vollständig geänderte
eBay-Testdatei sowie Produktions-PWA. Der Auswahlhash lautet
`f8c0650f2c3b0c2e8f586aa334309c2eba3a983315d838d647b2e90bcff235c9`.
Die tatsächlich ausgeführten DOM-Dateien stimmen vollständig mit dem Plan überein.

## Darstellung, Bedienung und Prüfbedingungen

Bestellungen, Entwürfe und Prüfseite wurden bei 1440/834 Pixeln auf Desktop sowie
390/320 Pixeln mit echtem Touch-Testkontext in Hell und Dunkel geprüft. Die
zusätzlichen Prüfungen verwenden den echten Theme-Schalter, kontrollieren
Überlauf, Tastaturfokus, Dialogabschluss und WCAG-A/AA-Regeln mit AXE. In den
geprüften fertigen Zuständen bestehen keine AXE-Befunde. Die Aufnahmen wurden
außerhalb des Repositorys gespeichert und tatsächlich visuell geprüft.

Die Browserprüfung nutzt vorhandenes Playwright, da der Browser-Plugin mit seinem
zugehörigen Skill nicht verfügbar ist. Linux: Node 22.23.4, Playwright 1.62.1,
`CI=true`, ein Browserworker, zwei CPUs und 4 GiB RAM. Angular läuft in den drei
tatsächlich vorgesehenen CI-Gruppen. Quellen einschließlich versteckter
Konfiguration stammen aus unveränderlichen Gitarchiven; generierte Versionsdatei
und unveränderte Abhängigkeiten sind vorhanden. Vorschauen laufen ohne Watch/HMR;
gleichzeitige Bauten verwenden andere Kopien. Lokale Ports und die Herkunft der
isolierten Anbieter-/Mailfixture wurden ausschließlich in den Prüfkopien angepasst.

Die PWA verwendet ihre tatsächliche Produktions-Sicherheitsrichtlinie und die
vorgesehene abgefangene API-Domain. Keine Sicherheitsrichtlinie, Assertion,
Pflichtauswahl oder Zeitgrenze wurde abgeschwächt.

## Gefundene und korrigierte Prüfhindernisse

Der vollständige DOM-Lauf fand eine bestehende Modulcache-Abhängigkeit: Ein
vorheriger Dialogtest lud die echte Bildkomprimierung vor dem späteren Mock.
Das unveränderte Minimalpaar scheiterte reproduzierbar bei 12/13 Fällen. Eine
explizite Mock-Isolation vor den Imports behebt dies; dasselbe Paar und danach
alle 48 DOM-Dateien bestehen, ohne Produkt- oder Timeoutänderung.

Der erste breite Browserlauf stoppte an der unveränderten Bild-Uploadfunktion,
deren lokale Herkunft noch Port 4200 statt des isolierten Ports 4211 erlaubte.
Nur die Testkonfiguration wurde berichtigt; zuerst bestand der gezielte volle
Labelablauf, anschließend die gesamte erste Browsergruppe. Die zusätzliche
visuelle Prüfung wartet tatsächliche endliche Farbübergänge ab und stellt ihre
Fenstergröße wieder her. Dadurch messen ihre AXE-Prüfungen den fertigen Zustand
und beeinflussen spätere Bedienungsschritte nicht.

Bekannte vorhandene Ausgaben bleiben sichtbar: Vite-Hinweis zum künftigen
Konfigurationsladen, erwarteter Fehlerstack eines negativen PWA-DOM-Tests,
Diagnosen einzelner Angular-Testersatzvorlagen sowie die vorhandenen Bauwarnungen
zu Purchases, Vinted, pako und dem 900-kB-Warnbudget. Das Initialpaket beträgt
957,12 kB gegenüber 956,66 kB an der Basis; das Budget bleibt erhalten.

Die zusätzlichen eBay-Abläufe haben keine JavaScript-Seitenfehler. Absichtlich
ausgelöste abgelaufene Prüfungen, verlorene Antworten und Kontotrennungen erzeugen
erwartete Netzwerkfehler. Eine synthetische nicht vorhandene Bildadresse prüft
zusätzlich den gemeinsamen Platzhalter. Eine vollständig fehlerleere
Browserkonsole oder echte Anbieterzahlung wird damit nicht behauptet.

## Freigabegrenze

Aufgabenreviews und deren gezielte Nachreviews haben keine offenen wichtigen
Befunde. Gesamtbranchreview, restliche breite Browsergruppen und aktualisierter
Produktionsabbildnachweis werden vor Abschluss ergänzt. Produktion und fremde
lokale Projekte bleiben unberührt. Der spätere gemeinsame Rollout folgt der
[Betriebsanleitung](../implementation/ebay-sales-review-rollout.md).

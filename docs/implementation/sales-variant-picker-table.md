# Verkaufsauswahl und Verkaufstabelle

Stand: 1. Oktober 2026. Assistent: Juna.

## Freigegebener Auftrag

Ein gemeinsames Auswahlmodal für Einkauf und Verkauf mit Such-/Marken-/Kategoriefiltern, konkreter Variantenwahl und verfügbarer Menge je Variante. Einzelstücke behalten ihre eigene Identität; Artikelgruppen sind niemals Verkaufsziele. Ausverkaufte Varianten und bereits gewählte Einzelstücke bleiben gesperrt. Variantenanlage bleibt auf den Einkauf begrenzt.

Die Verkaufstabelle erhält die Standardfolge Verkaufsnummer → Datum → Artikel → Menge → Plattform → Umsatz → Einkaufskosten → Gebühren & Versand → Gewinn → Marge → Haltedauer → Aktionen. Die Begriffe gelten auch für Spalten-/Sortiermenü, Kennzahlen und Verkaufserfassung. Erklärungen grenzen direkte Verkaufskosten von Betriebsausgaben und Steuern ab. Alte Standard-Spaltenfolgen werden gezielt migriert; individuelle Reihenfolgen, Sichtbarkeit und Sortierung bleiben erhalten.

Der gemeldete Nike-Nullbestand war korrekt: Der Nutzer hatte den Artikel bereits verkauft. Keine Bestandskorrektur, Datenbankmigration, SSH-Verbindung oder Serveränderung gehört zu diesem Auftrag.

## Veröffentlichung als Entwurf

Der Nutzer hat Branch-Push und einen Entwurfs-PR freigegeben, ausdrücklich ohne Merge. Der vorhandene Branch `juna/sales-variant-picker-table` wird verwendet; `master` bleibt unverändert. Die Schreibaktionen wurden am 1. Oktober tatsächlich erfolgreich ausgeführt. Die vorherige Behauptung, es gebe ausschließlich Lesezugriff, war falsch.

Die Übernahme erfolgt in nachvollziehbaren Quellcode-Commits, nicht durch ein ZIP im Repository und nicht durch eine neue CI zum automatischen Einspielen eines Pakets. Während der Übernahme bleibt der PR ausdrücklich unvollständig und nicht mergebereit.

## Prüfungen

Die vorbereiteten reinen Auswahl-/Variantenfunktionen haben in dieser Sitzung 31 isolierte Tests bestanden. Die Tabellenkonfiguration und Präferenzmigration haben 13 isolierte Tests bestanden. Hinzu kommen sechs und sieben Prüfungen der Einspielregeln. Das ersetzt keine Angular-, Browser- oder vollständige Projektprüfung. Der lokale Git-Clone ist an der DNS-Auflösung gescheitert; die Übernahme verwendet deshalb die GitHub-Git-Daten-API und unveränderte Basisobjekte.

Offen bleiben bis zum tatsächlichen Nachweis: vollständige Integration beider Erfassungsmasken und der Tabelle, Projekt-Typecheck, Format/Lint, bestehende Tests, Angular-Bau sowie Desktop-/Mobil-/Tastatur- und AXE-Prüfung. Maßgeblich sind die echten Ergebnisse der vorhandenen PR-CI. Keine Pflichtprüfung wird entfernt oder als erfolgreich ausgegeben, solange ihr Ergebnis nicht vorliegt.

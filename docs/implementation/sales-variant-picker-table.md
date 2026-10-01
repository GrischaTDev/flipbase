# Verkaufsauswahl und Verkaufstabelle

Stand: 1. Oktober 2026. Assistent: Juna. Umsetzung in PR #270 auf
`juna/sales-variant-picker-table`.

## Umsetzung

Einkauf und Verkauf verwenden denselben datenlosen `ArticlePickerComponent`.
Die Feature-Komponenten liefern Artikel, Suchmerkmale, Gruppen, konkrete
Varianten und Verfügbarkeiten. Suche, Marken- und Kategoriefilter bleiben
identisch. Beim Verkauf zeigt jede Variante Größe, Farbe, Zustand und
verfügbare Menge. Ausverkaufte, gesperrte oder unklare Verkaufsziele lassen
sich nicht übernehmen. Produkt- und Variantenanlage bleiben auf den Einkauf
begrenzt; die gemeinsame Komponente lädt selbst keine Serverdaten.

Die Verkaufserfassung verbindet Einzelstücke mit den Positionen aller geladenen
Einkäufe statt mit dem zuletzt geöffneten Einkaufsdetail. Arbeitsbereich,
Zuordnung, Archivierung, Verkaufszustand, doppelte Einzelstücke und gesamte
Positionsmenge werden beim Übernehmen und vor dem Speichern geprüft. Gespeichert
werden konkrete Varianten- oder Einzelstück-IDs und lesbare Größen-/Farbangaben,
niemals die Artikelgruppe. Historische Verkaufsziele bleiben beim Bearbeiten
unverändert.

Die Standardfolge lautet: Verkaufsnummer → Datum → Artikel → Menge → Plattform →
Umsatz → Einkaufskosten → Gebühren & Versand → Gewinn → Marge → Haltedauer →
Aktionen. Die Nummer steht eigenständig; mobil stehen Nummer und Datum oberhalb
der Artikel. Tabelle, Spalten-/Sortiermenü, Kennzahlen und Verkaufserfassung
verwenden dieselben zentralen Begriffe. Hinweise erklären zusätzliche Kosten
und Gewinn vor Betriebsausgaben und Steuern. Prozentwerte verwenden das deutsche
Dezimalkomma. Nur alte Standard-Spaltenfolgen werden migriert; individuelle
Reihenfolgen, ausgeblendete Spalten und Sortierung bleiben erhalten.

**Keine Änderung der Finanzberechnungen oder Bestände.** Der gemeldete
Nike-Nullbestand war korrekt, weil der Artikel bereits verkauft war. Keine
Datenbankmigration, produktive Buchung, SSH-Verbindung oder Serveränderung
gehört zu diesem Auftrag.

## Prüfung und noch ausstehende Abnahme

Der vollständige Projektquellstand samt gesperrten npm-Abhängigkeiten wurde für
die Prüfung verwendet. Lokal bestehen 1.628 Node-Tests, gezielte Angular-Tests
für beide Erfassungswege und Tabellenpräferenzen, Anwendung-/Test-Typprüfung,
Formatierung, gezieltes ESLint, Angular-AOT-Vorlagenprüfung, Shared-UI-Prüfung
und Testklassifizierung. Ein unter paralleler lokaler Last fehlgeschlagener
bestehender Bildvorbereitungstest bestand separat. Der lokale vollständige
Bundle-Bau überschreitet die 4-GB-Umgebung; er wurde nicht als erfolgreich
gewertet.

Der erste reguläre CI-Lauf des integrierten Stands (`36862346522`) bestätigte
Quality einschließlich vollständigem Produktionsbau, Node, DOM und eine der
beiden Angular-Teilsuiten. Die andere Angular-Teilsuite enthielt vier veraltete
Erwartungen an Fachbegriffe und feste Spaltennummern. Die betroffene Spec prüft
jetzt die neue Spaltenfolge ausdrücklich und unveränderte Geldwerte und Farben
über die jeweilige Spaltenüberschrift; alle 15 Tests bestehen lokal.

Der neue Browserfall prüft die echte Testdatenbank, konkrete Varianten und
Mengen, Tastaturbedienung, 1440/390 Pixel, AXE, Verkaufsspeicherung,
Verkaufsnummer/Datum und den unveränderten Einkaufsweg. Sein erster CI-Lauf
scheiterte nach der Verkaufsspeicherung an einer mehrdeutigen Fremdschlüssel-
Einbettung in der Testabfrage. Die Abfrage nennt nun ausdrücklich den
Arbeitsbereich-/Verkaufs-Fremdschlüssel. Der erneute vollständige CI- und
Browsernachweis für diese Testkorrekturen steht noch aus. Kein Test wurde
entfernt, keine Schwelle gelockert, kein Pflichtcheck umgangen.

## Übernahme und Freigabe

Wegen der nicht verfügbaren direkten Git-Verbindung erfolgte die Übernahme über
die GitHub-Verbindung. Vorübergehend wurden ein begrenzter Quellstand-Export und
eine auf diesen eigenen Entwurfszweig beschränkte Übertragung verwendet. Die
Übertragung prüfte sowohl die Patch-Prüfsumme als auch den vollständigen
Git-Dateibaum gegen den lokal geprüften Stand. Sämtliche temporären Workflows
und Übertragungsdateien sind aus dem aktuellen PR-Dateistand entfernt. Die
reguläre CI bleibt unverändert; der neue Browserfall ist Teil ihrer vorhandenen
Pflichtauswahl.

Der Nutzer hat Veröffentlichung und Weiterarbeit am Entwurfs-PR freigegeben,
**nicht den Merge oder ein Deployment**. Der PR bleibt bis zur erfolgreichen
vollständigen Prüfung Entwurf. Maßgeblich sind die tatsächlichen Ergebnisse
des aktuellen Commits, nicht die älteren isolierten Pakettests.

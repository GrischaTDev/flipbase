# Verwaltungsabläufe: freigegebene Richtung

## Reihenfolge eigenständiger Pakete

1. Gelber Markenakzent und persönliche Dashboard-Filter.
2. Einkaufsseite statt großem Erfassungsdialog: Artikel direkt neu anlegen oder auswählen; Kostenübersicht rechts. Mystery-Box-Inhalt weiterhin nachträglich erfassen. Keine Änderung der vereinbarten Kostenaufteilung.
3. Gemeinsame Chronik in Einkauf/Verkauf: Kommentare als Karten, automatische Änderungen als kompakte Ereignisse, gemeinsam nach Zeit sortiert. Beide Ereignisarten bleiben fachlich getrennt. Kommentare nur für berechtigte Workspace-Mitglieder. Genaues Datum zusätzlich zur relativen Zeit.
4. Aufgeräumte aktive Bestände und Archivierung erledigter Einzelstücke ohne Verlust der Buchungshistorie; persönlich wählbare Tabellenspalten.
5. Optionales EAN/GTIN-Feld, manueller und Kamerascan, eigene Produktsuche; CSV-Import mit Vorschau und Bestätigung. Keine ungeprüften Produkt-/Preisvorschläge aus Beispieldaten.

Nur Paket 1 ist im zugehörigen ersten Umsetzungsplan technisch ausgearbeitet. Für Pakete 2–5 werden vor Eingriff in Buchungsschnittstellen jeweils bestehende Services, Datenmodell und Sicherheitsregeln geprüft. Kein pauschaler Datenbankumbau und keine Veröffentlichung ohne Auftrag.

## Paket 1: Verhalten

- Markenakzent ersetzt dekoratives Lila im hellen Admin. Basis ist die vorhandene warme gelbe Akzentfamilie des dunklen Designs; lesbare dunkle Schrift auf hellen Akzentflächen. Neutrale Flächen bleiben neutral, Warn-/Fehler-/Erfolgsbedeutungen bleiben unterscheidbar.
- Dark-Mode-Hintergründe, Shop und Landingpage unverändert.
- Ohne gespeicherte Wahl: Zeitraum `year`, Plattform `all`.
- Zeitraum und Plattform gehören dem Nutzerkonto, nicht allen Workspace-Mitgliedern. Nach Anmeldung auf anderem Gerät werden sie wieder geladen; keine Live-Synchronisierung gleichzeitig offener Geräte erforderlich.
- Einstellungen sind Komfortdaten, niemals Grundlage für Berechtigungen oder Buchungen.
- Demo speichert ausschließlich lokal und getrennt von echten Konten.
- Gespeicherte Plattform nicht aufgrund eines noch leeren Ladezustands überschreiben. Auch bei null Treffern bleibt die Auswahl sichtbar und kann auf alle Plattformen zurückgesetzt werden.
- Speichern scheitert: aktuelle Ansicht bleibt verwendbar, verständliche Meldung statt falscher Erfolgsbehauptung. Keine automatischen Buchungsänderungen.
- Schnelle Filterwechsel dürfen nicht dazu führen, dass eine ältere Anfrage die letzte Wahl überschreibt.

## Grenzen

Keine neuen Abhängigkeiten für Paket 1. Angular/Tailwind beibehalten. Deutsche Oberfläche, englische Codebezeichner und Commit-/PR-Titel, kein codex-Branchpräfix. Vor Push `npm run verify`. EAN ist keine Identität eines physischen Einzelstücks; Chronik ersetzt keine Prüfung der Aufbewahrungspflichten.

# Deal-Monitor: Nutzerfilter und Artikelansicht

Freigegebene Fortsetzung der Spezifikation vom 06.09.2026, eigener Branch
`codex/vinted-user-feed` von `853ecc2`.

1. Arbeitsbereichsbezogene Merkzettel mit geprüften Schreib-RPCs und RLS.
   Marken als normalisierter Name aus den Artikeldaten, keine zusätzliche
   Vinted-Anfrage durch Nutzerfilter. Bestehende Abonnements bleiben kompatibel;
   ihre Daten werden in Merkzettel und eine getrennte Treffertabelle übernommen.
2. Kategorieherkunft am Artikel ergänzen. Späterer Fund durch einen
   Kategorieauftrag kann einen zunächst unbekannten Bereich ergänzen. Bewertung
   ordnet neue Funde allen passenden Merkzetteln zu, unabhängig vom Auftrag.
   Einlesebestand bleibt stumm, fehlende Vergleichspreise werden erneut geprüft.
3. `/deal-monitor` unter Werkzeuge: Artikel und Deals, Merkzettel verwalten,
   drei neueste Artikel oben, chronologisches Raster darunter. Aktualisierung
   alle zehn Sekunden, pausierbar, stabile Seitennavigation und begrenzter
   Speicher. Klarer Hinweis bei fehlender Sammlung und leerem Bestand.
4. Fehler, Arbeitsbereichswechsel und verspätete Antworten dürfen keine fremden
   Daten anzeigen. Shared-Komponenten, Tastaturbedienung, Desktop/Mobil, beide
   Themes und reduzierte Bewegung prüfen. Produktionsdaten bleiben unangetastet.
5. Migration generieren und prüfen, Typen erzeugen, SQL-/Bot-/Frontendtests,
   Angular-Bau und Browserabläufe mit lokalen Fixtures inklusive AXE. Erst danach
   nach der in AGENTS.md festgelegten PR-Freigabe fragen.

Neue Merkzettel und geänderte Suchkriterien melden nur künftig entdeckte Deals.
Die Artikelansicht kann auch passenden Bestand anzeigen. Pause des sichtbaren
Zulaufs verändert keinen Sammelauftrag. Historische Treffer behalten ihren
gespeicherten Preisvergleich; Löschen eines Merkzettels entfernt dessen Treffer.

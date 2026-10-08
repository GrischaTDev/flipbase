# Marken-, Label- und Größenreferenzen

Der Nutzer beauftragt die vollständige Fortsetzung des im Web begonnenen
Lexikons und erlaubt am 08.10.2026 ausdrücklich alle Backendarbeiten in Flipbase.
Der vorhandene PR 331 bildet die Grundlage; aktuelle Hauptzweigänderungen werden
auf einem eigenen lokalen Fortsetzungszweig erhalten.

Plattformbetreiber pflegen globale Marken, Linien, Labelreferenzen, eigene oder
freigegebene Bilder, Quellen und Größenreferenzen. Nutzer und Workspace-Admins
lesen ausschließlich veröffentlichte Inhalte bei gültigem Workspacezugang.
Keine Nutzerkopien, keine automatische Echtheitsbewertung und keine erfundenen
Referenzdaten. Leere Sammlungen erhalten verständliche Leerzustände.

Labels besitzen Entwurf, Prüfung, Veröffentlichung und Archiv. Eine Bearbeitung
verändert die letzte Veröffentlichung erst bei ausdrücklicher Veröffentlichung.
Versionen verhindern das Überschreiben gleichzeitiger Bearbeitung; unklare
Schreibantworten erlauben ausschließlich die Wiederholung desselben Auftrags.
Rollen-/Nutzer-/Workspacewechsel entfernen Daten und offene Eingaben; verspätete
Antworten werden verworfen. Ungespeicherte Eingaben sind geschützt.

Bilder kommen aus ausgewählten JPEG-/PNG-/WebP-Dateien bis 10 MB. Der Browser
dekodiert und begrenzt sie auf höchstens 1200 × 1200 Pixel; der Server prüft die
normalisierte PNG vollständig auf Struktur, Prüfsummen, Bilddaten und Grenzen,
entfernt Metadaten und speichert private Originale sowie geprüfte Anzeigen.
Nur der Medien-Endpunkt darf die Verarbeitung bestätigen. Attribution und
erlaubte Verwendung sind Pflichtangaben. Widerruf entfernt betroffene Referenzen
aus der Leseransicht; kurzlebige Bild-URLs laufen nach höchstens 60 Sekunden ab.

Größenreferenzen sind Quellengebundene Tabellen für Hosen, Oberteile, Schuhe und
sonstige Kleidung. Zielgruppe und Körper-/Kleidungsmaße sind explizit. Bis zwölf
frei benannte Spalten und hundert Zeilen ermöglichen EU-, internationale und
W/L-Größen mit Einheiten in der Überschrift. Keine pauschale Umrechnung zwischen
Marken; Nutzer vergleichen Tabellenwerte. Entwurf und Veröffentlichung bleiben
getrennt. Veröffentlichung benötigt Quelle, URL und Prüfdatum.

Oberflächen verwenden bestehende Shared-Bausteine und Angular-Konventionen.
Navigation unter Tools führt zu Labels und Größen. Betreiberpflege erhält
eigene geschützte Routen. Datenbankrechte sind verbindlich, Routenguards dienen
zusätzlich der Bedienbarkeit. Schemata werden registriert, Migrationen mit CLI
erzeugt und API-Typen aus einer lokalen Datenbank generiert. Keine Produktivdaten
oder externen Nachrichten werden während der Umsetzung verändert.

Abnahme: Versions-/Retry-/Rechte-/Veröffentlichungstests, SQL-/Storageprüfungen,
gezielte Frontendtests, Typen, Format, Lint, Angularbau und Browser-/AXE-Prüfung.

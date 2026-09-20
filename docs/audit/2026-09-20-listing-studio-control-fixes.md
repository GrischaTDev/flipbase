# Abschlussprüfung: gespeichertes Listing Studio

Stand: 20. September 2026
Branch: `codex/listing-studio-plan-refresh`

## Ergebnis

Die im Kontrollreview bestätigten Blocker sind behoben. Der gespeicherte
Kleinanzeigen-Ablauf ist damit für den Pull Request vorbereitet.

## Behobene Punkte

- Der Erstellen-Editor verhindert ein zweites offenes Inserat für denselben
  Artikel und verlinkt das bestehende Inserat. Verkaufte und archivierte Artikel
  werden nicht angeboten; andere unzulässige Zustände erhalten einen verständlichen
  Grund.
- Manuell bearbeitete Texte werden nur nach Bestätigung ersetzt. Textstil,
  Nichtraucherhinweis, rechtlicher Hinweis und eine Kopieraktion sind im Editor
  verfügbar.
- Titel, Beschreibung und Zahlenfelder sind korrekt beschriftet und prüfen
  Leerzeichen, Grenzen sowie höchstens zwei Nachkommastellen. Ein unverändertes
  neues Formular gilt nicht länger als ungespeichert.
- Nicht auflösbare Bilder werden nach der Übergabe einzeln beziehungsweise in der
  Mehrzahl korrekt gemeldet. Der erzeugte Kleinanzeigen-Titel wird bereits im
  Generator auf 65 Zeichen begrenzt.
- Eine nicht gefundene Browser-Erweiterung beendet ihre Prüfung nach einem Timeout
  und kann erneut geprüft werden.
- Auf kleinen Bildschirmen bleibt die Desktop-Tabelle verborgen. Die Karten zeigen
  Artikel-, Status- und Einstellinformationen und bieten dieselben Aktionen wie die
  Tabelle.
- Alle Inseratsfunktionen sperren in einer gemeinsamen Reihenfolge. Bei
  Paketartikeln steht der Einkauf vor Advisory Lock, Artikel und Inserat. Die
  zuvor reproduzierbaren Sperrkreise mit gleichzeitigem Verkauf oder einer
  Einkaufsfinalisierung treten dadurch nicht mehr auf.
- Editor, Übersicht und Erweiterungsbrücke besitzen fokussierte Unit-, DOM-,
  Angular- und AXE-Prüfungen. Ein Browserablauf deckt Erstellen, Übergabe,
  Online-Setzen, Beenden und erneutes Einstellen auf Mobilbreite ab; ein zweiter
  Ablauf prüft das Speichern ohne installierte Erweiterung.

## Nachweise

- Der alte Datenbankstand erzeugte in kontrollierten Paralleltests echte
  PostgreSQL-Deadlocks für Verkauf gegen Beenden und Einkaufsfinalisierung gegen
  Online-Setzen. Beide Abläufe liefen nach der neuen Sperrreihenfolge ohne
  Deadlock; fachlich unterlegene Transaktionen werden regulär zurückgewiesen.
- `npm run verify`: erfolgreich mit 1.437 Node-, 240 DOM-, 936 Angular- und 13
  Landing-Tests sowie Format, ESLint, Typprüfung und Produktionsbau.
- `npm run test:db`: 53 Dateien und 1.939 Prüfungen erfolgreich.
- `npm run test:e2e:pr`: sieben Chromium-Abläufe erfolgreich, einschließlich des
  neuen Listing-Studio-Lebenszyklus.
- `e2e/listing-studio.spec.ts`: beide fokussierten Inseratsabläufe erfolgreich.

Der Produktionsbau meldet weiterhin die drei bereits bekannten NG8113-Hinweise zu
ungenutzten `LucideDynamicIcon`-Importen in Dashboard, Einkäufen und Verkäufern.
Diese Warnungen liegen außerhalb des Listing-Studio-Umfangs und blockieren den Bau
nicht.

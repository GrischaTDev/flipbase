# Überarbeitung nach der Screenshot-Abnahme

Auftrag vom 02.11.2026. Umsetzung: Juna. Fortsetzung auf
`juna/vinted-wardrobe-relisting`, Grundlage einschließlich `origin/master`
`79f5f473`. Originalfotos bleiben unverändert; Vorschau und Uploadausgabe sind
davon getrennt.

Zusammengehörige Änderungen werden als vollständige Häppchen umgesetzt und
gezielt geprüft; die Browsermatrix bestätigt anschließend den gesamten Ablauf.
Ein gemeinsamer PR für das gesamte Relist-Feature.

- [x] 1. Alte Datenübernahme entfernen: Editor, Detailbearbeitung, Dialog,
      Quellenauswahl und ausschließlich dafür benötigte Abfragen/Tests. Neue
      Inserate aus einem bestehenden Artikel und gespeicherte Vorlagen erhalten.
- [x] 2. Große Formularmodale: Aktionen in den Kopfbereich, eindeutiger Übergang
      „Relisting festlegen“, keine doppelten unteren Aktionsleisten. Globale
      Projekt- und Gestaltungsregel festhalten.
- [x] 3. Artikelaktionen: Inserieren ausschließlich als Icon mit zugänglichem
      Namen; Preisfortschritt mittig auf dem Rasterbild. Erklärung zur noch
      fehlenden Messhistorie entfernen.
- [x] 4. Kleiderschrank als kompakte Tabelle: Artikel, Alter, Aufrufe, Favoriten,
      Preis und Aktionen. Geplante Anzeigen in derselben Spaltenstruktur,
      Bearbeiten ganz rechts. Auf kleinen Bildschirmen bedienbar erhalten.
- [x] 5. Bildoptionen: Auflösung mit „Keine Änderung“ als Standard, ohne Checkbox;
      Filter „Heller“, „Dunkler“, „Weicher“ sowie weißer Rahmen „Klein“, „Mittel“,
      „Groß“, jeweils optional und mit Vorschau.
- [x] 6. Bildverarbeitung durchgängig: gemeinsame Verarbeitung für Vorschau und
      kurzlebige Uploadausgabe; Optionen in Auftrag, Validierung und erzeugter
      Migration erhalten. Alte Aufträge bleiben lesbar. Keine neue KI-Anbindung.
- [x] 7. Zusammenhängende Prüfung: Originale, Artikelbearbeitung, Planung und
      Vorlage; betroffene Browserfälle mit Touch, Hell/Dunkel und AXE. Neue
      Screenshots für die Abnahme. Ausgeführte Prüfungen und CI-Grenzen festhalten.

## Nachweise

Schritt 1: Typprüfung, 60 betroffene Angular-/Servicefälle und Suite-Audit
erfolgreich; bestehende direkte Entwurfsbearbeitung erhalten. Keine produktiven Inserate für
diese Überarbeitung löschen oder veröffentlichen.

Schritte 2–6: Headeraktionen und Icon-Beschriftungen im bestehenden gemeinsamen
UI-Vertrag; Listenansicht als Tabelle mit festen Spalten, horizontalem Scrollen
und rechter Aktionsspalte. Vier Aktionen passen auch mit großen Touchflächen in
ihre Zelle. Auflösung startet mit „Keine Änderung“. Filter: Helligkeit +8 % oder
−8 %, Weichzeichnung 1 Pixel. Weiße Rahmen: 2/4/6 % der kürzeren Ausgabekante;
das Bild wird proportional eingepasst, der gesamte Ausschnitt bleibt erhalten.
Vorschau des ersten Fotos und Upload verwenden dieselbe Canvas-Funktion, mit
abschließender einmaliger JPEG-Kodierung. Die Bildoptionen gelten für alle Fotos.
Neue Bilddateien werden ausschließlich als kurzlebige Ausgabe erzeugt.

Die optionale Erweiterung des bestehenden JSON-Vertrags akzeptiert alte
Aufträge mit ausschließlich `resize` und `crops`. Migration aus zwei eigenen
Datenbankkopien erzeugt, transaktional auf eine dritte Ausgangskopie angewendet;
abschließender Schemaabgleich ohne Differenz. Typen neu erzeugt, ohne Änderung.
311 SQL-Fälle erfolgreich, darunter neue Parameterprüfung, Erhalt beim Ersetzen
von Bildern und Ausgabeoptionen im angenommenen Auftrag und der Planantwort.
21 native Browserfälle bestätigen Upload, Metadatenentfernung, Filterpixel,
wachsende Rahmen, identische Vorschau-/Uploadausgaben und unveränderte Originale.

Offener Freigabenachweis: Der tatsächliche `npm run preflight` bleibt wegen der
vorgeschriebenen Marketplace-Image-/Hostgrenze unvollständig. Die umfassende
CI-Auswahl einschließlich Linux-Images und Gesamtregression muss vor einem Merge
auf dem wegwerfbaren GitHub-Runner erfolgreich sein. Keine Hostgrenze umgangen
und keine produktiven Vinted-Anzeigen verändert.

Abnahme-Nachweise: 24 betroffene Browserfälle erfolgreich: Raster/Liste bei
320/390/834/1440 Pixeln hell/dunkel, vier Preisabläufe einschließlich mittigem
Status, vier direkte Anbieterentwürfe, vier gespeicherte Entwürfe und vier
Relist-/Vorlagen-/Planungsabläufe. Touch auf kleinen Geräten, Maus für den
Desktop-Relistablauf; AXE im bestehenden Prüfablauf. Bei den gespeicherten
Entwürfen überdeckte ein alter pauschaler RPC-Mock den Fotoquellenabruf; die
Fixture fällt jetzt für diesen Abruf auf den gemeinsamen Mock zurück. Keine
Anwendungsprüfung abgeschwächt. Aktuelle Aufnahmen mit synthetischen Testdaten
liegen privat unter `vinted-refinements-review`; keine Bilder im Repository.
Format-/Lintprüfung in der vollständigen privaten Quellkopie mit denselben
Abhängigkeiten, um fremde ignorierte Hilfsdateien nicht anzufassen.

PR #541: Nutzer hat Push, PR, erfolgreiche Pflichtprüfungen, Merge und Bereinigung
freigegeben. Hauptstand `727d7cfb` eingebunden; Fortsetzung in eigener isolierter
Arbeitskopie zum Erhalt paralleler Erweiterungsdateien. Der erste CI-Lauf fand
fehlende Rendererfreigabe im Docker-Kontext, historische Aufträge ohne
Bildaufnahme, veraltete Browserfallzahlen und eine fest kodierte Zeitzone der
Relist-Testantwort. Zusammenhängend korrigiert, ohne Prüfungen zu lockern. Die
sechste erzeugte Migration erhält alte Bestätigungen ohne erfundene Fotos;
412 SQL-Fälle bestätigen auch den bisherigen Veröffentlichungszeitvertrag.
Reactive-Forms-Sperren verhindern Entwicklerwarnungen im Editor und bei der
Artikelauswahl. Vier UTC-Relistfälle bestehen einschließlich Warnungsprüfung.
Der vollständige neue CI-Nachweis bleibt bis zum grünen PR offen.

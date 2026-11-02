# Originalfotos für Vinted-Inserate

Stand: 02.11.2026. Umsetzung: Juna.

## Speicherung und Anzeige

Flipbase speichert hochgeladene Bilder unverändert im privaten Bucket
`marketplace-listing-media`. Ein manueller Zuschnitt behält die ursprüngliche
Datei und speichert Ausschnitt und Drehung getrennt in `photo_options`. Die
Auflösung ist ebenfalls eine Ausgabeoption. Bearbeitete Vorschauen ersetzen
keine gespeicherten Originaldateien.

Beim Beauftragen eines Relists wird die Quelle mit den unveränderten Bilddaten
gesichert. Nach bestätigter Veröffentlichung wird auch die neue Vinted-Kennung
mit diesem Bildsatz verbunden. `marketplace_listing_photo_sources` hält diese
Zuordnung unabhängig von späteren Änderungen am Arbeitsentwurf fest. Die
Kontobindung berücksichtigt auch die externe Vinted-Kontokennung.

Kleiderschrank, Detailgalerie und Übersicht verwenden diese Originale, auch nach
einem neuen Anbieterimport. Ein weiterer Relist oder eine Vorlage lädt bevorzugt
diese Dateien. Früher bestätigte Aufträge werden beim ersten Abruf zugeordnet;
bei erstmals importierten Artikeln sind die verfügbaren Anbieterdateien die
früheste Quelle. Bereits früher verlorene Kameradateien lassen sich dadurch
nicht wiederherstellen.

## Veröffentlichung

Ein Auftrag enthält einen unveränderlichen Bildsatz und getrennte Ausgabeoptionen.
Der Worker lädt die Originaldatei, prüft sie gegen den Auftrag und erzeugt die
Vinted-Ausgabe erst unmittelbar vor dem nativen Upload. Zuschnitt, Vierteldrehung
und optionale Größenänderung werden gemeinsam auf die Originalquelle angewendet.
Es gibt genau eine abschließende JPEG-Kodierung; ursprüngliche EXIF-Daten werden
nicht übernommen. Die Ausgabedatei bleibt im Arbeitsspeicher und wird weder als
neues Original hochgeladen noch zurück in den Flipbase-Bildsatz geschrieben.

Beim nächsten Relist beginnt die Verarbeitung wieder mit dem Original. Spätere
Bildoptionen müssen dieselbe Trennung verwenden. Rahmen- oder KI-Funktionen sind
mit dieser Änderung nicht ergänzt worden.

## Zugriff und Nachweise

Nur der Auftragsweg darf Originalzuordnungen anlegen. Clients können diese weder
überschreiben noch löschen oder leeren. Der Lesezugriff prüft Arbeitsbereich und
Kontobindung; private Dateien werden mit befristeten URLs geladen. Ein Fehler
beim Laden einer bekannten Originaldatei ersetzt sie nicht stillschweigend durch
ein bearbeitetes Anbieterbild.

Die Migration wurde aus zwei isolierten Schemakopien desselben vollständigen
Ausgangsmigrationsstands erzeugt; nur die beauftragten Fotodefinitionen wurden
auf die Arbeitskopie angewendet. Der zusätzliche
automatisch erzeugte Rechteabgleich berücksichtigt die beim Anlegen einer
Tabelle wirksamen Supabase-Standardrechte. Die vollständige Migration wurde
anschließend transaktional auf eine frische Ausgangskopie angewendet.

Regressionen prüfen unveränderte Uploadquellen nach Zuschnitt, getrennte
Ausgabeparameter, metadatenfreie JPEG-Ausgabe, identische Ergebnisse wiederholter
Verarbeitung derselben Quelle, Originalgalerien und erneutes Relisten. Native
Browserfälle verwenden synthetische Anbieterformulare; echte Inserate wurden
dafür weder gelöscht noch veröffentlicht.

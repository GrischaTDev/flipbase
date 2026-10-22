# Inseraterstellung vereinfachen

Stand: 21.10.2026. Juna. Grundlage sind die konkreten Bedienungsentscheidungen des Nutzers und der bestehende Stand `28bd8878` nach PR #455. Dieses Dokument beschreibt die Umsetzung vor Codeänderungen.

## Ziel und Umfang

Die Inseraterstellung soll dem vertrauten Ablauf auf Vinted folgen und die vorhandenen Flipbase-Bausteine verwenden. Fotos, Texte, Artikeldetails und Preis werden ohne zusätzliche Auswahlmodals bearbeitet. Die gesonderte Veröffentlichungsprüfung bleibt erhalten. Relisting ist ein späterer Auftrag.

Die beauftragte Vintz-Untersuchung ist in [der KI-Analyse](../../research/2026-10-21-vintz-listing-photo-ai.md) dokumentiert. Automatische Foto-KI, Preisrecherche und ein Prozent-Score werden nicht stillschweigend Teil dieses Bedienungsumbaus. Die Forschung empfiehlt einen nachfolgenden begrenzten Modellvergleich.

## Aufbau und Texte

- Gemeinsamer Seitenkopf mit Entwurf speichern und Veröffentlichung vorbereiten; kurze Statuszeile.
- Linke Hauptspalte: zuerst **Fotos**, darunter **Titel und Beschreibung**.
- Rechte Spalte: **Artikeldetails** mit Zielkonto, Kategorie, Marke, Größe, Zustand, Farbe und Material; danach **Preis und Versand** mit Verkaufspreis und Paketgröße. Auf kleinen Geräten dieselbe verständliche Reihenfolge untereinander.
- Bestehende Vorlagen und Auftragsverlauf bleiben nachgeordnet verfügbar, ohne die Eingabe mit technischen Erklärungen zu unterbrechen.
- Feldname **Kategorie**, Speicherbestätigung **Entwurf gespeichert**.
- Die beanstandeten Texte über reine Flipbase-Speicherung, Einkaufskosten, freie Vorbereitung und den manuellen Abruf der Vinted-Angaben entfallen. Zeichenzähler und konkrete Lade-/Fehlerzustände bleiben dort, wo sie eine Handlung ermöglichen.

## Hinweise und Prüfung

Beim Öffnen eines leeren oder unvollständigen Entwurfs erscheinen keine Aufforderungen, fehlende Veröffentlichungsangaben zu ergänzen. Die Prüfung selbst wird davon unabhängig berechnet.

**Entwurf speichern** erlaubt weiterhin unvollständige Entwürfe. Erst nach diesem Versuch erscheinen Fehler, die das Speichern tatsächlich verhindern, etwa eine ungültige Zahl. Ein fehlender Titel oder Verkaufspreis wird nicht zur künstlichen Speichersperre. **Veröffentlichung vorbereiten** ist bei fehlenden Angaben erreichbar, zeigt nach dem Versuch passende Fehler am Feld und setzt den Fokus auf die erste erforderliche Korrektur. Ein ungültiger Entwurf öffnet keine erfolgreiche Vorschau und erzeugt keinen Auftrag. Nach Korrekturen werden die eingeblendeten Fehler aktualisiert. Berechtigungs- und Ladefehler werden unabhängig davon verständlich angezeigt.

Tatsächliche Dateifehler erscheinen nach dem Hinzufügen der betroffenen Datei sofort. Vorlagenplatzhalter werden erst nach einer dazugehörigen Handlung beziehungsweise der angeforderten Prüfung als Fehler gezeigt. Der Entwurfsstatus und die vorhandene Konfliktbehandlung bleiben korrekt.

## Gemeinsame Bildbedienung

Die vorhandene `ProductMediaEditorComponent` aus Artikel erstellen liefert die sichtbare Galerie: großes Hauptbild, sauberes Raster, Hinzufügen-Kachel, Ziehen mit Touch-Verzögerung sowie Bilddetails für Name, Position, Hauptbild, Löschen und Zuschneiden. Keine zweite nachgebaute Galerie. Ein dünner Adapter für Inseratbilder darf vorhandene Speicherpfade und Bildkennungen abbilden; Datenbankzugriffe bleiben außerhalb der gemeinsamen Komponente.

Vinted behält die tatsächliche Begrenzung auf 20 Bilder und JPEG/PNG/WebP. Die gemeinsame Komponente erhält dafür konfigurierbare akzeptierte Formate, Bildgrenze, Bearbeitungsstatus und Zuschnittvorgabe. Änderungen an Name/Reihenfolge/Zuschnitt bleiben bis zum Speichern im Entwurf. Kein Datenverlust bei langsamen Dateilesern oder Schließen eines Bilddialogs. Reine Namensänderungen dürfen bestehende Bildpfade nicht verlieren; geänderte Bilddateien werden als neue Datei gespeichert.

Der Zuschneider bekommt eine konfigurierbare Verhältnisvorgabe. Für Inserate ist **2:3 im Hochformat** vorgesehen, mit verschiebbarem Ausschnitt und Tastaturbedienung. Am 21.10.2026 an fünf sichtbaren Angebotsbildern der aktuellen Vinted-Startseite gemessen: etwa 235,19 × 352,78 Pixel, Verhältnis 0,6667, `object-fit: cover`. Lokaler Nachweis: `listing-usability/vinted-card-geometry.json` im Sitzungsordner. Das ist die beobachtete Desktop-Katalogdarstellung und unsere gewählte Zuschnittvorgabe, keine behauptete Pflicht des Vinted-Uploads. Bestehende Bilder werden beim Laden oder Hinzufügen nicht automatisch beschnitten. Die bisherigen Verbraucher behalten ihre bisherigen Vorgaben, sofern der Nutzer keinen weitergehenden Umbau beauftragt. Die konkrete 2:3-Vorgabe wird vor Umsetzung in der Entwurfsfreigabe genannt.

## Kategorie und direkte Auswahlfelder

Der bestehende gemeinsame Kategoriepicker bleibt suchbar und hierarchisch navigierbar. Das feste `h-96` entfällt zugunsten einer Höhe passend zum Inhalt mit begrenzter maximaler Höhe; viele Treffer scrollen. Das Panel bleibt auf schmalen Geräten und nahe dem Bildschirmrand sichtbar. Tastatursteuerung, Fokus und Suche über Kategoriepfade bleiben erhalten. Es wird keine gesonderte Kategorienkopie für Vinted angelegt.

Nach Wahl einer Kategorie werden die aktuellen Vinted-Angaben automatisch im Hintergrund geladen, sobald ein gültiges verbundenes Zielkonto vorhanden ist. Größe und Zustand werden direkte Auswahlfelder. Farben und Materialien werden direkte Mehrfachauswahlen mit den tatsächlich gültigen Werten; höchstens zwei Farben beziehungsweise drei Materialien. Paketgröße wird direkt ausgewählt und mit kurzer verständlicher Bezeichnung angezeigt, ohne zusammengeklebten Hilfe-/Linktext.

Der bisherige Dialog **Vinted-Angaben auswählen** entfällt im Editor. Ein Fehler beim Laden zeigt eine einzige kurze Meldung und **Erneut laden** an der betroffenen Auswahl. Titel, Beschreibung, Bilder und Entwurfsspeicherung bleiben benutzbar. Ohne Konto/Kategorie bleiben die davon abhängigen Felder ruhig deaktiviert; kein technischer Aufklärungsblock.

Geprüfte Feldkataloge werden während der Editorsitzung begrenzt zwischengespeichert und laufende identische Abrufe zusammengefasst. Schlüssel sind Benutzer, Workspace, Konto, externe Kontoidentität, Verbindungsstatus/-modus und Kategorie. Kein gemeinsamer ungebundener Farb-/Materialkatalog, der versehentlich IDs aus einer anderen Kategorie bestätigt. Konto-/Kategoriewechsel und Rechteverlust verwerfen unpassende Antworten. Bei der Veröffentlichungsprüfung wird wie bisher frisch geprüft. Eine dauerhafte Backend-Katalogspeicherung ist für diesen Umbau nicht erforderlich und wird nicht als bereits vorhanden dargestellt.

Marke wird ein Texteingang mit Vorschlagsliste aus der bestehenden Vinted-Markensuche. Suche kurz verzögern, alte Antworten verwerfen, Ladezustand und Wiederholung direkt im Feld. Auswahl speichert echte ID und Bezeichnung. Weiteres Tippen hebt eine frühere bestätigte Auswahl auf; freier Text bleibt als Entwurf möglich und wird erst zur Veröffentlichung als unbestätigt beanstandet. **Keine Marke** bleibt ausdrücklich wählbar. Die gesamte Vinted-Markendatenbank muss dafür nicht vorab importiert werden.

Für die Vorschlagsliste vorhandene gemeinsame Auswahl-/Eingabemechanik verwenden beziehungsweise gezielt für externe Suchergebnisse erweitern. Fachliche Anfragen bleiben im Marketplace-/Markenservice; keine neue Shared-Komponente mit Datenbankzugriff.

## Erhaltene Grenzen

Rechte, Kontoidentität, echte Vinted-IDs, Revisionskonflikte, unveränderte Originalfotos und die gesonderte Auftragsfreigabe bleiben verbindlich. Der JAKO-Entwurf darf intern zur Prüfung verwendet werden. Das vorhandene Inserat bleibt unverändert und wird nicht dupliziert. Keine neue Abhängigkeit und keine Datenbankmigration vorgesehen.

## Abnahme

1. Neue Maske öffnet ohne Pflichtfeldwarnungen und beanstandete Texte; Fotos stehen zuerst.
2. Unvollständiger Entwurf kann gespeichert werden; Status lautet Entwurf gespeichert.
3. Eine angeforderte Veröffentlichung ohne Pflichtangaben führt zu konkreten Feldfehlern und Fokus; kein Auftrag entsteht.
4. Die Artikelgalerie wird sichtbar wiederverwendet; Hinzufügen, Ziehen, Hauptbild, Name, Position, Löschen, Zuschneiden, Abbrechen und Wiederöffnen funktionieren ohne Verlust.
5. 2:3-Zuschnitt ist voreingestellt und verschiebbar; andere Verbraucher ändern ihr Verhältnis nicht versehentlich.
6. Kategorieauswahl passt sich wenigen Einträgen an und bleibt mit vielen Einträgen und am Bildschirmrand bedienbar.
7. Marke, Größe, Zustand, Farben, Materialien und Paketgröße sind ohne Zusatzmodal auswählbar; gültige IDs werden gespeichert und zurückgelesen.
8. Schneller Konto-/Kategoriewechsel, gescheiterter Abruf und verspätete Antworten überschreiben keine aktuellen Angaben. Alte Entwürfe und Vorlagen bleiben bearbeitbar.
9. Betroffene bestehende Browserfälle auf Desktop/Mobil, Touch, Hell/Dunkel, Tastatur und AXE sowie ausgewählte Modell-/Angular-Tests, Lint, Format, Typen und Angular-Bau erfolgreich.

# Kleinanzeigen ohne blockierende Kategorieprüfung

## Auftrag und Entscheidungen

- Kategoriebaum vollständig und lokal verwenden; keine Liveprüfung beim Auswählen.
- Inserieren ohne Kategorie erlauben. Die Erweiterung öffnet das vorbefüllte Formular, übernimmt eine gewählte Kategorie und zeigt fehlende Angaben dort an. Der Nutzer kann dort fertigstellen.
- Neue Inserate starten mit Verhandlungsbasis und Versand/Abholung. Gespeicherte bewusste Werte bleiben erhalten.
- Keine Option „Nur Versand“ ergänzen: Kleinanzeigen schließt sie in seiner offiziellen Hilfe ausdrücklich aus.
- Mehrfachauswahl auf der Kleinanzeigen-Seite erhält „Ausgewählte neu inserieren“. Inhalte und Bilder vor jeder Löschung sichern; Konto, Kosten und Ergebnis prüfen; unklare Schreibversuche niemals blind wiederholen.

## Umsetzung

1. Bestehende Sperren durch Tests nachvollziehen. Lokalen Baum vollständig freigeben und Standards korrigieren.
2. Den Formularassistenten kontogebunden aus dem Übertragungsdialog öffnen. Kategorie und Inhalte getrennt von der automatischen Veröffentlichung behandeln. Kategorienavigation erhält die Daten auch über Seitenwechsel und bei unbekannten Kategorien.
3. Erneutes Inserieren als dauerhaften Erweiterungsablauf mit vorher gesicherter Fassung, nachvollziehbaren Einzelzuständen und sichtbaren Fehlern integrieren.
4. Betroffene Modell-, Komponenten-, Erweiterungs- und Browserfälle prüfen, dazu Format/Lint, Typen, Shared-UI und Produktionsbau. Tatsächliche CI-Auswahl kontrollieren.

## Grenzen

Keine produktiven Anzeigen während der Entwicklung löschen oder veröffentlichen. Anbieteroberfläche lesend prüfen. Echte Löschung/Neuveröffentlichung bleibt bis zu einem ausdrücklich bestimmten Live-Test unbestätigt.

## Quellen

- [Versand und notwendige Abholmöglichkeit](https://hilfe.kleinanzeigen.de/hc/de/articles/17089202962588-An-welchem-Ort-darf-ich-meine-Produkte-Dienstleistungen-oder-Jobangebote-einstellen)
- [Anzeigenlimit zählt auch erneut aufgegebene Anzeigen](https://hilfe.kleinanzeigen.de/hc/de/articles/17087642921628-Geb%C3%BChren-bei-Kleinanzeigen)

## Prüfnachweise

- Vollständiger Ausgangslauf: Node 232 Dateien/2706 Fälle, Angular 268 Dateien/2852 Fälle, DOM 48 Dateien/354 Fälle erfolgreich. Anschließend neun zusätzliche Modellfälle und die betroffenen vier Angular-Dateien mit 47 Fällen gezielt erfolgreich geprüft.
- Workflow: 568 Fälle bestanden, sechs bestehende Auslassungen. Auswahl und Registrierung: 49 Fälle erfolgreich, Suite-Audit mit 549 Dateien. Shared-UI: 250 Dateien ohne Befund.
- Produktionsbau einschließlich Angular-Vorlagen, Typprüfung, Lint und Formatprüfung erfolgreich; PWA-Bau `f8a0a3c8cb4b` mit 279 geprüften Dateien.
- Oberfläche: 39 Fälle in den beiden betroffenen Browserdateien erfolgreich, zusätzlich zwei Maus-/Tastaturfälle in Hell/Dunkel. Bestehende Touch-Breiten von 320 bis 1440 Pixel, AXE, Fehlerzustände, Kontowechsel und Rückfokus geprüft. Ruhender Produktionsbau auf Port 4247, ausschließlich lokale Testantworten.
- Echte MV3-Erweiterung unter Windows und Linux: manuelles Formular, Kategorienavigation, geänderte Fassung, erneuerte Bild-URL mit stabiler Bildkennung, gesicherte Originalbildbytes vor Löschung, verzögerte Löschbestätigung, genau ein Submit und bestätigte neue ID. Worker- und Browserneustart wiederholen keinen Schreibklick. Zusätzlich Neuladen des Assistententabs als Regression geprüft.
- Linux: offizielles Playwright-Image `v1.62.1-noble`, Chromium `151.0.7922.34`, Node `22.23.4` (CI-Hauptversion 22), zwei CPUs/vier GiB, isolierte Projektkopie einschließlich versteckter Konfigurationen. Keine fremden Container angehalten oder verändert.
- Unabhängiger Review: gesicherte Recovery, neue Freigabegeneration desselben Kontos, kontogebundene Wiederaufnahme, vollständige Bilder, einmalige Löschung und erneuerte Bildsignaturen geprüft. Gefundene Fehler korrigiert; insbesondere exakte Bildpfade und Reihenfolge statt bloßer Anzahl vor jedem Lösch-/Veröffentlichungsklick prüfen.
- Abschließend auf den inzwischen aktuellen Hauptzweig `4a7c12d2` aufgesetzt. Konflikt ausschließlich im Sitzungsprotokoll unter Erhalt beider Einträge gelöst; der geprüfte Erweiterungsstand bleibt identisch. Danach erneut 47 betroffene Angular-Fälle, 49 Auswahl-/Registrierungsprüfungen, Typprüfung, Produktionsbau `02e1f6beac25` und alle 41 betroffenen Oberflächenfälle erfolgreich. Der abschließende Linux-Lauf enthält auch den zuerst rot nachgewiesenen Reloadfall. Eigene Vorschau anschließend beendet, keine Anbieterdienste oder andere Arbeitskopien verändert.

Die geänderte verbindliche Browser-Sollliste führt in der echten CI-Auswahl zu einem breiten Lauf. Die vollständige Datenbank-/PWA-/fachfremde Browsermatrix wurde lokal nicht wiederholt und bleibt vor Merge Aufgabe der Pflichtprüfungen. Der bestehende Inseratstudio-Fall benötigt die lokale Testdatenbank; auf deren festem Anschluss `127.0.0.1:54351` lauscht kein Dienst. Seine Komponenten sind durch den vollständigen Angular-Lauf und den Produktionsbau geprüft, der datenbankgestützte Browserfall bleibt offen. Die lokalen Sichtnachweise zeigen wegen des absichtlich blockierten Service Workers den allgemeinen Hinweis zur Updateprüfung. Keine produktiven Anbieter-Schreibaktionen oder echte Safari-/Geräteprüfung. App und Erweiterung 1.11.0 müssen gemeinsam bereitgestellt werden. Logs: `C:/Users/Grisc/AppData/Local/Temp/flipbase-ka-*`.

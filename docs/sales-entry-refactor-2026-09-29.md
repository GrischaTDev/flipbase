# Verkaufserfassung: Umbau und Prüfstand

29.09.2026 – Juna

## Auftrag und Umfang

Die Verkaufserfassung folgt dem Aufbau von „Einkauf erstellen“: gemeinsame Karten,
Zweispaltenlayout, Bestandsauswahl links sowie Übersicht und Verkaufsdetails rechts.
Speichern und Abbrechen stehen oben rechts. Andere Einbettungen behalten ihre
Formularaktionen. Inserate steht direkt nach Verkäufe in der Navigation.

Der Mengenbestand wird beim Öffnen ausdrücklich geladen. Fehler lassen sich
wiederholen. Die Auswahl ist durchsuchbar; die bisherigen Verkaufs- und
Archivierungssperren bleiben bestehen. Doppelte Speicheranfragen werden blockiert.
Ein Bestandsrefresh setzt bearbeitete Verkaufsdaten nicht zurück.

## Prüfstand vor den vollständigen PR-Prüfungen

Die 17 isolierten Node-Prüfungen aus dem vorbereiteten Änderungspaket wurden
am 29.09.2026 erneut erfolgreich ausgeführt. Der Patch wurde außerdem auf
seinen geprüften Ausgangsdateien angewendet; die sieben resultierenden
Quelldateien stimmen mit dem Änderungspaket überein.

Im lokalen Arbeitscontainer fehlen das vollständige Checkout und die
Projektabhängigkeiten. Angular-Tests, Typprüfung, Formatierung, Lint und Build
müssen deshalb durch die vorhandene GitHub-CI bestätigt werden. Kein Merge
mit fehlenden oder fehlgeschlagenen Pflichtprüfungen.

Eine gesonderte visuelle Browserabnahme und eine Buchung mit echten
Produktivdaten wurden nicht durchgeführt. Dashboard, fremde Zweige und
Produktivdaten bleiben außerhalb dieses Umbaus.

Das vorhandene große KI-Änderungsprotokoll wird nicht durch eine unvollständige
Kopie ersetzt; dieses Dokument hält den Sitzungsstand separat fest.

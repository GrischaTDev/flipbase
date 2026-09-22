# Eigenbeleg beim Einkauf

Stand: 23. September 2026. Abgestimmt im Chat: ein sichtbarer Schalter im
Verkäuferbereich, keine zweite Einkaufsmaske. Zusätzlich entfällt der Untertitel
„Originaldateien zu diesem Einkauf“ aus der Belegkarte.

## Ziel

Ein Einkauf lässt sich ohne Verkäufer aus den Stammdaten erfassen, wenn der
Verkäufer nicht eindeutig identifiziert werden kann. Kaufdatum, Positionen,
Beträge, Bezugsquelle, Referenznummer und Beleg-Upload bleiben am bisherigen Ort.
Ein Eigenbeleg wird aus diesen Angaben erzeugt, ohne sie erneut einzutippen.

## Bedienung

- Oben im Verkäuferbereich stehen die zwei Modi „Verkäufer wählen“ und
  „Eigenbeleg“ als gemeinsame, barrierefreie Auswahl. Der Standard bleibt
  „Verkäufer wählen“.
- Im Modus „Eigenbeleg“ ersetzt „Verkäuferangabe, falls bekannt“ die
  Verkäuferauswahl. Das Feld ist optional und kann einen Plattformnamen oder
  eine andere nachvollziehbare Kennung enthalten. Die Bezugsquelle steuert den
  Modus nicht automatisch.
- Beim Wechsel werden unpassende Verkäuferangaben im Formular entfernt; das
  Wechseln selbst erzeugt noch keinen Beleg. Bei bereits gespeicherten Entwürfen
  ist der Modus erneut bearbeitbar.
- Die vorhandene Referenznummer nimmt gegebenenfalls eine Transaktions-ID auf.
  Vorhandene Nachweise können weiterhin als „Kaufnachweis“ hochgeladen werden.

## Speicherung und Anzeige

`purchases.receipt_mode` enthält `external` oder `self`, Standard `external`.
Im Modus `self` ist `supplier_id` leer. Die optionale Verkäuferangabe wird als
Snapshot am Einkauf gespeichert und in Liste, Detailansicht und Druck angezeigt.
Der Modus wird über dieselben atomaren Funktionen wie die übrigen Einkaufsdaten
angelegt und in Entwürfen geändert. Die Datenbank verhindert Kombinationen aus
`self` und einer gespeicherten Verkäufer-ID. Bestehende Einkäufe behalten den
Standardmodus.

## Erzeugung

Beim Abschließen eines Einkaufs im Modus `self` erzeugt Flipbase ein PDF aus
dem abgeschlossenen Stand: interne Einkaufsnummer, Kaufdatum, Ausstellungsdatum,
Workspace als Aussteller, Bezugsquelle und bekannte Verkäuferangabe,
Referenznummer, Positionen, Kosten und Gesamtbetrag. Als Grund wird
„Verkäufer nicht vollständig identifizierbar“ angegeben. Zusätzliche
Originalnachweise bleiben eigene Dateien. Ein fehlender Klarname wird nicht als
bekannter Verkäufer ausgegeben und eine Plattformquelle nicht als Beweis für
einen Privatverkauf gewertet.

Der Eigenbeleg wird im privaten Einkaufsbeleg-Bucket mit eigener Belegart
gespeichert. Die Einkaufsnummer dient als Referenz; ein separates Nummernsystem
ist nicht nötig. Erzeugte Eigenbelege sind unveränderlich. Wird ein Einkauf
später wieder geöffnet und erneut abgeschlossen, bleibt der frühere Beleg
erhalten und es entsteht eine neue, erkennbare Fassung.

Schlägt das PDF-Speichern nach erfolgreichem Abschluss fehl, zeigt die
Detailseite einen klaren Fehler und „Eigenbeleg erneut erstellen“. Dieselbe
Abschlussfassung darf höchstens einen Eigenbeleg erhalten. Ein fehlgeschlagener
Upload darf keinen Belegdatensatz ohne Datei hinterlassen.

## Grenzen und Prüfung

Der Modus ist eine Nutzerentscheidung und keine automatische steuerliche
Beurteilung eines hochgeladenen Plattformdokuments. Belege und Kosten bleiben
getrennt. Die bestehende Kostenaufteilung für Artikel, Versand und Gebühren
wird nicht geändert.

Zu prüfen sind die Umschaltung und Validierung im Formular, Speicherung und
erneute Bearbeitung, Anzeige in Liste und Detail, PDF-Inhalt einschließlich
Umlauten und mehreren Positionen, einmalige Erzeugung je Abschlussfassung,
Wiederholung nach Fehler, Unveränderlichkeit sowie die bestehenden Rechte für
private Einkaufsbelege. Für die UI gelten die vorhandenen Shared-Komponenten,
AXE- und Bauprüfungen.

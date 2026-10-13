# Einfachere Artikel-, Einkaufs- und Verkaufsabläufe

Stand: 13. Oktober 2026. Vorschlag aus der Codeanalyse; noch kein umgesetzter
Funktionsstand. Die bereits vorbereitete Vereinfachung der Artikelliste bleibt erhalten.

## Ziel

Flipbase konzentriert die Oberfläche auf Artikel erfassen, einkaufen und verkaufen.
Bestandsabgänge, Retouren und Korrekturen sind kurze verständliche Abläufe.
Einkaufsherkunft, Kosten und Änderungsverlauf bleiben im Hintergrund nachvollziehbar.

## Bestätigte Befunde

- Löschen ist nicht allein von der Stückzahl abhängig. Bereits vorhandene
  Einkaufspositionen, Lagerlose, Verkäufe, Inserate und weitere Beziehungen
  verhindern das endgültige Löschen. Auch Nullbestand bedeutet daher nicht
  automatisch, dass ein Artikel löschbar ist.
- Archivieren verändert weder Bestand noch Bestandswert. Ein beschädigtes
  Stück wird damit nicht als Lagerabgang erfasst.
- Die Variantenkomponente bietet Hinzufügen und Öffnen, aber keine Aktion
  zum Entfernen oder Archivieren einer Variante.
- Das Datenmodell kennt Beschädigung und Verlust als Bestandsbewegungen.
  Ein allgemeiner Ablauf für solche Abgänge direkt aus der Artikelseite fehlt;
  eine Abschreibung im Retourenablauf ersetzt ihn nicht.
- Die Verkaufsliste zeigt standardmäßig Einkaufskosten, Verkaufskosten
  und Haltedauer zusätzlich zu Betrag, Gewinn und Marge.
- Die Haltedauer wird am Einzelstück im Verkaufskopf berechnet. Fehlt dessen
  Einkaufsdatum, bleibt sie bei null; die vorhandenen Einkaufsbeziehungen in
  Mengenverkaufspositionen werden hierfür nicht genutzt. Null ist deshalb
  kein verlässlicher Nachweis eines Verkaufs am Einkaufstag.
- „Prüfbeleg“ führt zu einer Druckansicht mit Titel „Prüfprotokoll“.
  Es handelt sich um die Aufzeichnung von Vorgängen, nicht um eine Kundenrechnung.
- Die Rechnungserstellung meldet fehlende Unternehmensdaten allgemein,
  obwohl der Fehler bereits die einzelnen fehlenden Felder enthält.
  Welche Felder im echten Konto fehlen, wurde nicht geprüft.

## Artikel und Varianten

Eine verständliche Aktion „Aus Bestand entfernen“ für Stammartikel, Einzelstücke
und einzelne Varianten ergänzen. Der Dialog fragt nur Menge, Grund und bei Bedarf
eine kurze Notiz ab. Gründe: beschädigt, verloren oder Erfassung korrigieren.

Beispiel: Drei Paar Schuhe in Größe 42, eines beschädigt → Menge 1,
Grund „Beschädigt“ → zwei Paar bleiben auf Lager. Der ursprüngliche Einkauf
bleibt erhalten; der Abgang nennt Datum, Menge, Grund und betroffene Ware.
Es entsteht kein Verkauf und keine zweite Ausgabe für einen bereits bezahlten Einkauf.
Eine falsche Erfassung muss als Korrektur behandelt werden, nicht als Beschädigung.

Archivieren bleibt eine getrennte Aktion zum Ausblenden eines Artikels oder
einer Variante. Nach dem Entfernen des letzten Stücks bleibt der Artikel mit
Nullbestand erhalten; das Archivieren kann direkt angeboten werden.
Unbenutzte Fehleingaben können endgültig gelöscht werden.

Bei Varianten dieselben Aktionen direkt an jeder Variantenzeile anbieten.
Andere Größen und Farben bleiben erhalten. Das Entfernen des Gruppenartikels
darf zugehörige Varianten nicht stillschweigend mitlöschen.
Reservierungen, laufende Verkäufe oder Inserate müssen vor einem Abgang eindeutig
aufgelöst werden. Gleichzeitige Aktionen dürfen den Bestand nicht unter null senken.

## Verkaufsliste

Standardansicht: Datum, Artikel, Menge, Verkaufsbetrag, Gewinn und Marge.
Verkaufsnummer und Plattform können kompakt als Zusatzangaben am Artikel stehen.
Die Verkaufsnummer bleibt als dauerhafte Zuordnung und Suchmerkmal erhalten.

„Verkaufsbetrag“ benennt den gesamten Betrag einschließlich erhaltenem Versand;
die genaue Aufteilung gehört in die Details. Die aktuelle Umsatzgröße darf
nicht einfach als reiner Artikelpreis umbenannt werden.
Gewinn bleibt das Ergebnis nach Einkaufs- und direkten Verkaufskosten.
Allgemeine Betriebsausgaben und Steuern sind darin nicht abgezogen.
Ungeklärte Einkaufskosten bleiben als „Kosten noch offen“ erkennbar.

Oben reichen Verkaufsanzahl und Gesamtgewinn. Die durchschnittliche Haltedauer
entfällt hier; eine spätere Auswertung braucht zuerst eine korrekte Berechnung,
die unbekannte Werte nicht als null Tage behandelt.
Einkaufskosten und Gebühren/Versand bleiben bei Bedarf in Details oder
zusätzlichen Spalten zugänglich. Eigene bewusst angepasste Ansichten erhalten.

Rechnung und Retoure/Gutschrift sind normale Verkaufsaktionen.
„Chronik“ und der Prüfexport gehören in Details beziehungsweise „Weitere Aktionen“;
der allgemeine Export bleibt unter Einstellungen erreichbar.
Für einen Verkauf ohne Rechnung lautet die Aktion „Rechnung erstellen“,
für eine vorhandene Rechnung „Rechnung anzeigen“.
Bei unvollständigem Unternehmensprofil konkret die fehlenden Felder und den
direkten Weg zu Einstellungen → Unternehmen anzeigen.

## Einkäufe und Korrekturen

Im Alltag Datum, Einkauf, Gesamtbetrag und einen verständlichen Status zeigen.
Positionen, Kostenaufteilung, Wareneingänge und Belege bleiben in den Details.
Entwürfe können geändert oder gelöscht werden. Für bereits gebuchte Vorgänge
verständliche Korrektur- und Rückabwicklungsaktionen anbieten, die den bisherigen
Stand nachvollziehbar erhalten. Retoure und Storno unterscheiden.

Die Vorgabe, ursprüngliche Aufzeichnungen nachvollziehbar zu erhalten, folgt
aus [§ 146 Abs. 4 AO](https://www.gesetze-im-internet.de/ao_1977/__146.html).
Die vorgeschlagene Anordnung der Oberfläche ist eine Produktentscheidung,
keine gesetzliche Pflicht zu sichtbaren Chronik- oder Prüfbuttons in jeder Zeile.

## Umsetzungsschritte

1. Bestandsabgang und Variantenaktionen gemeinsam umsetzen, einschließlich
   Schema, erzeugter Migration, Typen und Datenbanktests. Menge, Reservierung,
   Kostenherkunft, Wiederholungen und Workspace-Grenzen prüfen.
2. Verkaufsliste und ihre gespeicherten Standardansichten vereinfachen;
   Details, Prüfexporte und Retouren weiter erreichbar halten.
3. Rechnungsaktion mit verständlicher Feldliste verbessern und die
   Einkaufsabläufe anschließend nach denselben Regeln durchgehen.

Die lokale Test-Supabase war während dieser Analyse nicht erreichbar.
Die Funktionsänderungen erfordern vor Abschluss passende lokale beziehungsweise
isolierte Datenbanktests sowie Browserprüfungen.

## Umgesetzter Stand am 13. Oktober 2026

Bestandsabgang, Variantenaktionen, kompakte Verkaufsübersicht und konkrete
Rechnungsfehlermeldungen sind lokal umgesetzt und geprüft. Die neue Migration
bewahrt Bestandsabgänge und ihre Kosten unveränderlich; der ursprüngliche Einkauf
bleibt erhalten. Die Browserprüfung verwendet eine getrennte lokale Test-Supabase.
Das Abschlussprotokoll mit Prüfumfang steht in `docs/AI-CHANGELOG.md`.
Die Einkaufsübersicht bleibt für einen anschließenden eigenen Auftrag offen.

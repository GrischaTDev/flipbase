# Warenwirtschafts- und Verkaufsmodell – Design

**Datum:** 2026-08-26  
**Status:** fachlich freigegeben, noch nicht implementiert

## Ziel

Flipbase wird von einer reinen Einzelartikel-Verwaltung zu einer nachvollziehbaren Warenwirtschaft erweitert. Gleichartige Neuware kann mit Menge geführt und in einer aufgeräumten Bestandszeile verkauft werden. Einzelstücke und Mystery-Box-Inhalte bleiben einzeln erfassbar. Einkauf, Bestand, Verkauf, Auswertung und Shop verwenden dieselben fachlichen Daten.

Der Kernfluss lautet:

```text
Artikelstamm → Einkauf mit Positionen → Wareneingang / Bestandslos → Verkauf mit Positionen → Dashboard und Steuerdaten
```

## Fachliche Begriffe

| Begriff          | Bedeutung                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Artikelstamm     | Wiederverwendbare Definition eines gleichartigen Artikels, z. B. „LED-Lampe“, mit Titel, Marke, Modell, EAN und Standarddaten. |
| Einkauf          | Belegkopf mit Lieferant, Quelle, Kaufdatum, Beleg, Versand und weiteren Nebenkosten.                                           |
| Einkaufsposition | Eine Zeile innerhalb eines Einkaufs: Artikel, Menge, Stückpreis, Positionssumme und gegebenenfalls Steuern.                    |
| Bestandslos      | Die tatsächlich eingegangene Menge einer Einkaufsposition mit nachvollziehbaren Stückkosten und Restmenge.                     |
| Bestandsbewegung | Unveränderbarer Zu- oder Abgang mit Grund, Menge, Zeitpunkt und fachlicher Referenz.                                           |
| Einzelstück      | Ein individuell zu verwaltender Gebrauchtartikel oder Mystery-Box-Inhalt mit Bestand eins.                                     |
| Verkauf          | Belegkopf mit Plattform, Verkaufsdatum, Käufer- und Zahlungsdaten sowie Kosten.                                                |
| Verkaufsposition | Artikel, Menge, Verkaufspreis je Stück, Erlös und entnommene Bestandlose innerhalb eines Verkaufs.                             |

## Zielarchitektur

### Artikelstamm

Neue gleichartige Ware wird als Artikelstamm angelegt oder beim Einkauf aus bestehenden Artikelstämmen ausgewählt. Ein Artikelstamm hat keine eigene verfügbare Menge; diese entsteht ausschließlich aus Bestandlosen und Bestandsbewegungen.

Artikelstämme dienen als Vorlage und enthalten nur Informationen, die bei gleichartigen Stücken sinnvoll sind. Einkaufspreise, Lieferant, Beleg und Herkunft liegen nicht am Artikelstamm, sondern an der jeweiligen Einkaufsposition bzw. dem Bestandslos.

### Einkauf und Einkaufskosten

Der bisherige Einkauf bleibt der Belegkopf. Er erhält beliebig viele Einkaufspositionen. Eine Position erfasst mindestens:

- bestehenden Artikelstamm oder die Entscheidung „neuer Artikelstamm“;
- Menge größer als null;
- Stückpreis oder Gesamtpreis; der jeweils dritte Wert wird berechnet;
- optional Lieferanten-SKU, Steuersatz und Hinweis zur Position.

Versand und weitere Beschaffungskosten bleiben am Einkauf. Sie werden nachvollziehbar auf die Positionen bzw. die daraus entstandenen Bestandlose verteilt. Die gewählte Verteilung wird gespeichert. Ein Gesamtpreis wird nie versehentlich als Stückpreis vervielfacht.

Der Einkaufsstatus unterscheidet mindestens Entwurf, bestellt, teilweise eingegangen, vollständig eingegangen und archiviert. Das Anlegen eines Einkaufs erhöht den verfügbaren Bestand noch nicht.

### Wareneingang und Bestandlose

Der Wareneingang bestätigt die tatsächlich erhaltene Menge. Er erzeugt je Einkaufsposition ein Bestandslos mit Einkaufsreferenz, eingegangener Menge, Restmenge und den finalen Stückkosten einschließlich zugeteilter Beschaffungskosten.

Ein Einkauf kann teilweise eingehen. Die Differenz zwischen bestellter und erhaltenen Menge bleibt sichtbar; bei Mystery-Boxen ist eine erwartete Menge optional und darf unbekannt bleiben.

### Bestandsbewegungen

Jede Mengenänderung wird als Bestandsbewegung gespeichert. Vorgesehene Gründe sind mindestens:

- Wareneingang;
- Verkauf;
- Rückgabe zurück in den Bestand;
- manuelle Zählkorrektur;
- Beschädigung, Verlust oder Entsorgung;
- Reservierung und Aufhebung einer Reservierung, wenn der Shop dies benötigt.

Historische Bewegungen werden nicht gelöscht oder nachträglich überschrieben. Korrekturen erfolgen als neue Gegen- oder Korrekturbewegung mit Begründung. Jede Bewegung hält Menge, Zeitpunkt, auslösenden Benutzer und fachliche Referenz fest.

### Einzelstücke und Mystery-Boxen

Für gebrauchte Einzelstücke, Sammlerstücke und Mystery-Box-Inhalte bleibt der bestehende Einzelartikel-Weg erhalten. Ein Einzelstück besitzt Bestand eins, individuelle Angaben zu Zustand, Bildern, Seriennummer, zugeteilten Kosten und Verkauf.

Ein gleichartiger Mystery-Inhalt darf nur dann als Mengenartikel geführt werden, wenn Zustand und wirtschaftliche Behandlung tatsächlich gleich sind. Andernfalls wird er als Einzelstück erfasst. Diese Entscheidung verhindert, dass unterschiedliche Einkaufskosten oder Zustände unsichtbar vermischt werden.

## Bestandsanzeige

Die normale Inventarliste zeigt eine Bestandszeile je Artikelstamm und nur die verfügbare, reservierte und gesamte Menge. Die Liste wird nicht mit fünf identischen Zeilen für fünf gleiche LED-Lampen gefüllt.

Eine Detailansicht zeigt:

- verfügbare, reservierte und gesamte Menge;
- Bestandlose mit Eingang, ursprünglicher Menge, Restmenge und Stückkosten;
- vollständige Bestandsbewegungshistorie;
- Einkaufs- und Verkaufsreferenzen.

Einzelstücke bleiben als eigene Zeilen sichtbar, weil Zustand, Fotos, Kosten oder Identität individuell relevant sein können.

## Kostenentnahme und Verkauf

Ein manueller Verkauf und ein Shop-Verkauf verwenden denselben zentralen Verkaufsdienst. Ein Verkauf erfordert mindestens Plattform, Verkaufsdatum, mindestens eine Verkaufsposition, Menge und Verkaufspreis je Stück.

Bei gleichartigen Artikeln entnimmt Flipbase die verfügbare Menge standardmäßig nach FIFO aus den ältesten passenden Bestandlosen. Die Losentnahme und der daraus resultierende Wareneinsatz werden je Verkaufsposition gespeichert. Ein späterer Nachkauf zum abweichenden Preis bleibt damit nachvollziehbar.

Bei Einzelstücken wird genau dieses Einzelstück verkauft. Ein Verkauf darf weder mehr als die verfügbare Menge verkaufen noch einen bereits vollständig verkauften Bestand nochmals verwenden.

Der bisherige Statuswechsel zu „verkauft“ wird durch den Verkaufsdialog ersetzt. Nach erfolgreichem Speichern existieren atomar:

1. Verkaufskopf;
2. Verkaufspositionen;
3. Losentnahmen beziehungsweise Einzelstückverknüpfungen;
4. Bestandsbewegungen;
5. der aktualisierte sichtbare Bestand.

Schlägt ein Teil davon fehl, wird die gesamte Aktion zurückgesetzt. Erst nach erfolgreicher Datenbankantwort zeigt die Oberfläche eine Erfolgsmeldung.

Rückgaben löschen keinen Verkauf. Sie speichern eine Rückgabe- bzw. Wiedereinlagerungsbewegung und machen die Auswirkung auf Umsatz, Gewinn und Bestand nachvollziehbar.

## Dashboard, Verkäufe und Navigation

Verkäufe werden ein zentraler Bereich unter „Übersicht“. Einkäufe und Inventar öffnen für einen Artikel stets denselben Verkaufsdialog. Abgeschlossene Shop-Bestellungen erzeugen automatisch denselben Verkaufstyp; eine Doppelanlage ist ausgeschlossen.

Das Dashboard erhält einen Zeitraumfilter mit Heute, 7 Tage, Monat und Jahr. Alle Kennzahlen und Darstellungen nutzen die Verkaufsköpfe, Verkaufspositionen, Losentnahmen und Bestandsbewegungen als einzige Datenquelle.

### Kennzahlen

| Kennzahl            | Berechnung                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Ausgaben            | In diesem Zeitraum bezahlte Einkaufs- und Beschaffungskosten. Diese Kennzahl ist ein Geldabfluss, nicht der Wareneinsatz.   |
| Umsatz              | Verkaufserlöse im gewählten Zeitraum.                                                                                       |
| Realisierter Gewinn | Verkaufserlöse abzüglich des aus den Losentnahmen ermittelten Wareneinsatzes sowie der Verkaufskosten.                      |
| Bestandswert        | Optional separat: Kostenwert des noch verfügbaren Bestands. Er ersetzt die bisher unklare Darstellung „gebundenes Kapital“. |

Der realisierte Gewinn wird bewusst nicht als Umsatz minus aller Einkäufe im selben Zeitraum berechnet. Das würde Nachkäufe und spätere Verkäufe zeitlich falsch zuordnen.

### Auswertungen

Das Dashboard enthält mindestens:

1. ein Zeitdiagramm für Umsatz, Ausgaben und realisierten Gewinn;
2. eine filterbare Verkaufstabelle mit Datum, Artikel, Menge, Plattform, Umsatz, Wareneinsatz und Gewinn.

Die Tabelle und das Diagramm übernehmen denselben Zeitraum- und Plattformfilter. Die bisherige Darstellung von ROI wird nur beibehalten, wenn sie später eindeutig definiert wird; sie ist kein Kernwert der ersten Umsetzung.

## Benutzerführung

Unter Inventar werden die Bereiche **Bestand** und **Artikelstamm** getrennt angeboten.

Im Einkauf fügt der Nutzer Positionen hinzu und kann dort einen vorhandenen Artikelstamm auswählen, einen neuen Artikelstamm anlegen oder ein Einzelstück beziehungsweise einen Mystery-Inhalt erfassen. Menge, Stückpreis und Gesamtpreis sind eindeutig beschriftet; die Oberfläche berechnet genau den fehlenden dritten Wert.

Der Verkaufsdialog erlaubt mehrere Verkaufspositionen. Für ein Einzelstück ist die Menge fest auf eins. Für Mengenartikel kann nur eine Menge bis zum verfügbaren Bestand gewählt werden.

## Datenübernahme und Rückwärtskompatibilität

Bestehende Einkäufe, Inventarartikel, Verkäufe, Bilder, Kosten und IDs bleiben erhalten. Die Umsetzung ergänzt neue Tabellen und Referenzen; sie löscht oder deutet keine historischen Datensätze um.

Bestehende Inventarartikel werden zunächst als Einzelstücke weitergeführt. Neue Mengenartikel nutzen Artikelstamm, Einkaufsposition und Bestandslos. Eine spätere, bewusste Zusammenführung alter Daten ist ein getrenntes Vorhaben und nicht Bestandteil dieser Umstellung.

Bestehende Verkäufe werden für Auswertungen weiterhin berücksichtigt. Bei der Migration erhalten sie, soweit möglich, eine einzelne Verkaufsposition und die bisherige Einzelartikelverknüpfung. Fehlende historische Kosteninformationen werden sichtbar als solche behandelt und nicht geschätzt.

## Fehlerbehandlung und Sicherheit

- Kritische Einkaufs-, Wareneingangs-, Verkaufs- und Rückgabeaktionen laufen über transaktionale Datenbankfunktionen.
- Verfügbarkeit und Entnahme werden innerhalb derselben Transaktion geprüft, damit parallele Aktionen keinen Überverkauf verursachen.
- Berechtigungs- und Workspace-Prüfungen erfolgen auf Datenbankebene.
- Die Oberfläche zeigt Erfolgsmeldungen nur nach dauerhaftem Speichern. Fehler bleiben als rote, bestätigungspflichtige Meldung sichtbar und erklären die Ursache verständlich.
- Relevante Aktionstypen erhalten gezielte Tests; die Endprüfung umfasst zusätzlich Typprüfung und Produktions-Build.

## Abnahmekriterien

1. Ein Einkauf von fünf LED-Lampen zu 4,99 € je Stück zeigt Gesamt-EK 24,95 € und erzeugt einen sichtbaren Bestand von fünf Stück, nicht fünf Listenzeilen.
2. Ein Verkauf von zwei Lampen erzeugt genau einen Verkauf mit Menge zwei, reduziert den Bestand auf drei und setzt 9,98 € Wareneinsatz an.
3. Ein zweiter Einkauf desselben Artikels zu anderem Stückpreis bleibt als eigenes Los nachvollziehbar; die automatische Entnahme verwendet FIFO.
4. Ein Mystery-Box-Inhalt kann weiterhin als individuelles Einzelstück mit Bestand eins und individuellen Kosten verkauft werden.
5. Ein Verkauf aus Einkauf, Inventar oder Shop erscheint unmittelbar im zentralen Verkaufsbereich und im Dashboard.
6. Umsatz, Ausgaben und realisierter Gewinn bleiben im Dashboard fachlich getrennt und reagieren einheitlich auf den Zeitraumfilter.
7. Rückgabe, Defekt und Korrektur ändern den Bestand ausschließlich durch nachvollziehbare Bewegungen.
8. Keine vorhandenen Einkäufe, Artikel, Verkäufe, Medien oder Kosten gehen bei der Migration verloren.

## Nicht Bestandteil dieser Umsetzung

- automatische Lieferantenbestellung oder Lieferantendokumente als PDF;
- mehrere Lagerorte und Umlagerungen zwischen Lagerorten;
- automatische Nachbestellvorschläge;
- nachträgliche automatische Zusammenführung historischer Einzelartikel;
- eine neue, steuerberaterverbindliche Bewertungsvorschrift über die dokumentierte Kostenherkunft hinaus.

Steuerliche Besonderheiten, insbesondere die spätere konkrete Anwendung der Differenzbesteuerung, müssen vor einem produktiven steuerlichen Abschluss mit dem Steuerberater abgeglichen werden.

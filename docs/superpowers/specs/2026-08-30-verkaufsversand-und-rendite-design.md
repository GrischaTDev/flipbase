# Verkaufsversand und Rendite – Design

## Ziel

Flipbase trennt den vom Käufer bezahlten Versand von den tatsächlich vom Verkäufer getragenen Versandkosten. Verkaufskennzahlen, Rechnungen, Retouren und Exporte verwenden dadurch dieselbe fachliche Bedeutung. Die Verkaufsmaske zeigt zusätzlich eine verständliche Gewinnmarge und erklärt die Kapitalrendite.

## Fachliches Modell

- Positionssumme: Summe aus Menge mal Artikelpreis.
- Versand vom Käufer erhalten: Versandbetrag, der dem Verkäufer als Erlös zufließt.
- Brutto-Verkaufserlös: Positionssumme plus Versand vom Käufer erhalten.
- Tatsächliche Versandkosten: Aufwand für Versandetikett oder Porto.
- Verkaufskosten: Plattformgebühr, tatsächliche Versandkosten und weitere Kosten.
- Wareneinsatz: persistierte Anschaffungskosten der verkauften Positionen.
- Gewinn: Brutto-Verkaufserlös minus Wareneinsatz minus Verkaufskosten.
- Gewinnmarge: Gewinn geteilt durch Brutto-Verkaufserlös mal 100.
- Kapitalrendite (ROI): Gewinn geteilt durch Wareneinsatz plus Verkaufskosten mal 100.

Bei einem eBay-Verkauf über 39,99 EUR mit 2,99 EUR berechnetem Versand, 5,19 EUR tatsächlichem Porto und 7,70 EUR Plattformgebühr beträgt der Brutto-Verkaufserlös 42,98 EUR. Der Betrag vor Wareneinsatz und weiteren Kosten beträgt 30,09 EUR.

## Plattformabhängiger Versand

Die Maske speichert eine Versandabwicklung mit den Werten `seller_arranged`, `platform_prepaid` und `pickup`.

- eBay verwendet standardmäßig `seller_arranged`. Käufer-Versand und tatsächliches Porto sind getrennt editierbar.
- Vinted verwendet standardmäßig `platform_prepaid`. Käufer-Versand und tatsächliches Porto beginnen bei 0 EUR, bleiben aber nach Wechsel auf individuellen Versand editierbar.
- Direktverkauf und Kleinanzeigen beginnen mit `pickup` und 0 EUR, können aber geändert werden.
- Plattformvorgaben sind nur sinnvolle Startwerte, keine unveränderlichen Regeln.

## Persistenz

`public.sales` erhält:

- `shipping_revenue numeric(12,2) not null default 0`
- `shipping_mode text` mit den erlaubten Werten `seller_arranged`, `platform_prepaid`, `pickup`; bestehende Datensätze bleiben mit `null` als unbekannt erhalten.

`sale_price` und `sale_price_total` bleiben aus Kompatibilitätsgründen der gesamte dem Verkäufer zugeordnete Erlös. Für neue Verkäufe ist dies Positionssumme plus `shipping_revenue`. Bestehende Verkäufe erhalten `shipping_revenue = 0` und werden nicht automatisch aufgeteilt.

Weitere Kosten werden als strukturierte Zeilen in `public.sale_cost_entries` gespeichert. Jede Zeile enthält Workspace, Verkauf, Kategorie, optionale Beschreibung und Betrag. Erlaubte Kategorien sind `packaging`, `payment_fee`, `promotion` und `other`. Die bestehenden Summenfelder `packaging_cost` und `other_costs` bleiben kompatible, innerhalb derselben Verkaufstransaktion berechnete Summen:

- `packaging_cost`: Summe aller `packaging`-Zeilen.
- `other_costs`: Summe aller übrigen zusätzlichen Kostenzeilen.

Plattformgebühr und tatsächliche Versandkosten bleiben eigene Felder, weil sie in Berichten, Exporten und Bedienoberflächen eine feste fachliche Bedeutung haben.

Die neue Tabelle aktiviert RLS, besitzt getrennte Policies je Operation für `authenticated` und indiziert `workspace_id` sowie `sale_id`.

## Verkaufsmaske

Die Verkaufsmaske enthält keine unbeschrifteten Null-Felder und kein eingeklapptes Sammelfeld mehr.

1. Verkaufspositionen mit Artikel, Menge und Artikelpreis.
2. Einnahmen mit Versandabwicklung, „Versand vom Käufer erhalten“ und automatisch berechnetem Brutto-Verkaufserlös.
3. Verkaufskosten mit Plattformgebühr, „Tatsächliche Versandkosten“ und strukturierten zusätzlichen Kostenzeilen.
4. Eine Schaltfläche „Kosten hinzufügen“ ergänzt Kategorie, Beschreibung und Betrag; jede Zeile kann entfernt werden.
5. Die Notiz ist ein eigenes, dauerhaft sichtbares und beschriftetes Feld.

Alle Eingaben haben sichtbare Labels, passende `aria`-Beziehungen, Tastaturbedienung und Pointer-Cursor für klickbare Elemente.

## Kennzahlen

Der grüne Kennzahlenbereich zeigt:

- Verkaufserlös
- Wareneinsatz
- Verkaufskosten
- Gewinn
- Gewinnmarge
- Kapitalrendite

„ROI“ wird nicht alleinstehend angezeigt. Die Beschriftung lautet „Kapitalrendite“ und eine Hilfebeschreibung nennt die Formel. Bei einer Kostenbasis von 0 wird die Kapitalrendite als Gedankenstrich statt als irreführende 0 % angezeigt. Die Gewinnmarge wird analog bei einem Erlös von 0 nicht berechnet.

## Folgefunktionen

- Rechnungen verwenden `shipping_revenue` als dem Käufer berechneten Versand. `shipping_cost` darf nie auf der Rechnung erscheinen.
- Umsatz, Gewinn, Dashboard und Steuerbasis verwenden den Brutto-Verkaufserlös inklusive `shipping_revenue`.
- Verkaufskosten ziehen `shipping_cost`, Plattformgebühr und zusätzliche Kosten ab.
- Eine vollständige Retoure bezieht sich auf den Brutto-Verkaufserlös inklusive Käufer-Versand.
- CSV-/DATEV-Ausgaben erhalten eindeutige Spalten beziehungsweise Kontierungsgrundlagen für Versand-Erlös und Versand-Aufwand.

## Altdaten und Sicherheit

- Bestehende Verkäufe werden finanziell nicht verändert.
- Eine automatische Trennung historischer Gesamtpreise ist verboten, weil Artikelpreis und Käufer-Versand nicht zuverlässig rekonstruierbar sind.
- Bestehende aggregierte Verpackungs- und sonstige Kosten bleiben gültig, auch wenn keine Kostenzeilen vorhanden sind.
- Neue RPC-Eingaben validieren nichtnegative Geldbeträge, höchstens zwei Nachkommastellen, erlaubte Kategorien und eine begrenzte Anzahl zusätzlicher Kostenzeilen.
- Neue Verkaufserfassung und historischer Verkaufsnachtrag schreiben Erlös, Kostenzeilen, Rollups, Positionen und Bestandsbewegung atomar.

## Abnahme

- Der eBay-Beispielverkauf kann ohne Vermischung der beiden Versandbeträge gespeichert und wieder angezeigt werden.
- Ein Vinted-Verkauf mit Plattform-Versandschein startet mit 0 EUR Versandserlös und 0 EUR Versandaufwand.
- Rechnung, Dashboard, Gewinn, Marge, Kapitalrendite, Retoure und Exporte verwenden dieselben Beträge.
- Bestehende Verkäufe behalten ihre bisherigen Summen.
- Angular-, Service-, Datenbank-, Typ- und Build-Prüfungen bestehen.

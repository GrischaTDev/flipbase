# Dashboard: Gewinn, Umsatz, Ausgaben mit Vorzeitraum und offenen Kosten

Stand: 17. September 2026. Grundlage ist die Empfehlung vom 13.09.2026
(Archiv des KI-Protokolls, Eintrag „Einkaufsfelder nebeneinander und
Dashboard-Einordnung“) und die Nutzerentscheidungen vom 17.09.2026.

## Nutzerentscheidungen

1. **Gewinn** ist der Verkaufsgewinn: Erlös minus Wareneinsatz minus direkte
   Verkaufskosten. Sonstige Betriebsausgaben erfasst Flipbase nicht.
2. **Vergleich** mit dem gleich langen Zeitraum davor: Heute → gestern,
   7 Tage → die 7 Tage davor, Monat → 1. bis gleicher Tag des Vormonats,
   Jahr → 1.1. bis gleicher Tag des Vorjahres.
3. **Offene Kosten wie Shopify:** Verkäufe ohne bekannte Kosten zählen nicht
   zum Gewinn und erscheinen getrennt als „Umsatz ohne Kosten“. Dazu eine Liste
   der betroffenen Einkäufe mit Grund und Link.
   Quelle: [Shopify Finanzberichte](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/finances-report),
   geprüft am 17.09.2026.
4. Node wird lokal nicht aktualisiert. Angular-Bau und Browser-Smoke laufen
   in der PR-CI; eine lokale Sichtprüfung vor dem Merge entfällt.

## Kennzahlen

Alle Beträge in Euro, auf Cent gerundet. „Zeitraum“ ist das gewählte Fenster,
„Plattform“ der gewählte Filter.

| Kachel                    | Definition                                                                                                | Vergleich        |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| Gewinn (groß)             | Summe `resultAfterDirectCosts` aller Verkäufe im Zeitraum/Plattform mit bekannten Kosten                  | Prozent          |
| Umsatz (groß)             | Summe `revenue` aller aktiven Verkäufe im Zeitraum/Plattform (unverändert)                                | Prozent          |
| Ausgaben (groß)           | Einkaufskosten nach Kaufdatum plus Verkaufskosten nach Verkaufsdatum                                      | Prozent, neutral |
| Bestandswert (klein)      | Anschaffungswert des aktuell vorhandenen Bestands mit bekannten Kosten; nicht zeitraumbezogen             | keiner           |
| Verkaufte Artikel (klein) | Stückzahl aktiver Verkäufe im Zeitraum/Plattform (unverändert)                                            | Prozent          |
| Marge (klein)             | Durchschnitt `marginPercent` der Verkäufe mit bekannten Kosten; leer, wenn es keinen solchen Verkauf gibt | Prozentpunkte    |

Zusatzzeilen:

- Gewinn: „davon ohne Kosten: 240,00 € Umsatz (3 Verkäufe)“, nur wenn > 0.
- Ausgaben: „Einkäufe 120,00 € · Verkaufskosten 18,40 €“. Bei gesetztem
  Plattformfilter enthalten die Ausgaben nur die Verkaufskosten dieser
  Plattform, weil Einkäufe keiner Plattform zugeordnet sind; die Zeile lautet
  dann „Nur Verkaufskosten dieser Plattform“.
- Bestandswert: „n Artikel ohne Kosten“, nur wenn > 0.

Einkäufe ohne Preis (`purchase_price = null`) bleiben wie bisher außerhalb der
Ausgaben und erscheinen stattdessen in den offenen Kosten.

## Vergleichszeitraum

| Auswahl | Aktuell (Beispiel 17.09.2026) | Vergleich         | Beschriftung             |
| ------- | ----------------------------- | ----------------- | ------------------------ |
| Heute   | 17.09.                        | 16.09.            | „ggü. gestern“           |
| 7 Tage  | 11.–17.09.                    | 04.–10.09.        | „ggü. 04.–10.09.“        |
| Monat   | 01.–17.09.                    | 01.–17.08.        | „ggü. 01.–17.08.“        |
| Jahr    | 01.01.–17.09.2026             | 01.01.–17.09.2025 | „ggü. 01.01.–17.09.2025“ |

Hat der Vormonat weniger Tage, endet der Vergleich am Monatsende
(31.03. → 01.–28.02.). Der 29.02. wird im Vorjahr zum 28.02.

Anzeige der Veränderung:

- Prozent auf ganze Zahlen gerundet, mit ▲/▼ und Text für Screenreader
  („gestiegen um 12 Prozent gegenüber 01.–17.08.“).
- Vorwert 0 und aktueller Wert ≠ 0: „neu“. Beide 0: „±0 %“.
- Marge: Differenz in Prozentpunkten („▲ 3,2 Pp.“); ist einer der beiden Werte
  leer, entfällt der Vergleich.
- Farbe nur als Bedeutung und immer mit Symbol: steigender Gewinn/Umsatz
  grün, fallender rot. Ausgaben, Stückzahl und Marge bleiben neutral.

## Offene Kosten

Ein Bereich unter den Kacheln, nur sichtbar, wenn mindestens ein Eintrag
existiert. Bestands- und Kostenwarnungen werden nicht ausgeblendet.

Erfasst werden:

1. Verkäufe im Zeitraum/Plattform ohne bekannte Kosten.
2. Aktuell vorhandener Bestand (Artikel und Lose) ohne bekannten Wert.
3. Bei „Alle Plattformen“: Einkäufe im Zeitraum ohne Preis.

Jeder Fall wird dem zugehörigen Einkauf zugeordnet (über Artikel oder
Losallokation, mit `purchaseForCost`) und je Einkauf zusammengefasst:

| Grund (Reihenfolge der Prüfung) | Bedingung                                                     | Text                                |
| ------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| `price_missing`                 | `purchase_price` ist `null`                                   | „Einkaufspreis fehlt“               |
| `not_finalized`                 | Einkauf nicht abgeschlossen (`purchaseIsFinalized` = false)   | „Einkauf nicht abgeschlossen“       |
| `cost_not_allocated`            | Einkauf abgeschlossen, aber Artikel/Los ohne verteilte Kosten | „Kosten nicht auf Artikel verteilt“ |

Eine Zeile zeigt Bezeichnung des Einkaufs (bei vorhandener Nummer mit Nummer),
Grund und Umfang („betrifft 2 Verkäufe · 1 Artikel im Bestand“) und verlinkt auf
`/purchases/:id`. Sortierung: meiste betroffene Verkäufe zuerst, dann Bestand,
dann Bezeichnung. Höchstens fünf Zeilen, darunter „+n weitere“ als Link auf
`/purchases`. Verkäufe ohne zuordenbaren Einkauf ergeben eine eigene Zeile
„n Verkäufe ohne zugeordneten Einkauf“ mit Link auf `/sales`.

## Technischer Aufbau

- `DashboardReportService.createReportForRecords` bleibt die reine,
  I/O-freie Berechnung. Eine interne Funktion berechnet die Kennzahlen für ein
  beliebiges Fenster; sie läuft für das aktuelle und das Vergleichsfenster.
- `DashboardReport` erhält `grossProfit`, `revenueWithoutCost`,
  `salesWithoutCostCount`, `purchaseSpend`, `sellingCosts`, `totalExpenses`,
  `purchasesIncluded`, `inventoryItemsWithoutCost`, `comparison` und
  `openCosts`. `inventoryCostValue` wird zu `number` (bekannter Teil).
  Die Felder `realizedProfit` und `resultAfterDirectCosts` auf Berichtsebene
  sowie das alte `expenses` entfallen; `points` und `rows` bleiben unverändert,
  damit Diagramm und Verkaufsjournal gleich bleiben.
- Neue Feature-Komponente `features/dashboard/components/dashboard-kpi-card`
  für Titel, Wert, Zusatzzeile und Veränderung, weil die Kachel sechsmal
  vorkommt und nur das Dashboard sie nutzt. Neue Feature-Komponente
  `dashboard-open-costs` für die Liste. Beide mit `OnPush`, `input()`, eigener
  HTML-Datei, Tailwind, vorhandenen Shared-Bausteinen (`app-card`,
  `app-button` als Link).
- Keine Schema-, Migrations- oder Backend-Änderung.

## Unverändert

Zeitraum- und Plattformauswahl samt gespeicherter Präferenz, Diagramm,
Verkaufsjournal, Leerzustände des Journals, Kostenberechnung je Verkauf
(`calculateStoredSaleMetrics`) und Bestandsberechnung je Los/Artikel.

## Tests

- Service: Vergleichsfenster für alle vier Auswahlen einschließlich 31.03. und
  29.02.; Gewinn und Marge ohne Verkäufe mit offenen Kosten; Umsatz ohne Kosten;
  Zusammensetzung der Ausgaben mit und ohne Plattformfilter; Bestandswert als
  bekannter Teil mit Zählung; Gründe, Zusammenfassung, Sortierung und
  Begrenzung der offenen Kosten; Verkäufe ohne Einkauf.
- Der bestehende Test „hält gemischte Ergebnisse … offen“ wird auf die neue,
  vom Nutzer gewählte Darstellung umgestellt.
- Komponenten: Kachel mit Prozent, „neu“, „±0 %“, Prozentpunkten, fehlendem
  Vergleich, Farbsemantik und Screenreader-Text; Liste mit Links, Begrenzung und
  Leerzustand; Dashboard-Integration.
- Lokal: Typprüfung, betroffene Vitest-Projekte, ESLint, Prettier, Test-Audit,
  Shared-UI-Architekturprüfung. PR-CI: Angular-Bau, alle Tests, Browser-Smoke.

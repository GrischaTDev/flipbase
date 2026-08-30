# Abnahme: Verkaufsversand und Rendite

**Datum:** 2026-08-30  
**Stand:** `d79a774` vor diesem reinen Dokumentations-Commit

## Ergebnis

Käufer-Versand und tatsächliche Versandkosten sind im Verkaufsprozess getrennt.
Die gemeinsamen Verbraucher – Kennzahlen, Rechnung, Retoure sowie CSV- und
DATEV-Export – verwenden dieselben fachlichen Beträge. Die vollständige lokale
Prüfung ist ohne Fehler durchgelaufen.

## Fachlicher Nachweis

Für den eBay-Beispielverkauf gilt:

- Positionssumme: 39,99 EUR
- Versand vom Käufer erhalten: 2,99 EUR
- Tatsächliche Versandkosten: 5,19 EUR
- Plattformgebühr: 7,70 EUR
- Brutto-Verkaufserlös: 39,99 EUR + 2,99 EUR = 42,98 EUR
- Betrag vor Wareneinsatz und weiteren Kosten: 42,98 EUR - 5,19 EUR - 7,70 EUR
  = 30,09 EUR

Gewinn ist `Brutto-Verkaufserlös - Wareneinsatz - Verkaufskosten`.
Die Gewinnmarge ist `Gewinn / Brutto-Verkaufserlös × 100`. Die Kapitalrendite
(ROI) ist `Gewinn / (Wareneinsatz + Verkaufskosten) × 100`. Bei einer
Erlösbasis beziehungsweise Kostenbasis von 0 wird die jeweilige Kennzahl als
Gedankenstrich angezeigt, nicht als irreführende 0 %.

Die Plattform-Startwerte sind editierbare Vorgaben: eBay startet mit
`seller_arranged`; Vinted startet mit `platform_prepaid` sowie 0 EUR Käufer-
Versand und 0 EUR Porto; Direktverkauf und Kleinanzeigen starten mit `pickup`
und 0 EUR. Nach einer Benutzeränderung bleiben die Versandfelder bearbeitbar.

Im DATEV-Export wird Käufer-Versand als Erlösgrundlage getrennt vom
Versandaufwand ausgewiesen. Der Ausgangsfracht-Aufwand wird über Konto 4730
(SKR03) oder Konto 6740 (SKR04) gegen Bank gebucht.

Bestehende Verkäufe werden nicht umgeschrieben: `shipping_revenue` bleibt bei
Altdaten 0, der fehlende Versandmodus bleibt fachlich unbekannt und bisherige
aggregierte Verpackungs- und sonstige Kosten bleiben gültig. Eine automatische
Aufteilung historischer Gesamtpreise findet nicht statt.

## Ausgeführte Prüfungen

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:workflow
npm run test:audit
npm test
npm run build
npm run test:db
git diff --check
```

| Prüfung                 | Ergebnis                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run format:check`  | erfolgreich, alle Dateien im Prettier-Format                                                    |
| `npm run lint`          | erfolgreich, 0 ESLint-Fehler                                                                    |
| `npm run typecheck`     | erfolgreich, 0 TypeScript-Fehler                                                                |
| `npm run test:workflow` | 80/80 Tests bestanden                                                                           |
| `npm run test:audit`    | 116 Dateien, 995 Testdefinitionen, 2.471 Assertions                                             |
| `npm test`              | 1.091 Tests bestanden: 754 Node, 97 DOM, 240 Angular; 3 Node-Tests erwartungsgemäß übersprungen |
| `npm run build`         | Produktions-Build erfolgreich                                                                   |
| `npm run test:db`       | 6 pgTAP-Dateien, 223/223 Tests bestanden                                                        |
| `git diff --check`      | erfolgreich, keine Leerraumfehler                                                               |

## Bedenken

Keine offenen fachlichen oder technischen Bedenken. Eine abweichende
Kontenlogik einer Steuerkanzlei wäre eine spätere, ausdrücklich konfigurierte
Erweiterung; die vorgegebene Kontierung 4730/6740 ist abgenommen.

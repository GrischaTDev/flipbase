# Abschluss Einkauf und gemeinsame Tabellen

Basis: `e0c1892de48abcd93f26576ca8e178a11bd55d93` (`origin/master` vor der
Umsetzung)

Branch: `codex/purchase-table-guardrails`

Stand: 20.09.2026

## Umgesetzt

- Die Standardansicht der Einkaufsübersicht zeigt Verkäufer vor der optionalen
  Bezeichnung. Eine gespeicherte Ansicht wird nur dann umgestellt, wenn sie
  genau der ehemaligen Standardreihenfolge entspricht. Persönlich sortierte
  Ansichten, Sichtbarkeit und Sortierung bleiben erhalten.
- Die Architekturprüfung verwendet für Tabellen die Angular-Template-Analyse,
  prüft den `table-content`-Slot und erlaubt dokumentierte Ausnahmen nur an
  ihren festgelegten Pfaden.
- Die Browserregression deckt einen Vinted-Einkauf ohne gespeicherten Verkäufer
  sowie das Wiederöffnen dieses Einkaufs ab.
- Nach ausdrücklicher Nutzerfreigabe wurde der Umfang erweitert: Normale
  Einkaufspositionen dürfen im Entwurf einen offenen Preis haben. `0,00 €`
  bleibt ein bezahlter Preis. Der allgemeine Preisstatus `open` ergänzt den
  kompatibel erhaltenen Altwert `unpriced_mystery`. Offene Preise sperren
  Abschluss, Ankunft, Wareneingang und Bestandsübernahme.
- Das deklarative Schema liegt in
  `supabase/schemas/220_purchase_open_prices.sql`; die daraus erzeugte einzelne
  Migration ist `20260919224455_purchase_open_prices.sql`. `database.sql` blieb
  unverändert.

## Automatisierte Prüfungen

| Befehl                                                                                      | Ergebnis                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                                                                            | bestanden: Formatierung, Lint, Typprüfung, 76 von 81 Workflow-Tests (5 übersprungen), Test-Audit, 1.421 Node-, 235 DOM-, 927 Angular- und 13 Landing-Tests sowie Produktionsbau |
| `npm run test:db`                                                                           | bestanden: 52 Dateien, 1.878 Tests                                                                                                                                              |
| `npm run test:e2e:pr`                                                                       | bestanden: 6 Chromium-Tests; führt `playwright test --config=playwright.pr.config.ts` aus                                                                                       |
| `npx vitest run --project=angular purchase-cost-summary lifecycle line-editor detail-table` | bestanden: 4 Dateien, 53 Tests                                                                                                                                                  |
| `npx vitest run --project=node src/app/core/services/purchase-create-persistence.spec.ts`   | bestanden: 28 Tests                                                                                                                                                             |
| `npx supabase test db --local supabase/tests/purchase_open_prices.test.sql`                 | bestanden: 21 Tests                                                                                                                                                             |
| `npx playwright test e2e/purchase-acceptance.spec.ts --workers=1 --reporter=line`           | bestanden: 2 Chromium-Tests für fehlenden Vinted-Verkäufer sowie offenen Preis gegenüber `0,00 €`                                                                               |
| `git diff --check origin/master...HEAD`                                                     | bestanden, keine Whitespace-Fehler                                                                                                                                              |

Der Produktionsbau meldete nur die drei bekannten NG8113-Hinweise zu ungenutzten
`LucideDynamicIcon`-Importen in `DashboardComponent`, `PurchasesComponent` und
`SellersComponent`. Es gab keine neuen Build-Warnungen.

## Begrenzte visuelle Tabellenabnahme

Die im Plan verlangte manuelle Browserabnahme für alle sechs Routen wurde nicht
durchgeführt. Die vorhandenen Playwright-Tests prüfen die beiden fachlichen
Einkaufsabläufe, dokumentieren aber keine vollständige Sichtprüfung bei beiden
Viewports und Themes. Deshalb werden weder Tastatur-, Popover-, Überlauf- noch
AXE-/Kontrast-Ergebnisse behauptet.

| Route         | 1440 hell/dunkel   | 390 hell/dunkel    | Tastatur           | AXE Kontrast       | Ergebnis |
| ------------- | ------------------ | ------------------ | ------------------ | ------------------ | -------- |
| `/purchases`  | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | offen    |
| `/inventory`  | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | offen    |
| `/sales`      | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | offen    |
| `/expenses`   | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | offen    |
| `/sellers`    | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | offen    |
| `/accounting` | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | nicht durchgeführt | offen    |

## Verbleibende Grenzen

- Die oben aufgeführte manuelle visuelle Tabellenabnahme einschließlich AXE und
  Kontrast steht noch aus.
- Die drei bekannten NG8113-Hinweise bleiben im Produktionsbau bestehen.

# Listing Studio: Prüfung des alten Entwurfsspeichers

## Produktionsprüfung vom 20. September 2026

Vor dem Entfernen von `public.listing_drafts` wurde die Produktion ausschließlich mit zusammengefassten Zählabfragen geprüft:

| Prüfung                              | Ergebnis |
| ------------------------------------ | -------: |
| total rows                           |        0 |
| invalid titles                       |        0 |
| invalid descriptions                 |        0 |
| invalid prices                       |        0 |
| missing inventory items              |        0 |
| conflicts with open listings         |        0 |
| inventory items with multiple drafts |        0 |

Es wurden keine Titel, Beschreibungen, Benutzerkennungen oder andere Inhalte einzelner Datensätze gelesen oder aufgezeichnet.

Die Release-Migration prüft den Tabelleninhalt erneut. Sobald nach dieser Prüfung ein Datensatz hinzugekommen ist, bricht sie vor dem Löschen der Tabelle ab. Dadurch kann der geprüfte Leerstand nicht stillschweigend veralten.

## Prüfungen der Umsetzung

- Die neue Migration wurde aus dem deklarativen Schema erzeugt und auf die
  tabelleneigenen Löschschritte begrenzt. Sie enthält keine eigene
  Transaktionssteuerung.
- Eine Wegwerf-Datenbank bestätigte drei Migrationsfälle: Mit einer bereits
  vorhandenen Zeile brach die Migration mit SQLSTATE `55000` ab und erhielt die
  Zeile. Ein gleichzeitig laufender Insert wurde durch den exklusiven
  Tabellen-Lock zuerst vollständig abgeschlossen, danach erkannt und ebenfalls
  erhalten. Nach dem Leeren wurde `public.listing_drafts` entfernt.
- Ein vollständiger lokaler Datenbank-Reset wendete alle Migrationen
  einschließlich der neuen Löschmigration erfolgreich an. Die anschließend
  erzeugten Supabase-Typen enthalten `public.listings` und keinen Vertrag für
  `public.listing_drafts` mehr.
- Die gezielten pgTAP-Läufe bestanden mit 62 Inserate- und 100
  Archivierungsprüfungen. Die vollständige Datenbanksuite bestand mit 1.937
  Prüfungen in 53 Dateien.
- Die Textvorlagen-Tests bestanden mit 10 von 10 Fällen. Darin sind alle sechs
  gültigen Artikelzustände mit ihrem bisherigen vollständigen deutschen Wortlaut
  abgedeckt. Die Editor-Tests bestanden mit 12 von 12 Fällen.
- `npm run verify` bestand mit Formatprüfung, ESLint, Typprüfung, 76
  erfolgreichen Workflow-Prüfungen bei fünf vorgesehenen Plattform-Skips,
  Suite-Audit, 1.428 Node-, 239 DOM-, 946 Angular- und 13 Landing-Tests sowie
  dem Produktionsbau.
- Die PR-Browsersuite bestand mit sieben Chromium-Abläufen einschließlich des
  vollständigen mobilen Inserate-Lebenszyklus.

Der Bau meldet weiterhin drei bereits bekannte NG8113-Hinweise zu ungenutzten
`LucideDynamicIcon`-Importen in Dashboard, Einkäufen und Verkäufern. Der
Steuerjournal-Browserablauf meldet weiterhin NG0956 für eine unveränderte
identitätsbasierte Schleife in der Buchhaltungsansicht. Keine dieser Stellen
wurde durch diese Änderung berührt.

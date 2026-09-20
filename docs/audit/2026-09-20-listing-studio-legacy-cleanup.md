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

Die endgültigen lokalen Prüfungen werden vor der PR-Freigabe ergänzt.

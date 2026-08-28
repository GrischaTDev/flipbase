# Abnahme: Warenwirtschaft und Verkaufsmodell

Datum der lokalen Abnahme: 2026-08-28
Migrationsname: `20260828101500_backfill_legacy_sale_lines.sql`

## Datenübernahme

Die Migration ergänzt für jeden bestehenden Verkaufsheader ohne Position genau
eine `sale_lines`-Zeile. Die Zeile erhält `quantity = 1`, die ursprüngliche
`inventory_item_id`, `sale_price` als Einzel- und Zeilenpreis sowie den
vorhandenen `allocated_purchase_cost` als COGS-Snapshot. Die Steuerart nutzt
zuerst einen gültigen Artikel-Override, danach eine gültige Workspace-Steuerart
und sonst den dokumentierten Standard `diff_25a`.

Die Rückfüllung ist idempotent. Sie ändert weder `inventory_items`, `sales`
noch `item_media` und erzeugt ausdrücklich keine `stock_lots` oder
`stock_movements` für historische Daten.

Die Vormigrationsfixture wurde in einer lokalen, zurückgerollten Transaktion
angelegt und danach mit der tatsächlichen Migration ausgeführt. Geprüft wurden:

- Legacy-Artikel, zugehöriges Bild und Verkaufsheader bleiben mit ihren
  ursprünglichen Werten lesbar.
- Der historische Verkauf besitzt danach exakt eine passende Verkaufsposition
  (`1 × 29,99 EUR`, COGS `12,34 EUR`).
- Null, alle drei gültigen Steuerarten, ein ungültiger Legacy-Freitext und die
  Priorität eines gültigen Overrides sind abgedeckt.
- Für den historischen Workspace existieren weiterhin null Bestandslose und
  null Bestandsbewegungen.

## Fachliche lokale Abnahme

Die lokale SQL-Akzeptanz deckte den fachlichen Ablauf mit einer LED-Lampe ab:

1. Mengenartikel und Einkauf `5 × 4,99 EUR` anlegen und vollständig einbuchen.
2. Mengenbestand `5` bestätigen, zwei Stück zentral verkaufen und Bestand `3`
   bestätigen.
3. Überverkauf ablehnen und die vollständige Retoure mit Bestand `5`
   bestätigen.
4. Shop-Checkout für zwei Stück idempotent ausführen; es entstehen genau eine
   Bestellung, eine Shopposition, ein zentraler Verkauf und eine
   Verkaufsposition.
5. Ein Mystery-Einzelstück separat zentral verkaufen; Status und COGS-Snapshot
   werden atomar bestätigt.

Die SQL-Verträge liefen lokal gegen den Supabase-Postgres-Container. Die
interaktive Browser-Endabnahme ist ausstehend und wird vom Controller
übernommen; diese Dokumentation behauptet keine manuelle UI-Prüfung.

## Ausgeführte Prüfungen

| Befehl                                                                                         | Ergebnis                                                                                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npx supabase db reset --local`                                                                | Erfolgreich; alle Migrationen einschließlich `20260828101500_backfill_legacy_sale_lines.sql` angewendet.        |
| `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts`            | Erfolgreich; keine Typänderung aus der reinen Datenmigration.                                                   |
| `npx supabase db diff --local`                                                                 | Erfolgreich: `No schema changes found`.                                                                         |
| `Get-Content -Raw supabase/tests/inventory_sales_schema.sql \| docker exec ... psql ...`       | PASS: `BEGIN`, fünf `DO`, `ROLLBACK`.                                                                           |
| `Get-Content -Raw supabase/tests/inventory_sales_transactions.sql \| docker exec ... psql ...` | PASS: `BEGIN`, `DO`, `ROLLBACK`.                                                                                |
| `.\supabase\tests\run_inventory_sales_legacy_migration.ps1`                                    | PASS: echte Migration zweimal per `\i` ausgeführt; `BEGIN`, `DO`, `INSERT 0 7`, `INSERT 0 0`, `DO`, `ROLLBACK`. |
| Zentraler Mengen-/Einzelverkauf-/Shop-Checkoutvertrag im lokalen Container                     | PASS: `BEGIN`, `DO`, `ROLLBACK`.                                                                                |
| `npm run typecheck`                                                                            | PASS.                                                                                                           |
| `npm test -- --run`                                                                            | PASS: 101 Testdateien, 685 Tests.                                                                               |
| `npm run format:check`                                                                         | PASS: alle Dateien entsprechen Prettier.                                                                        |
| `npm run build`                                                                                | PASS; bekannte Bundle- und CommonJS-Warnungen, siehe unten.                                                     |
| `git diff --check`                                                                             | PASS: keine Whitespace-Fehler.                                                                                  |

## Bekannte Vorbefunde und Bedenken

- Der Production-Build bleibt erfolgreich, warnt aber weiterhin wegen eines
  um 15,50 kB überschrittenen Initial-Budgets und der CommonJS-Abhängigkeiten
  `jszip` sowie `jsbarcode`.
- Es wurde ausschließlich die lokale Supabase-Datenbank zurückgesetzt und
  geprüft. Es gab keine Remote- oder Produktionsmigration und keine
  Produktionsdatenänderung.
- Die interaktive Browser-Endabnahme ist noch ausstehend und liegt beim
  Controller.

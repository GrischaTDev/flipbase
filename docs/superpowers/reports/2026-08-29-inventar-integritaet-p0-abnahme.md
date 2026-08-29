# Abnahme: Inventarintegrität und gemeinsame Ansicht (P0)

Datum der lokalen Prüfung: 2026-08-29

Migration: `20260829174944_inventory_integrity_unification.sql`

Direkter Vorgänger: `20260829062330_backfill_allocated_lot_costs.sql`

## Erzeugung und manuelle Migrationsprüfung

Die lokale Supabase-Umgebung wurde gestoppt und die Migration mit
`npx supabase db diff -f inventory_integrity_unification` aus der deklarativen
Quelle `supabase/schemas/database.sql` erzeugt. Keine bestehende Migration wurde
verändert.

Die erzeugte Migration wurde vor der Upgrade-Probe vollständig manuell geprüft.
Der Header dokumentiert Zweck, betroffene Objekte sowie die bewusst ersetzten
Fremdschlüssel und Policies. Die Prüfung bestätigte insbesondere:

- 13 betroffene Fremdschlüssel werden in derselben Migration mit
  `on delete restrict` neu angelegt.
- `voided_at`, `voided_by` und ein nichtleerer `void_reason` sind durch
  `sales_void_reason_when_voided` als vollständige Gruppe gesichert: entweder
  alle drei Werte fehlen oder alle drei sind gesetzt.
- Die View `inventory_item_sale_states` ist `security_invoker=true`; ihre
  Klassifikation beschreibt ausschließlich den bestandswirksamen Zustand.
- Das unveränderliche Journal `inventory_reconciliation_events` hat RLS,
  genau eine Select-Policy für Workspace-Mitglieder und einen
  Update-/Delete-Guard.
- Direkte Client-Mutationen an Verkäufen, Retouren und weiteren gebuchten
  Geschäftsobjekten bleiben entzogen. Die erlaubten RPCs sind eng vergeben.
- Vier Integritätsprüfungen sind als `deferrable initially deferred`
  Constraint-Trigger aktiv; der direkte Sold-Status-Guard ist zusätzlich aktiv.

Die manuelle Rechteprüfung fand zwei sicherheitsrelevante Schwächen im rohen
`pg-delta`-Ergebnis und beseitigte sie vor der Upgrade-Probe:

1. Interne Triggerfunktionen sowie `record_sale` und `record_sale_return` wären
   über Standardrechte noch für `service_role` ausführbar gewesen.
2. Das neue Journal hätte über implizite Tabellenrechte unter anderem
   `maintain` für `authenticated` sowie `maintain`, `references`, `trigger` und
   `truncate` für `anon` behalten.

Migration und deklarative Quelle widerrufen diese Rechte nun ausdrücklich.
Der erste Drift-Test zeigte die Journal-Restgrants noch als RED; nach der
Korrektur meldet `npx supabase db diff --local` exakt
`No schema changes found`.

Ein abschließender Cross-Task-Review fand darüber hinaus noch offene direkte
`insert`-/`update`-Wege für Rechnungen und Store-Bestellungen. Der finale Stand
schließt auch diese Wege:

- `invoices`, `invoice_items`, `store_orders` und `store_order_items` sind für
  authentifizierte Clients read-only; direkte Inserts, Updates und Deletes sind
  entzogen und die früheren Schreib-Policies entfernt.
- `place_store_order`, `create_or_get_invoice` und `book_bank_transaction` sind
  die alleinigen Schreibwege. Sie laufen mit festem leerem `search_path` und
  prüfen Authentifizierung sowie Workspace-Mitgliedschaft ausdrücklich.
- Fünf zusammengesetzte Fremdschlüssel koppeln Rechnungs- und
  Store-Bestellbeziehungen an denselben Workspace. Cross-Workspace-Verweise
  werden dadurch auch bei privilegierten Datenbankpfaden abgewiesen.
- Authentifizierte Negativtests belegen die gesperrten direkten Schreibwege;
  Positivtests belegen weiterhin alle drei erlaubten RPCs.

## Reproduzierbare Upgrade-Probe

`supabase/tests/inventory_integrity_upgrade.ps1` arbeitet fail-fast, bestimmt
die unmittelbar vorherige Migration dynamisch und löst genau den lokalen
Datenbankcontainer dieses Worktrees auf. Temporäre Host- und Containerdateien
werden auch bei einem Fehler aufgeräumt.

Der geprüfte Ablauf war:

1. Reset ohne Seed auf Version `20260829062330`.
2. Einspielen von `fixtures/inventory_integrity_legacy.sql` per `psql`.
3. Erfassen von Counts, sortierten IDs, Summen und deterministischen Hashes.
4. Anwenden ausschließlich der neuen Migration mit
   `supabase migration up --local`.
5. Erneutes Erfassen und bytegenauer Vergleich des JSON-Snapshots.
6. Getrennte Prüfung von Migrationshistorie, View-Klassifikation, Triggern und
   Rechten.

### Unveränderte Daten vor und nach dem Upgrade

| Objekt               | Count | Sortierte Fixture-IDs                                                                  |
| -------------------- | ----: | -------------------------------------------------------------------------------------- |
| Workspaces           |     2 | `...0001`, `...0002`                                                                   |
| Workspace-Mitglieder |     2 | Fixture-gebunden                                                                       |
| Inventarartikel      |     8 | `...0005`, `...0006`, `...0007`, `...0008`, `...0009`, `...0010`, `...0017`, `...0018` |
| Verkäufe             |     6 | `...0011`, `...0012`, `...0013`, `...0014`, `...0015`, `...0019`                       |
| Verkaufspositionen   |     5 | `...0021`, `...0022`, `...0023`, `...0024`, `...0025`                                  |

Alle verkürzten IDs besitzen den festen Präfix
`82000000-0000-4000-8000-00000000`.

| Prüfsumme                       | Vorher | Nachher |
| ------------------------------- | -----: | ------: |
| `sales.sale_price`              | 138,00 |  138,00 |
| `sales.sale_price_total`        | 138,00 |  138,00 |
| `sale_lines.line_total`         | 120,00 |  120,00 |
| `sale_lines.cost_of_goods_sold` |  48,00 |   48,00 |

| Deterministischer MD5-Hash | Vorher = Nachher                   |
| -------------------------- | ---------------------------------- |
| `inventory_items`          | `5553450f63e0062f7dadff79eee4aea8` |
| `sales`                    | `18e8ede98623e409f9e6dc186ef04a59` |
| `sale_lines`               | `4c6b9048dc7f4a2c387ca5fbc8909d05` |

Die acht erwarteten View-Zustände wurden ohne Abweichung bestätigt:

- einmal `no_active_sale`;
- einmal `sold`;
- dreimal `legacy_sold_unverified`;
- einmal `sale_status_conflict`;
- einmal `multiple_active_sales`;
- einmal `legacy_sale_header_without_line`.

Die Triggerprüfung ergab `5:5:4:4`: fünf erwartete Trigger vorhanden, alle
aktiv, davon vier Constraint-Trigger und alle vier deferrable sowie initial
deferred. Die neue Migration ist exakt einmal in der lokalen
Migrationshistorie verzeichnet.

Es wurden keine künstlichen Verkäufe, Lose oder Bestandsbewegungen erzeugt und
keine vorhandenen Verkaufswerte verändert.

## Clean-Install und generierte Typen

Nach der Upgrade-Probe wurde die Datenbank erneut vollständig bis zur neuen
Migration aufgebaut und mit `supabase/seed.sql` befüllt. Der Clean-Install war
erfolgreich.

Die Supabase-Typen wurden anschließend aus der lokalen Datenbank neu erzeugt.
Die Datei ist strikt gültiges UTF-8 ohne BOM; geprüft wurden 88.503 Bytes und
der Präfix `101,120,112` (`exp`). Die Typen enthalten das Journal, die
Sale-State-View, alle drei Stornofelder und die beiden engen Legacy-RPCs.

## SQL-, Concurrency- und Advisor-Abnahme

`npx supabase test db` wurde bewusst **nicht ohne Dateipfad** ausgeführt. In
diesem Repository liegen Fixtures und Review-Skripte neben den echten pgTAP-
Dateien; ein Verzeichnis-Bulk-Lauf würde Nicht-pgTAP-Dateien fälschlich als
Tests behandeln. Die echten pgTAP-Dateien wurden deshalb einzeln und wegen
ihrer festen Fixture-IDs jeweils nach einem sauberen lokalen Reset ausgeführt.

| Prüfung                                                        | Ergebnis                                                                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `business_record_immutability.sql`                             | PASS, 75/75                                                                                                                      |
| `inventory_item_sale_integrity.sql`                            | PASS, 63/63                                                                                                                      |
| `inventory_sales_schema.sql` per `psql`                        | PASS, Transaktion zurückgerollt                                                                                                  |
| `inventory_sales_transactions.sql` per `psql`                  | PASS, Transaktion zurückgerollt                                                                                                  |
| `inventory_sales_final_review.sql` per `psql`                  | PASS, Transaktion zurückgerollt                                                                                                  |
| Historischer Backfill-Runner auf seiner Basis `20260827233009` | PASS; erster Lauf `INSERT 0 9`, zweiter Lauf idempotent `INSERT 0 0`, Rollback                                                   |
| `inventory_double_sale.ps1` mit PowerShell 7                   | PASS in drei aufeinanderfolgenden Läufen: invertierte Sperrreihenfolge, kein `40P01`, genau ein Verkauf, Verlierer exakt `22023` |
| `npx supabase db lint --level warning`                         | Exit 0; eine bestehende `warning extra`, siehe unten                                                                             |
| Security-Advisor, `--fail-on error`                            | PASS, keine Findings                                                                                                             |
| Performance-Advisor, `--fail-on error`                         | PASS, keine Findings                                                                                                             |
| `npx supabase db diff --local`                                 | PASS, `No schema changes found`                                                                                                  |

Der historische Runner ist auf dem aktuellen Schema absichtlich nicht direkt
ausführbar, weil seine Vormigrationsfixture `status = 'sold'` per direktem
Insert erzeugt. Der neue Guard lehnt dies korrekt ab. Daher wurde der Runner
reproduzierbar gegen die Migration unmittelbar vor dem zu prüfenden historischen
Backfill ausgeführt; die neue, separate Upgrade-Fixture deckt den aktuellen
Upgrade-Pfad ab.

Windows PowerShell 5 kann die im Concurrency-Runner verwendete
`ProcessStartInfo.ArgumentList`-API nicht aufrufen. Dieselbe unveränderte Suite
wurde deshalb mit dem installierten PowerShell 7 (`pwsh`) dreimal erfolgreich
ausgeführt. Das ist eine Runner-Kompatibilitätsgrenze, kein SQL-Fehler.

Der DB-Linter meldet ausschließlich die bereits vorhandene, nicht durch diese
Migration eingeführte Variable `v_purchase` in
`public.receive_purchase_lines` als nie gelesen. Security- und
Performance-Advisors melden keine Probleme.

## App-Abnahme

| Befehl                                              | Ergebnis                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Gezielter Item-Detail-Test nach Build-Fix `71a2d52` | PASS: 1 Testdatei, 25 Tests                                                   |
| `npm run typecheck`                                 | PASS                                                                          |
| `npm run lint`                                      | PASS                                                                          |
| `npm test -- --run`                                 | PASS: 117 Testdateien, 861 Tests                                              |
| `npm run format:check`                              | PASS                                                                          |
| `npm run build`                                     | PASS; bekannte Warnung wegen ungenutztem `RouterLink` im `InventoryComponent` |
| `git diff --check`                                  | PASS                                                                          |

Ein erster Production-Build hatte einen aus dem vorherigen UI-Task stammenden
`TS2367`-Fehler in der Sale-State-Verzweigung der Item-Detailansicht gefunden.
Der getrennte Commit `71a2d52` entfernte ausschließlich den dort unerreichbaren
Zweig. Anschließend wurden der gezielte Item-Detail-Test (25/25), Typecheck,
Formatcheck, die vollständige Vitest-Suite und der Production-Build frisch und
erfolgreich ausgeführt. Der Task-6-Commit enthält keine UI-Datei.

Der abschließende Cross-Task-Review ergänzte 14 weitere Regressionstests. Sie
belegen den fail-closed Sale-State beim kalten Detailaufruf, atomare
Demo-Vollretouren mit und ohne Wiedereinlagerung, vollständigen Rollback bei
einem Storage-Fehler sowie kollisionsfreie Demo-Verkaufs- und Positions-IDs bei
identischer Systemzeit. Der Detail-Ladepfad verwendet nun denselben
Sale-State-Merge wie die Inventarliste; Demo-Retouren schreiben Verkauf,
Artikelstatus, Lose und Bewegungen gemeinsam.

## Produktionsschutz

Alle Datenbankbefehle liefen ausschließlich gegen die lokale Supabase-Instanz
und deren lokale Docker-Container. Es wurde keine Remote- oder
Produktionsmigration ausgeführt, nichts gepusht und nichts gemergt.

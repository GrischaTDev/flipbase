# Task 7 – Bericht zum Supabase-pgTAP- und Datenbank-Gate

## Ergebnis

Der rekursiv ausgeführte Ordner `supabase/tests` enthält nur noch sechs echte
pgTAP-Dateien. Reine Fixtures liegen unter `supabase/test-support/fixtures`,
manuell beziehungsweise per PowerShell orchestrierte Szenarien unter
`supabase/test-support/manual`. Der neue RLS-Test deckt die fünf kritischen
Bestands- und Verkaufstabellen mit zwei Benutzern, zwei Arbeitsbereichen und
`anon` ab.

GitHub Actions erkennt Änderungen unter `supabase/` ohne Fremd-Action. Der
bedingte `database`-Job führt den lokalen Supabase-Stack und `npm run test:db`
aus. Das immer laufende `database-gate` akzeptiert ausschließlich die passende
Kombination aus Change-Entscheidung und Database-Ergebnis. Das Deployment
verlangt zusätzlich den ausdrücklichen Erfolg dieses Gates.

Ausgangscommit:

- `efd61018c862d61ab39cd816a1b152a67951f55b`

Task-Commit:

- Betreff: `test(database): gate Supabase changes with local integration tests`
- Der unveränderliche Hash wird nach dem Commit im Task-Handoff genannt; ein
  Commit kann seinen eigenen Hash nicht enthalten.

## Offizielle Grundlage

Am 30.08.2026 wurden die folgenden offiziellen Grundlagen verwendet:

- Die Supabase-CLI führt `supabase test db` gegen den gestarteten lokalen Stack
  aus, mountet ausschließlich `supabase/tests`, entdeckt dort `.sql` und `.pg`
  rekursiv und rollt jede Testdatei in einer eigenen Transaktion zurück:
  <https://supabase.com/docs/reference/cli/supabase-test-db>
- Die offizielle Datenbanktest-Anleitung verwendet pgTAP mit `begin`, exaktem
  `plan(...)`, Assertions, `finish()` und `rollback`:
  <https://supabase.com/docs/guides/database/testing>
- Für diesen Task wurde keine zusätzliche oder versionsgepinnte
  Testhelper-Extension eingeführt.

Es wurde ausschließlich die lokale CLI-Schnittstelle ohne `--linked`,
Produktions-URL oder Produktionsdaten verwendet. Schema und Migrationen wurden
nicht verändert; eine Typgenerierung war deshalb nicht erforderlich.

## RED-Ausgang und Docker-Blocker

Der erwartete fachliche RED-Ausgang war im Ausgangsstand statisch eindeutig:

- `supabase/tests/fixtures/inventory_integrity_legacy.sql` war ein rekursiv
  entdecktes Fixture ohne TAP-Plan;
- `inventory_sales_final_review.sql`, `inventory_sales_schema.sql` und
  `inventory_sales_transactions.sql` besaßen keinen TAP-Plan und kein
  `finish()`;
- `inventory_sales_legacy_migration.sql` war ein ausschließlich manuell
  orchestriertes Szenario ohne TAP-Plan im automatischen Testpfad;
- drei PowerShell-Harnesses lagen ebenfalls im automatischen Testbaum.

Der verlangte reale RED-Lauf konnte nicht ausgeführt werden. Docker Desktop war
bereits vor dem Task gestartet worden, seine Linux-Engine wurde aber während
des gesamten Tasks nicht verfügbar. Vier kurze `docker info`-Prüfungen und eine
abschließende Prüfung meldeten jeweils die fehlende Pipe
`npipe:////./pipe/dockerDesktopLinuxEngine`.

Die abschließenden Originalbefehle lieferten:

| Befehl | Exitcode | Tatsächlicher Fehler |
| --- | ---: | --- |
| `npx supabase start` | 1 | `LegacyDockerLifecycleInspectError`; Docker-API-Pipe fehlt |
| `npm run test:db` | 1 | `LegacyDbConnectError`; `ECONNREFUSED 127.0.0.1:54352` |

Docker Desktop wurde nicht erneut gestartet. Es wurden keine grünen
Datenbankergebnisse erfunden.

## Dateiorganisation und Fixture-Mount

Verschoben wurden:

| Vorher | Nachher |
| --- | --- |
| `supabase/tests/fixtures/inventory_integrity_legacy.sql` | `supabase/test-support/fixtures/inventory_integrity_legacy.sql` |
| `supabase/tests/inventory_sales_legacy_migration.sql` | `supabase/test-support/manual/inventory_sales_legacy_migration.sql` |
| `supabase/tests/inventory_integrity_upgrade.ps1` | `supabase/test-support/manual/inventory_integrity_upgrade.ps1` |
| `supabase/tests/run_inventory_sales_legacy_migration.ps1` | `supabase/test-support/manual/run_inventory_sales_legacy_migration.ps1` |
| `supabase/tests/concurrency/inventory_double_sale.ps1` | `supabase/test-support/manual/inventory_double_sale.ps1` |

Die offizielle CLI mountet nur `supabase/tests`. Daher kopiert der npm-Hook
`pretest:db` das kanonische Support-Fixture unmittelbar vor dem Lauf nach
`supabase/tests/.generated/inventory_integrity_legacy.sql.inc`. Die Endung
`.inc` wird nicht als eigener Test entdeckt. Das Integritätstestfile bindet
diese Mount-Kopie explizit mit `\ir` ein. Die generierte Datei ist ignoriert
und wird bei jedem Lauf überschrieben.

Der Verhaltenstest für den Kopierer wurde vor seiner Implementierung rot mit
`ERR_MODULE_NOT_FOUND` ausgeführt und danach grün. Eine reale Vorbereitung
ergab für Quelle und Mount-Kopie denselben SHA-256-Hash
`C09C6CAAAEF353BE467EBAB534D609C600286539815A862E798FF8EE7DC390A5`.

Alle drei manuellen PowerShell-Dateien wurden mit dem PowerShell-Parser
syntaktisch geprüft. Ihre relativen Pfade wurden an den neuen Ort angepasst.
Alle ermitteln den Datenbankcontainer über das Label
`com.supabase.cli.workdir=<aufgelöster Worktree>` und verlangen genau einen
Treffer; der zuvor geratene globale Containername wurde entfernt. Eine reale
Ausführung war wegen des Docker-Blockers nicht möglich. Das Upgrade-Harness
wurde nicht ausgeführt, da es den lokalen Stack zurücksetzen würde.

## pgTAP-Pläne

Die statische Inventur zählt ausschließlich echte, am Zeilenanfang
aufgerufene pgTAP-Assertions. Plan und Anzahl stimmen exakt überein:

| Automatische Testdatei | Plan | Assertions |
| --- | ---: | ---: |
| `business_record_immutability.sql` | 81 | 81 |
| `inventory_item_sale_integrity.sql` | 63 | 63 |
| `inventory_sales_final_review.sql` | 3 | 3 |
| `inventory_sales_schema.sql` | 5 | 5 |
| `inventory_sales_transactions.sql` | 1 | 1 |
| `rls_inventory_sales.test.sql` | 61 | 61 |
| **Gesamt** | **214** | **214** |

Jede dieser sechs Dateien besitzt `\set ON_ERROR_STOP on`, `begin`, den
exakten Plan, mindestens eine echte pgTAP-Assertion, `finish()` und `rollback`.
Die bestehenden großen `do`-Szenarien brechen intern weiterhin hart ab und
melden ihren erfolgreichen Abschluss anschließend mit einer expliziten
`pass(...)`-Assertion.

## RLS-Matrix

`rls_inventory_sales.test.sql` legt isolierte Fixtures im ID-Bereich `8400…`
an. Die Rollen werden real mit `set local role authenticated` beziehungsweise
`anon` gesetzt; die Benutzeridentität kommt aus der lokalen JWT-Claim
`request.jwt.claim.sub`.

| Tabelle | Eigenes Mitglied | Fremdes Mitglied | `anon` |
| --- | --- | --- | --- |
| `inventory_items` | Lesen sowie zulässiges Insert/Update/Delete erfolgreich | Select 0 Zeilen; Insert `42501`; leises Update/Delete wird zusätzlich als unveränderte beziehungsweise vorhandene Zeile geprüft | Select und Insert/Update/Delete jeweils `42501` |
| `stock_lots` | Lesen erfolgreich; direkte Schreibrechte fehlen, eigener Direkt-Insert `42501` | Select 0 Zeilen; Insert/Update/Delete `42501` | Select und Insert/Update/Delete `42501` |
| `stock_movements` | Lesen erfolgreich; direkte Schreibrechte fehlen, eigener Direkt-Insert `42501` | Select 0 Zeilen; Insert/Update/Delete `42501` | Select und Insert/Update/Delete `42501` |
| `sales` | Lesen erfolgreich; direkte Schreibrechte fehlen, eigener Direkt-Insert `42501` | Select 0 Zeilen; Insert/Update/Delete `42501` | Select und Insert/Update/Delete `42501` |
| `sale_lines` | Lesen erfolgreich; direkte Schreibrechte fehlen, eigener Direkt-Insert `42501` | Select 0 Zeilen; Insert/Update/Delete `42501` | Select und Insert/Update/Delete `42501` |

Für alle fünf Tabellen wird zusätzlich `relrowsecurity = true` geprüft. Die
vier Buchungstabellen sind absichtlich nur über die vorhandenen Fach-RPCs
schreibbar. Deshalb testet die Matrix dort nicht fälschlich direkte
Client-Schreiboperationen als zulässig.

## Wiederholbarkeit und Restdaten

Die sechs automatischen Dateien verwenden eigene Transaktionen und enden mit
`rollback`. Der neue RLS-Test verwendet ausschließlich den neuen ID-Bereich
`8400…`; die bestehenden Bereiche `8100…`, `8200…` und `8300…` bleiben
unverändert.

Die verlangten zwei realen `supabase test db`-Läufe sowie die anschließenden
Abfragen auf `8100…`, `8200…`, `8300…` und `8400…` konnten wegen des nicht
gestarteten lokalen Postgres nicht ausgeführt werden. Daher wurde auch kein
Cleanup ausgeführt: Ohne read-only Zielliste wäre ein Delete nicht zulässig.
Dieser Nachweis bleibt offen und ist keine grüne Abnahme.

## Workflow-TDD und Wahrheitstabelle

Vor dem Workflow-Umbau wurde der strukturierte Vertrag erweitert und mit
`npm run test:workflow` rot ausgeführt: 7 Tests bestanden, 3 scheiterten. Die
Fehler nannten genau die fehlenden Jobs `changes`, `database`,
`database-gate` und die fehlende Deploy-Abhängigkeit. Nach der Implementierung
meldet der Vertrag 11/11 grün.

Die Negativfixtures weisen zurück:

1. einen Change-Detector ohne `set -euo pipefail`;
2. ein Gate, das einen fehlgeschlagenen Changes-Job durchlässt;
3. ein Gate, das bei `supabase=true` ein übersprungenes Database-Ergebnis
   akzeptiert;
4. die bereits vorhandenen Test-/Image-/Deploy-Bypässe.

Der Change-Detector verwendet bei Pull Requests
`github.event.pull_request.base.sha`, bei Pushes `github.event.before` und
einen Checkout mit `fetch-depth: 0`. Bei leerer oder Null-SHA verwendet er den
direkten Vorgänger. Existiert auch dieser nicht, setzt er konservativ
`supabase=true`. Ein nicht auflösbarer sonstiger Vergleichscommit beendet den
Changes-Job mit Fehler statt `false` auszugeben.

Die Gate-Wahrheitstabelle lautet:

| `changes` | `supabase` | `database` | `database-gate` |
| --- | --- | --- | --- |
| `success` | `true` | `success` | `success` |
| `success` | `true` | `failure`, `cancelled` oder `skipped` | `failure` |
| `success` | `false` | `skipped` | `success` |
| `success` | `false` | anderer Zustand | `failure` |
| nicht `success` | beliebig/leer | beliebig | `failure` |

`deploy.needs` enthält `database-gate`; der Deploy-Ausdruck verlangt dessen
Ergebnis ausdrücklich als `success`.

## Prüfergebnisse

| Prüfung | Ergebnis |
| --- | --- |
| Workflowvertrag vor Implementierung | Erwartetes RED: 7 grün, 3 fehlgeschlagen |
| Fixture-Kopiervertrag vor Implementierung | Erwartetes RED: `ERR_MODULE_NOT_FOUND` |
| `npm run test:workflow` | Grün: 11/11 einschließlich Negativfixtures |
| pgTAP-Rahmen-/Planzählung | Statisch grün: 6 Dateien, 214/214 Assertions |
| Fixture-Vorbereitung und Hashvergleich | Grün; Quelle und `.inc` identisch |
| PowerShell-Parser | Grün: 3/3 Dateien syntaktisch gültig |
| `npm run format:check` | Grün |
| `npm run lint` | Grün |
| `npm run typecheck` | Grün |
| `npm test` | Grün: Node 90/717, DOM 9/92, Angular 18/230; insgesamt 117 Dateien und 1.039 Vitest-Fälle; Orchestrator 8 grün/3 Windows-Skips |
| `npm run build` | Grün; Build in 5,709 Sekunden |
| `npx prettier --check .github/workflows/ci.yml` | Grün |
| `git diff --check` | Grün |
| `npx supabase start` | Blockiert: Exit 1, Docker-Engine nicht erreichbar |
| `npm run test:db` zweimal | Blockiert vor erstem Lauf; keine DB-Ergebnisse |
| RLS-Test separat/gemeinsam | Blockiert; keine DB-Ergebnisse |
| Restdatenprüfung | Blockiert; lokaler Postgres nicht erreichbar |

## Offene Bedenken

- Die SQL-Suite ist statisch konsistent, aber ohne lauffähige Docker-Engine
  nicht gegen PostgreSQL/pgTAP ausgeführt. Vor einem Push müssen zwei
  unmittelbar aufeinanderfolgende lokale DB-Läufe und die Restdatenabfrage
  nachgeholt werden.
- Es wurde gemäß Brief kein externer Workflow, Push, Pull Request, Deployment
  oder Zugriff auf eine verknüpfte beziehungsweise produktive Datenbank
  ausgeführt. Die echte GitHub-Gate-Wirkung bleibt daher externe Evidenz.

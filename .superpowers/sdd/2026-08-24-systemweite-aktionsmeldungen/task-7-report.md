# Task 7 – Buchhaltung, Rechnungsversand und Shop-Bestellung

## Umsetzung

- `placeOrder` liefert explizit `success | partial | failed`. Bestellung, Positionen, Artikelstatus und Verkäufe werden über `place_store_order` atomar und idempotent gespeichert. Erst danach übernimmt der Client die Bestellung und leert den Warenkorb. Ein direkter Fehler erhält Formular, Warenkorb und Route; ein optionaler Benachrichtigungsfehler nach bestätigtem Parent ergibt eine Warnung statt eines zweiten Checkouts.
- Kontoauszug-Import, Ignorieren und Zurücksetzen nutzen `replace_bank_transactions`; einzelne Shop-Zahlungsbuchungen nutzen `book_bank_transaction`. Alle UI-Zustände und Erfolgstoasts folgen erst nach bestätigtem RPC-Ergebnis einschließlich Nulltrefferprüfung.
- Einzel- und Batch-Ergebnisse tragen typisierte Fehlerprovenienz. Ein leerer Batch meldet neutral „Keine passenden Transaktionen“, Teilerfolg zeigt eine Warnung mit tatsächlichen Zählern und zentral gemeldete Fehler erzeugen keinen doppelten Toast.
- Die bisher simulierte E-Mail-Übertragung wurde in ein wahrheitsgemäßes Vorbereiten des Berichtspakets umbenannt. UI, Service, Web-Push und interne Benachrichtigung behaupten keinen externen Versand mehr.
- Der Toast-Container bleibt in `app.html` neben dem obersten `router-outlet`. Ein Rendervertragstest bestätigt dort `status`- und `alert`-Meldungen, also auch außerhalb einzelner Feature-Routen wie `/shop`.

## Datenbank

- Deklaratives Schema: drei `security invoker`-Funktionen mit leerem `search_path`, vollqualifizierten Tabellenzugriffen und explizitem Execute-Recht ausschließlich für `authenticated`.
- Migrationen wurden ausschließlich per `supabase db diff` erzeugt:
  - `20260824201900_atomic_checkout_and_bank_persistence.sql`
  - `20260824202124_restrict_task7_rpc_execution.sql`
  - `20260824202334_validate_checkout_inventory_before_insert.sql`
- Nach frischem `supabase db reset` wurden die Supabase-Typen lokal neu generiert.
- Die transaktionale Fixture `task-7-db-verification.sql` prüft echte Auth-/RLS-Rechte, atomaren Checkout, idempotenten Retry, Rollback ohne Teilzustand, atomaren Bank-Replace, Shop-Zahlungsstatus und die Ablehnung der Rolle `anon`. Alle Fixture-Prüfungen bestanden; Abschluss erfolgt mit `rollback`.

## TDD und Prüfungen

- RED: Checkout scheiterte an implizitem Erfolg und vorzeitiger Navigation; Accounting an vorzeitigen Signaländerungen, fehlenden Nulltreffern/Outcomes und falschem Batch-Erfolg; der Steuerbericht an vorgetäuschtem Versand. Die neuen Specs waren vor der jeweiligen Implementierung rot.
- Gezielte Service-/UI-Tests: 5 Dateien, 35 Tests grün; bestehende Accounting-Regressionen: 4 Dateien, 37 Tests grün.
- Vollsuite: 84 Dateien, 585 Tests grün.
- Typecheck und Prettier: grün.
- ESLint: 0 Fehler; 48 bereits bestehende `any`-Warnungen außerhalb der Task-7-Änderungen.
- Angular-Produktionsbuild: grün; ausschließlich die bestehenden CommonJS-Hinweise für `jszip` und `jsbarcode`.
- `supabase db advisors --local`: keine Hinweise. `supabase db lint --local` meldet weiterhin zwei bereits vorhandene Fehler in den fremden Task-6-Funktionen `bundle_shipping_orders` und `unbundle_shipping_order` wegen des Exception-Codes `PGRST116`; die drei Task-7-Funktionen sind ohne Befund.

## Hinweise

Die drei ungetrackten Plan-/Spezifikationsdateien unter `docs/superpowers/` wurden nicht verändert oder gestaged.

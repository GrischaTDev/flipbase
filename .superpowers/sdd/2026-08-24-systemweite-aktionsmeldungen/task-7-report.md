# Task 7 – Buchhaltung, Rechnungsversand und Shop-Bestellung

## Umsetzung einschließlich Review-Runde 2

- Der Checkout erzeugt pro Nutzeraktion genau einen stabilen `CheckoutAttempt` mit Bestell-ID und Bestellnummer. Der Reentrancy-Guard greift vor Validierung und Submit; ein Retry nach direktem Fehler verwendet denselben Schlüssel.
- `placeOrder` liefert explizit `success | partial | failed`. Die RPC `place_store_order` sperrt alle betroffenen Inventarzeilen deterministisch, prüft Workspace, Duplikate und den exakt verkaufbaren Status `ready | listed` vor dem Parent-Insert. Bestellung, Positionen, Verkäufe und Artikelstatus werden in einer Transaktion gespeichert.
- Nach bestätigtem Parent übernimmt der Client die persistierte Bestellung und leert den Warenkorb. Fehlgeschlagene Navigation ist davon getrennt und erzeugt nur die Meldung „Bestellung gespeichert, Seite konnte nicht gewechselt werden.“; sie wird niemals als Bestellfehler gemeldet.
- Kontoauszug-Import, Buchen, Ignorieren und Zurücksetzen warten auf die jeweiligen RPCs und prüfen Nulltreffer. Bei vorhandenem Supabase ohne Workspace sowie bei unbekannter manueller Transaktions-ID gibt es keinen lokalen Scheinerfolg.
- Batch-Buchungen verwenden eine gemeinsame `SyncFehlerAktion` über `begin/finally/end`. Identische zentrale Fehler werden einmal gemeldet; lokale Ergebniszahlen und `partial`-Outcomes bleiben vollständig.
- Die Task-6-RPCs `bundle_shipping_orders` und `unbundle_shipping_order` verwenden für „nicht gefunden“ nun den gültigen PostgreSQL-SQLSTATE `P0002`; `SyncStatusService` übersetzt ihn typisiert.
- Die bisher simulierte E-Mail-Übertragung heißt wahrheitsgemäß Vorbereitung des Berichtspakets. UI, Service, Web-Push und interne Benachrichtigung behaupten keinen externen Versand.
- Der Toast-Container bleibt root-global. Der Rendervertragstest navigiert real auf `/shop`, rendert das Store-Layout und bestätigt dort `status`- und `alert`-Meldungen.

## Datenbank

- Deklaratives Schema mit `security invoker`, leerem `search_path`, vollqualifizierten Tabellenzugriffen und Execute-Recht ausschließlich für `authenticated`.
- Neue, ausschließlich per `supabase db diff` erzeugte Migration: `20260824205355_protect_checkout_inventory_and_fix_bundle_not_found.sql`.
- Ein frischer `supabase db reset` spielte alle Migrationen ein; anschließend wurden die lokalen Supabase-Typen neu generiert.
- `task-7-db-verification.sql` prüft Auth/RLS, atomaren und idempotenten Checkout, Rollback, einen zweiten Checkout mit anderer ID für denselben Artikel sowie die Bank-RPCs. Ergebnis: genau eine Bestellung und ein Verkauf.
- `task-7-db-concurrency-verification.ps1` führt zwei konkurrierende Bestellungen mit verschiedenen IDs gegen denselben Artikel aus. Genau eine gewinnt; Endzustand: eine Bestellung, ein Verkauf, Artikel `sold`.
- `task-6-db-verification.sql` prüft zusätzlich die realen `P0002`-Verträge bei fehlender Quell- bzw. Bundle-Bestellung.

## TDD und Prüfungen

- RED wurde vor GREEN für Reentrancy/Idempotency, Navigationsfehler, fehlenden Workspace, unbekannte manuelle ID, Batch-Deduplizierung, `P0002`, den zweiten Checkout und die echte `/shop`-Navigation belegt.
- Gezielte UI-/Service-Suite: 6 Dateien, 52 Tests grün.
- Vollsuite: 84 Dateien, 593 Tests grün.
- Typecheck: grün.
- ESLint: 0 Fehler; 48 bestehende `any`-Warnungen.
- Prettier-Prüfung: grün.
- Angular-Produktionsbuild: grün; nur bestehende CommonJS-Hinweise für `jszip` und `jsbarcode`.
- `supabase db lint --local`: keine Schemafehler.
- `supabase db advisors --local`: keine Hinweise.
- Task-6- und Task-7-Fixtures sowie der Paralleltest: grün.

## Hinweise

Die drei fremden, ungetrackten Plan-/Spezifikationsdateien unter `docs/superpowers/` wurden weder verändert noch gestaged.

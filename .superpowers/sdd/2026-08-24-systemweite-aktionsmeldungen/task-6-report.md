# Task 6 – Listings, Fulfillment, Recherche und Bildexport

## Umsetzung

- Listings, Fulfillment, Preisübernahme und Bildexport melden ihren bestätigten Abschluss per Toast; die bisherigen Veröffentlichungs- und Bündelungsbanner wurden entfernt.
- Erfolgszustände und Dialogschlüsse erfolgen erst nach einem bestätigten Service-Ergebnis. Lokale Fehler werden persistent gezeigt, zentral gemeldete Sync-Fehler nicht dupliziert.
- Listing-, Fulfillment- und Preisradar-Services liefern nun explizite Fehlerergebnisse beziehungsweise werfen beim bereits zentral gemeldeten Persistenzfehler. Die Versanddaten werden außerhalb des Demo-Modus vor der lokalen Übernahme gespeichert und Nulltreffer als Fehler behandelt.
- Der Bildexport zeigt bei Fehlern einen angepinnten Toast mit der Ausnahmebeschreibung; Vorschau-, Scan-, Kopier- und Navigationsaktionen bleiben ohne Toast.

## Tests und Prüfungen

- RED: neue Feature-Specs initial rot mit neun fehlenden/falschen Meldungen; Service-Vertrags-Specs anschließend rot mit fünf fehlenden Ergebnis-/Persistenzpfaden.
- Gezielte Tests: 7 Dateien, 30 Tests grün.
- Vollsuite: 79 Dateien, 548 Tests grün.
- Typecheck, Prettier und Build: grün.
- ESLint: keine Fehler; 48 bestehende `any`-Warnungen im Projekt.

## Hinweise

Die drei ungetrackten Plan-/Spezifikationsdateien unter `docs/superpowers/` wurden nicht verändert oder gestaged.

## Review-Runde 1

- Sammelpakete nutzen nun die atomaren RPCs `public.bundle_shipping_orders` und `public.unbundle_shipping_order`. Sie prüfen den Workspace, sperren die Quellaufträge, speichern den vollständigen Original-Snapshot, ersetzen beziehungsweise stellen die Aufträge innerhalb einer Transaktion wieder her und geben die echten Datenbankzeilen zurück.
- Die RPCs laufen als `security invoker` mit leerem `search_path`; `public`, `anon` und `service_role` haben keine Ausführungsrechte, ausschließlich `authenticated`.
- Der Frontend-Service übernimmt nur gültige zurückgegebene UUID-Aufträge. RPC-Fehler, Nullantworten oder ungültige Daten verändern den lokalen Versandbestand nicht.
- Das Radar-Inline-Banner wurde entfernt. Der nicht angebundene Versandmarkenkauf ist sichtbar deaktiviert und löst keine Erfolgsmeldung aus.
- Neue RPC-Vertragstests decken echte UUIDs, Reload-taugliche Rückgabewerte und unveränderten lokalen Zustand nach einem Rollback ab.

### Nicht verifizierbarer DB-Schritt

`npx supabase status`, `stop`, `db diff -f atomic_shipping_order_bundles` und `gen types --local` sind blockiert, weil Docker Desktop nicht läuft (`dockerDesktopLinuxEngine`-Pipe fehlt). Daher wurde bewusst keine Migration erzeugt und `supabase.types.ts` nicht verändert. Die versehentlich durch die fehlgeschlagene Typgenerierung überschriebene Datei wurde exakt aus `HEAD` wiederhergestellt. Nach Start von Docker sind Diff, lokale DB-Integrationstests und die Typgenerierung zwingend nachzuholen.

### Review-Runde 2

- Der lokale Reset hat beide generierten Migrationen angewandt. Die zweite Migration revokiert gezielt die durch den globalen Grant erneut vorhandenen `service_role`-Rechte; das ist beabsichtigt.
- Gemeinsame `sale_id` wird ausschließlich aus gesperrten Quellaufträgen abgeleitet; gemischte oder fehlende Werte werden zu `null`. Der Restore prüft Snapshot-Form, Workspace und die vollständige ID-Menge.
- `gen types typescript --local` lieferte in dieser lokalen CLI-Konfiguration trotz Reset ein leeres `public`-Schema und zerstörte damit den Typecheck. Die gültige Typdatei wurde aus `HEAD` wiederhergestellt; der Export muss mit korrigierter lokaler CLI-/Schema-Exposition erneut ausgeführt werden.

## Review-Runde 3 – finale DB-Verifikation

- Der UUID-Laufzeitfehler ist behoben: `bundle_shipping_orders` aggregiert die gesperrten `sale_id`-Werte als UUID-Array und übernimmt nur dann dessen ersten Wert, wenn alle Quellen dieselbe nichtleere ID haben. `min(uuid)` wird nicht mehr verwendet. Die automatisch erzeugte Migration ist `20260824193539_fix_bundle_sale_id_uuid.sql`.
- Der Frontend-Reload bewahrt eine Datenbank-`sale_id` von `null` unverändert. Ein eigener Regressionstest führt die Nullzeile durch `loadFromSupabase`.
- Die Typen wurden exakt mit `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts` neu erzeugt. Die Datei enthält `graphql_public`, `public.shipping_orders.bundled_orders_snapshot` sowie beide RPCs und ist gegenüber dem bereits gültigen `HEAD` unverändert.

### Echte lokale RPC-Fixture

Ausgeführt gegen `supabase_db_flipbase-supabase` als transaktionale Fixture `task-6-db-verification.sql`; Setup als `postgres`, Aufrufe anschließend mit `set local role authenticated` und den JWT-Claims des Testbenutzers. Abschluss immer mit `rollback`.

- Sicherheitsmetadaten: beide Funktionen sind `security invoker` (`prosecdef = false`), haben `search_path = ''` und `execute` nur für `authenticated`; `anon` wurde zur Laufzeit mit SQLSTATE `42501` abgewiesen, `service_role` besitzt kein Recht.
- Zwei Quellen mit derselben nichtleeren `sale_id` ergaben exakt `f6300000-0000-4000-8000-000000000001`. Die echte, von PostgreSQL erzeugte Bundle-UUID des protokollierten Laufs war `059a47bf-428d-4190-b100-c24040aa0b53`.
- Zwei unterschiedliche nichtleere `sale_id`-Werte ergaben `null`; eine nichtleere und eine leere `sale_id` ergaben ebenfalls `null`.
- Nach dem Bündeln waren beide Quellen verschwunden. RPC-Rückgabe und erneuter Tabellen-Reload waren vollständig gleich. Unbundle stellte exakt zwei Snapshot-Zeilen einschließlich ursprünglicher IDs, Workspace und aller gespeicherten Werte wieder her und entfernte das Bundle.
- Eine absichtlich erzeugte ID-Kollision ließ Unbundle mit SQLSTATE `23505` scheitern. Das innerhalb der Funktion bereits gelöschte Bundle war danach weiterhin vorhanden, die Kollisionszeile unverändert und keine teilweise wiederhergestellte zweite Quelle sichtbar.
- Ein auf einen fremden Workspace manipulierter Snapshot wurde mit SQLSTATE `22023` abgewiesen; das Bundle blieb erhalten. Nach Wiederherstellung des gültigen Snapshots funktionierte Unbundle.
- Im fremden Workspace waren über RLS exakt `0` Versandzeilen sichtbar. Sowohl der RPC als auch ein direkter RLS-Insert wurden mit SQLSTATE `42501` verweigert.
- Nach dem finalen Transaktions-`rollback` existierte der Fixture-Benutzer nicht mehr; damit blieben keine Testdaten zurück.

### Lokaler Migrationsstand

`supabase_migrations.schema_migrations` enthält 13 Einträge. Für diese Änderung relevant und lokal angewandt sind:

```text
20260824192345 atomic_shipping_order_bundles
20260824192516 atomic_shipping_order_bundles
20260824193539 fix_bundle_sale_id_uuid
```

### Finale App-Prüfungen

- Fokus: 5 Dateien, 22 Tests grün.
- Vollsuite: 79 Dateien, 554 Tests grün.
- Typecheck: grün.
- ESLint: 0 Fehler; 48 bereits bestehende `any`-Warnungen.
- Prettier: alle geprüften Dateien formatiert.
- Angular-Produktionsbuild: grün; ausschließlich die bestehenden CommonJS-Hinweise für `jszip` und `jsbarcode`.

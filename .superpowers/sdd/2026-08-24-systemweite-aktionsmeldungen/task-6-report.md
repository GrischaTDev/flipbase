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

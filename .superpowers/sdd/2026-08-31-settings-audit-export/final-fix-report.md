# Abschlussbericht zur finalen Fixwelle

Datum: 4. September 2026
Ausgangsstand: `72c2717165a0a8d30357b8a2c5e934dda764c7b8`

## Ergebnis

Alle sieben finalen Reviewbefunde sind behoben:

- Mystery-Box-Gesamtkosten werden als ein gemeinsamer Centbetrag stabil und gleichmäßig über alle Einheiten verteilt. Die Summe bleibt exakt, die Einheiten unterscheiden sich höchstens um einen Cent. Die normale positionsbezogene Kostenverteilung bleibt unverändert.
- Das Prüfarchiv enthält zusätzlich Quellen, Lieferanten, Artikelstamm, Retouren, Bestandskorrekturen, Rechnungen und Rechnungspositionen. IDs und Fremdschlüssel bleiben erhalten; `sale-line-lot-allocations.csv` enthält `consumption_sequence`.
- Einkauf und jede Verkaufszeile führen direkt zum datensatzbezogenen Prüfbeleg. Normale Workspace-Mitglieder dürfen diese serverseitig geprüfte Einzelansicht öffnen; die globale Druckansicht bleibt auf Inhaber, Admin und Buchhaltung begrenzt.
- Beide autoritativen Verkaufsfunktionen lehnen Teilcentpreise mit mehr als zwei Nachkommastellen ab, einschließlich `0.004` und `1.001`.
- Lokale Datumsfelder werden über lokale Tagesgrenzen DST-sicher nach UTC übersetzt.
- Der Artikelstamm in der Einkaufsposition verwendet den gemeinsamen `CustomSelect`; Auswählen und Leeren bleiben möglich.
- Eine ungültige direkte Zusatzkostenzuordnung deaktiviert alle Speichermöglichkeiten und zeigt eine zugeordnete, verständliche Validierungsmeldung.

## Testgetriebener Nachweis

Vor der Implementierung beziehungsweise vor der jeweiligen Korrektur wurden folgende Fehler gezielt beobachtet:

- Archiv-Service: 2 von 7 Tests rot (13 statt 20 Manifestdateien und fehlende neue CSV-Dateien).
- Datumsgrenzen und Druckrollen: 4 von 14 Tests rot (fälschlich angehängtes `Z` sowie vorzeitig gesperrter Einzelbeleg für Mitglieder).
- Navigation, Shared Select und Entwurfsvalidierung: 3 von 50 Tests rot.
- Verkaufs-RPCs: 4 von 67 pgTAP-Tests rot; beide Funktionen akzeptierten `0.004` und `1.001`.
- Mystery-Kosten: 2 von 290 pgTAP-Tests rot; die alte komponentenweise Rundung verletzte die globale Ein-Cent-Grenze.
- Audit-Snapshot: 3 von 24 pgTAP-Tests rot; sieben erforderliche Datenmengen fehlten.
- Abschließende Select-Prüfung: 1 von 15 Tests rot, weil sich eine bestehende Artikelzuordnung nach dem Umbau zunächst nicht leeren ließ.

Nach den Korrekturen bestanden:

- fokussierte Frontendtests: Archiv 7/7, Datum und Rollen 14/14, Navigation/UI 71/71 sowie Artikelstamm-Select 15/15;
- fokussierte Datenbanktests: Einkaufskosten 290/290, Verkaufsintegrität 67/67 und Audit-Snapshot 24/24;
- `npm run test:db`: 20 Dateien, 958 Prüfungen, Exitcode 0;
- `npm run format:check`, `npm run lint`, `npm run typecheck` und `npm run build`: jeweils Exitcode 0;
- abschließendes `npm test` auf eingefrorenem Quellstand: 983 Node-, 130 DOM- und 359 Angular-Tests bestanden; fünf Angular- und drei Orchestrator-Tests waren wie vorgesehen übersprungen, Exitcode 0.

## Migration und lokale Datenbank

Die deklarativen Dateien wurden zuerst geändert. Anschließend wurde die Migration
`supabase/migrations/20260904202415_final_settings_audit_fixes.sql` automatisch mit lokalem `supabase db diff` erzeugt und vollständig geprüft. Sie ersetzt ausschließlich die vier Funktionen `build_purchase_costing_plan`, `export_audit_snapshot`, `record_legacy_inventory_sale` und `record_sale`; sie enthält keine destruktiven Tabellenänderungen.

Ein vollständiger Reset der isolierten lokalen Supabase-Instanz hat die Migration erfolgreich angewendet. Danach liefen die Datenbanktests grün. Die nur für diese Instanz verwendeten Port- und Projektänderungen in `supabase/config.toml` sind vollständig zurückgesetzt. Andere lokale Supabase-Container und Datenbanken wurden nicht verändert.

Die Funktionssignaturen und Tabellenformen haben sich nicht geändert. Deshalb ergab sich keine Änderung an den generierten Supabase-Typen und es wurde keine unveränderte Typdatei eingecheckt.

## Verbleibende Grenzen

- Es wurde keine Produktionsdatenbank, kein Remote-System und kein Deployment berührt.
- Die Rollen, Navigation und Archivverträge sind durch Komponenten-, Service- und Datenbanktests abgedeckt; ein angemeldeter Browser-End-to-End-Test gegen eine reale lokale Sitzung war nicht Teil dieser Fixwelle.
- Die bestehende Archivgrenze von 100.000 Datensätzen beziehungsweise 50 MiB bleibt unverändert; die Fixwelle ersetzt keinen Lasttest mit einem maximal großen Archiv.

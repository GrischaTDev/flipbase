# Einkauf: Quelle, Verkäufer-Snapshot und Nachtrag nach Abschluss

Stand: 17. September 2026. Teil 1 von 3 des Einkaufsumbaus (Übergabe von ChatGPT
vom 16.09.2026). Teil 2 Belege, Teil 3 Einkauf drucken folgen als eigene PRs.
Zweig `feat/purchase-workflow-20260916`.

## Nutzerentscheidungen (17.09.2026)

1. Drei PRs nacheinander; dieser umfasst Quelle, Verkäufer-Snapshot und Nachtrag.
2. Migration und Supabase-Typen entstehen ohne lokales Docker in einem GitHub-Runner
   (Muster `product-contract-preview.yml`); der Hilfsworkflow wird vor dem Merge entfernt.
3. Der alte Zweig wird weitergeführt; Transferdateien sind entfernt.
4. Das fehlende Feld „Bezeichnung“ (PR #59) kommt mit in diesen PR.
5. Beim Nachtrag an abgeschlossenen Einkäufen ist ein Grund optional.

## Datenmodell `purchases`

Neue, optionale Spalten; leer bedeutet „nicht angegeben“, nie „Privatperson“:

| Spalte                        | Regel                                 |
| ----------------------------- | ------------------------------------- |
| `seller_type`                 | `private` oder `business`, sonst leer |
| `seller_name`                 | 1–200 Zeichen                         |
| `seller_marketplace_username` | 1–100 Zeichen                         |
| `seller_street`               | 1–200 Zeichen                         |
| `seller_address_extra`        | 1–200 Zeichen                         |
| `seller_postal_code`          | 1–20 Zeichen                          |
| `seller_city`                 | 1–100 Zeichen                         |
| `seller_country_code`         | `^[A-Z]{2}$`                          |
| `external_order_id`           | 1–100 Zeichen                         |
| `seller_details_version`      | Ganzzahl ≥ 0, Standard 0              |

`supplier_id` bleibt optionaler Verweis auf Stammdaten. `record_number` (interne
Nummer) und `supplier_reference` behalten ihre Bedeutung. `original_url` ist der
Angebotslink. Bestehende Einkäufe erhalten keine nachträglich befüllten Snapshots.

## Herkunftsangaben

„Herkunftsangaben“ sind genau: `source_id`, `supplier_id`, alle `seller_*`-Spalten,
`external_order_id`, `supplier_reference`, `original_url`.

- `normalize_purchase_seller_details(jsonb)` und
  `purchase_seller_details_snapshot(purchases)` liefern dieselbe JSON-Form; so
  vergleichen alle Speicherwege gleich (Text getrimmt, leer → `null`,
  Ländercode groß).
- `create_purchase` und `update_purchase_draft` speichern die neuen Felder.
  Ändert ein Entwurfsspeichern Herkunftsangaben, steigt `seller_details_version`.
  `purchase_draft_audit_snapshot` enthält die neuen Felder.

## Nachtrag `update_purchase_seller_details`

`(p_workspace_id uuid, p_purchase_id uuid, p_expected_version integer,
p_details jsonb, p_reason text default null) returns jsonb`

- `security definer`, weil abgeschlossene Einkäufe für Nutzer sonst gesperrt sind
  (`guard_purchase_costing_fields`). Nur `authenticated` darf ausführen.
- Prüft Anmeldung und Workspace-Mitgliedschaft (`42501`), nur bekannte Schlüssel
  (`22023`), Quelle und Verkäufer aus demselben Workspace (`22023`), Grund
  höchstens 500 Zeichen, erwartete Version (`40001`, „Der Einkauf wurde
  zwischenzeitlich geändert. Bitte neu laden.“).
- Ersetzt alle Herkunftsangaben durch den übergebenen Stand; fehlende Schlüssel
  werden leer. Ohne Änderung: keine neue Version, kein Ereignis.
- Schreibt ein Ereignis `purchase_seller_details_updated` mit nur den geänderten
  Feldern (`before`/`after`) und dem Grund in derselben Transaktion.
- Ändert keine Kosten, Positionen, Bestände, `entry_status`, `finalized_*`.
- Antwort: `{ purchase, eventId }`.

## Oberfläche

**Erfassung (bestehende Karte „Verkäufer und Einkauf“):** Bezeichnung (optional),
Quelle, gespeicherter Verkäufer (optional; Auswahl kopiert Art, Name und Anschrift
in die Felder), Plattform-Benutzername, Verkäuferart (Unbekannt, Privatperson,
Unternehmen), Name, Kaufdatum, aufklappbare Anschrift (Straße, Zusatz, PLZ, Ort,
Land). Seitenkarte „Einkaufsdetails“: Angebotslink, externe Bestellnummer,
Referenznummer, Beschreibung. Vorhandene Shared-Komponenten, kein neues Layout.

**Detailseite:** Karte „Verkäufer und Einkauf“ zeigt Snapshot, Quelle, Benutzername,
Bestellnummer, Referenz und Angebotslink; ohne Snapshot wie bisher den
Stammdaten-Namen. Bei abgeschlossenen Einkäufen öffnet „Verkäuferangaben
bearbeiten“ einen Dialog mit genau diesen Feldern und „Grund (optional)“.
Versionskonflikt erscheint als Meldung im Dialog, Eingaben bleiben erhalten.

**Liste:** Verkäufer-Anzeige: Name → Benutzername → Stammdaten-Name →
„Nicht angegeben“. Suche zusätzlich über Benutzername, externe Bestellnummer und
Stammdaten-Namen. Verkäuferfilter bleibt beim Stammdatenverweis; keine
automatische Zusammenführung gleicher Benutzernamen.

**Historie:** Ereignisname und Satz „Verkäuferangaben ergänzt“, Feldbezeichnungen
für alle neuen Felder.

**Demo-Modus:** gleiche Felder, gleiche Versionsprüfung und Konfliktmeldung.

## Tests

DB (`supabase/tests/purchase_seller_details.test.sql`): Einkauf ohne Stammdaten mit
Snapshot; Quelle und Benutzername bleiben; kopierter Stammdaten-Snapshot;
Stammdatenänderung ändert Snapshot nicht; Nachtrag nach Abschluss; Kosten,
Positionen, Bestand und Status unverändert; fremder Workspace abgelehnt; veraltete
Version abgelehnt; zusätzlich unbekannte Felder, fremde Quelle, direkte Änderung
abgeschlossener Einkäufe weiterhin gesperrt, Entwurfsspeichern erhöht Version.

Anwendung: Unit-Tests für Anzeige, Kopie aus Stammdaten und Service-Nachtrag
(Demo inkl. Konflikt); Komponententests für Formular und Detail-Dialog. Keine neuen
Playwright-Tests.

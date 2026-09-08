# Produktübergang – Bestandsaufnahme und Freigabepunkte

Stand: 08.09.2026, Basis `3b545c2`. Lesende Codeanalyse, keine Aussage über aktuelle produktive Datenmengen. Keine Geschäftsdaten in diesem Dokument.

## Gemeinsamer neuer Schreibweg

`catalog_products → purchase_lines(catalog_product_id) → stock_lots → sale_lines(catalog_product_id)`

Die Menge bestimmt keinen Produkttyp. Historische Einzelreferenzen bleiben lesbar und retournierbar; eine Zuordnung zum neuen Produkt wird zusätzlich angelegt. Gleiche Titel/EAN werden nicht automatisch verschmolzen.

## Verbraucherkarte

| Bereich          | Aktueller Vertrag                                                                                                | Erforderlicher Übergang                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Produktanlage    | `catalog.service.ts`, Katalogdialog/CSV und Einkaufseditor liefern `trackingMode`                                | Ein Produktvertrag, technischer Altwert nur noch Kompatibilität                                            |
| Erfassung        | `purchase-line-editor`, `PurchaseLineDraft` und `purchase.service.ts` unterscheiden `lineKind`                   | Bekannte Produkte mit ID und beliebiger positiver Menge; unbekannter Inhalt bleibt eigener Entwurfszustand |
| Einkaufs-RPCs    | `create_purchase`, `update_purchase_draft`, `add_purchase_lines`                                                 | Einheitliche Validierung und atomare Ereignisse; keine geänderten Fremd-Workspace-Rechte                   |
| Wareneingang     | `receive_purchase_lines` versus `receive_individual_purchase_line`; weiterer Legacy-Zugang über InventoryService | Ein neuer Loszugang; bestehende Empfangsreferenzen erhalten; keine doppelte Buchung                        |
| Kosten           | `finalize_purchase_costing`, `correct_purchase_costing`, Wiederöffnung und Demo                                  | Mengenpositionen vollständig unterstützen; unbekannte Kosten nicht als 0 darstellen/persistieren           |
| Bestand          | StockService plus InventoryService, zusammengeführt in `inventory-presentation.ts`                               | Alte/neue Bestände über nachvollziehbare Zuordnung ohne Doppelzählung lesen                                |
| Verkauf/Retoure  | `sale-target.models.ts`, `record_sale`, `record_legacy_inventory_sale`, `record_sale_return`                     | Neue Verkäufe über Produkt-ID; Altverkäufe und ursprüngliche Kostenallokationen behalten                   |
| Store            | `store.service.ts`, `place_store_order`                                                                          | Dieselbe verfügbare Menge und Reservierungslogik wie intern                                                |
| Medien           | `item_media` hängt ausschließlich am Einzelartikel                                                               | Persistente Produktmedien und workspacegebundener Storage-Zugriff; bestehende Pfade erhalten               |
| Berichte/Exporte | DashboardReportService liest beide Quellen; Auditexport ist keine Vollsicherung                                  | Identische Kennzahlen vor/nach Umstellung, vollständige Sicherung separat                                  |
| Demo             | Zwei Empfangswege, offene Mengenpreise/Finalisierung noch nicht gleichwertig                                     | Derselbe neue Vertrag und dieselben fachlichen Fehler wie im Backend                                       |

Mindestens 22 aktive Frontenddateien enthalten ausdrückliche Typ-/Legacy-Verzweigungen, mit Ziel-Fremdschlüsseln 40; 52 betroffene Testdateien gefunden. Das ist eine Untergrenze der Verbraucher, keine pauschale Änderungsfreigabe für alle Dateien.

## Nachgewiesene Vertragslücken

- `catalog_products.tracking_mode` und `purchase_lines.line_kind` sind derzeit Pflichtfelder. `supabase.types.ts` darf nicht von Hand angepasst werden.
- `stock_lots.unit_cost` ist nicht nullable; der Mengenempfang verwendet bei offenen Kosten aktuell 0. Das ist kein zulässiger Zielvertrag. Demo und Kostenfinalisierung benötigen denselben offenen Kostenzustand.
- `inventory_items` hat noch keinen Produktbezug für die historische Zuordnung.
- `catalog_product_media` fehlt. Bestehende Item-Storage-Policies prüfen lediglich den Bucket; neue Produktmedien benötigen ausdrücklich Workspace- und Pfadprüfung. Alte Medienrechte nicht stillschweigend ausweiten.
- Der Auditexport schließt unter anderem Item-Medien, Storetabellen und Storage-Objekte aus; er belegt weder vollständige Sicherung noch Wiederherstellbarkeit.

## Lokale Vorbereitung und isolierte CI

- [x] Verbraucher und gemeinsame Vertragsgrenze erfasst.
- [x] Nutzer erlaubt separaten GitHub-Test-PR ohne Merge/Deployment; Docker auf dem Arbeitslaptop bleibt verboten.
- [ ] Schema und Migration in der isolierten CI abgleichen; erzeugtes SQL vollständig prüfen, insbesondere Rechte, Kommentare und nicht vom Diff erfasste Datenzuordnungen.
- [ ] Generierte Typen aus genau dem geprüften Schema als Artefakt beziehen, nicht manuell nachbilden.
- [ ] Frischschema und Upgrade prüfen; Mengen 1/3/12, Teilzugänge, Idempotenz, FIFO 2×10 + 3×15, Verkauf 3 mit Wareneinsatz 35, Retoure und Nebenläufigkeit.
- [ ] Erst danach gemeinsame aktive Erfassung/Empfang/Verkauf und Medienverbraucher umschalten.

## Zusätzliche Freigabe vor produktiver Datenüberführung

- [ ] Vollständige aktuelle DB-Sicherung plus Storage-Objektkopie und Referenzmanifest außerhalb des Repositories.
- [ ] Isolierter Restore mit Foreign Keys, RLS und Medienzugriff nachgewiesen.
- [ ] Pro Workspace Zuordnungs-/Ausnahmeliste: Produkte, verfügbar/reserviert/verkauft, Einkaufssummen, offene/zugeordnete Kosten, Verkaufswareneinsatz, Retouren, Medien, verwaiste IDs, Mehrfachzuordnungen.
- [ ] Keine ungeklärte Zeile, verlorene Referenz oder nachträglich neu berechnete historische Buchung.
- [ ] Ausdrückliche Freigabe für Migration/Backfill, kontrolliertes Umschaltfenster ohne inkompatible alte Schreiber.

Kein Reset und keine Löschung alter Tabellen als Abkürzung. Die Test-PR-Freigabe ist keine Produktionsfreigabe.

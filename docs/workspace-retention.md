# Workspace-Archivierung

Ein archivierter Workspace bleibt auswählbar und lesbar. Bestehende
Leserechte und die Prüfarchiv-RPC bleiben unverändert. Archivierung ist kein
Löschtermin und keine Zusicherung gesetzlicher Konformität.

## Lebenszyklus und Rechte

- `workspaces.archived_at` ist optional; `null` bedeutet aktiv.
- Nur die tatsächliche Inhaber-Mitgliedschaft erlaubt `archive_workspace(uuid)`
  und `restore_workspace(uuid)`. Beide Aufrufe sind idempotent.
- Statusänderung und Journalereignis erfolgen in derselben Transaktion.
  Wiederholungen ohne Statuswechsel erzeugen keinen weiteren Eintrag.
- Direkte Statusänderungen durch `authenticated` und `service_role` werden
  abgewiesen. Privilegierte Funktionen laufen als Datenbankeigentümer
  `postgres`; nur die explizit autorisierten Lifecycle-RPCs sind für Clients
  freigegeben. Es gibt kein umschaltbares Sitzungs- oder Trigger-Bypassflag.
- Interne Helfer besitzen kein Client-Ausführungsrecht. Die ACL-Folgemigration
  ist zwingend mit auszuliefern, weil die erste pg-delta-Generierung bereits
  vorhandene Standardrechte nicht vollständig abbildete.

## Verbindliches Tabelleninventar

Die Registrierung steht in `supabase/schemas/80_workspace_retention.sql`.
Jede Tabelle wird bei `insert`, `update` und `delete` geprüft, auch unter
`security definer` und `service_role`.

| Direkter Workspace-Bezug     | Tabellen                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Einkäufe                     | purchases, purchase_lines, purchase_costs                                                                                                |
| Inventar und Bestand         | inventory_items, inventory_reconciliation_events, catalog_products, stock_lots, stock_movements                                          |
| Verkäufe                     | sales, sale_lines, sale_cost_entries, sale_line_lot_allocations                                                                          |
| Belege, Versand und Zahlung  | returns, invoices, shipping_orders, store_orders, bank_transactions, offline_purchase_entries, cash_wallet_sessions, email_confirmations |
| Artikelrecherche und Verlauf | market_research, activity_logs                                                                                                           |

| Kind ohne workspace_id                 | Verbindlicher Elternpfad            |
| -------------------------------------- | ----------------------------------- |
| item_costs, item_media, listing_drafts | inventory_item_id → inventory_items |
| invoice_items                          | invoice_id → invoices               |
| store_order_items                      | store_order_id → store_orders       |
| research_comparables                   | research_id → market_research       |

Das unveränderliche `business_events`-Journal erlaubt weiterhin ausschließlich
seine bestehenden internen Schreibwege, darunter die Lifecycle-Ereignisse.
Mitgliedschaften, Einstellungen und gelesene Benachrichtigungen werden nicht
pauschal eingefroren. Globale Sniper-Sammler ohne Workspace-Bezug sind nicht
betroffen. Neue operative Tabellen müssen ausdrücklich in dieses Inventar,
die Triggerregistrierung und die Tests aufgenommen werden.

## Gleichzeitige Zugriffe

Operative Trigger lesen den Workspace mit `for share` und halten die Sperre
bis zum Transaktionsende. Die Lifecycle-RPC nimmt auf demselben Workspace
`for update`; beide Sperren sind miteinander unverträglich.

- Eine bereits laufende Buchung beendet sich vor der Archivierung.
- Eine Buchung hinter einer laufenden Archivierung wartet und wird nach deren
  Commit abgewiesen.
- Bei Änderungen werden alter und neuer Workspace geprüft. Elternbezogene
  Tabellen sperren auch alte und neue Elternzeilen mit `for share`.
  Das verhindert das Umhängen aus einem archivierten Workspace sowie ein
  ungeprüftes paralleles Verschieben der Eltern.
- Die Inhaber-Mitgliedschaft wird während der Statusänderung ebenfalls
  gesperrt. Ein parallel entzogener Besitzstatus kann die Prüfung nicht
  unbemerkt überholen.

Die Regeln schützen normale Datenänderungen, nicht vor einem vertrauenswürdigen
Datenbankadministrator, der Trigger oder Rechte absichtlich entfernt.

## Löschablauf

Der bisherige Löschknopf führt zur Aufbewahrungssektion unter Daten & Protokolle.
Der angefragte Workspace steht in einem reaktiv gelesenen URL-Parameter.
Ein anderer Workspace wird erst durch eine ausdrückliche Auswahl aktiviert.
Es wird keine Inhaberrolle angenommen, solange keine passende Mitgliedschaft
des angemeldeten Nutzers geladen ist.

Vor der endgültigen Bestätigung wird ein ungefiltertes Prüfarchiv für exakt
diesen Workspace angeboten. Ein Geschäftsdaten-Fehler wird nicht automatisch
wiederholt; die Oberfläche bietet Archivierung an. Der Datenbankschutz umfasst
auch Lagerlose, Lagerbewegungen und das Journal. Schon eine frühere Archivierung
eines leeren Workspace erzeugt aufbewahrte Journaldaten und verhindert danach
die direkte Löschung. Im Demo-Modus ist dieser Server-Lebenszyklus ausdrücklich
deaktiviert.

## Prüfung

`supabase/tests/workspace_retention.sql` enthält 88 Verhaltenstests einschließlich
Rollen, direkter Umgehungsversuche, Kosten-/Medien-/Belegkindern, Buchungs-RPCs,
Verschiebungen, Wiederherstellung, Leserechten und Export.
Service- und Komponententests prüfen Bestätigung, Abbruch, Fehler, verspätete
Antworten, Workspace-Wechsel und den korrekten Exportkontext.

Lokale Supabase-Befehle nur mit einem ausdrücklich isolierten `--workdir`
ausführen. Nach Migrationen Typen regenerieren, alle Datenbanktests und Advisors
ausführen und abschließend den deklarativen Diff auf Leere prüfen.

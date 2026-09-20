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

| Direkter Workspace-Bezug     | Tabellen                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einkäufe                     | purchases, purchase_lines, purchase_costs                                                                                                                                       |
| Inventar und Bestand         | inventory_items, inventory_reconciliation_events, catalog_products, stock_lots, stock_movements                                                                                 |
| Verkäufe und Inserate        | listings, sales, sale_lines, sale_cost_entries, sale_line_lot_allocations                                                                                                       |
| Belege, Versand und Zahlung  | returns, invoices, shipping_orders, store_orders, bank_transactions, offline_purchase_entries, cash_wallet_sessions, email_confirmations, purchase_documents, expense_documents |
| Betriebsausgaben             | expense_categories, expense_recurring_rules, expenses                                                                                                                           |
| Artikelrecherche und Verlauf | market_research, activity_logs                                                                                                                                                  |

| Kind ohne workspace_id | Verbindlicher Elternpfad            |
| ---------------------- | ----------------------------------- |
| item_costs, item_media | inventory_item_id → inventory_items |
| invoice_items          | invoice_id → invoices               |
| store_order_items      | store_order_id → store_orders       |
| research_comparables   | research_id → market_research       |

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

Die Workspace-Verwaltung versucht nach einer eindeutigen Bestätigung zuerst die
direkte Löschung. Ein leerer Test-Workspace verschwindet damit ohne Seitenwechsel.
Ein Datenexport ist vor der Löschung nicht verpflichtend.

Lehnt die Datenbank die Löschung wegen aufbewahrungsrelevanter Geschäftsdaten
oder Prüfprotokolle ab, behandelt die Oberfläche das als erwarteten Fachzustand
und nicht als technischen Sync-Fehler. Sie erklärt den Grund und bietet direkt
die Archivierung als Alternative an. Der Workspace bleibt dann lesbar, neue
operative Änderungen werden gesperrt. Bereits archivierte Workspaces können in
der Workspace-Verwaltung wiederhergestellt werden.

Der vollständige Datenexport bleibt unabhängig davon unter Daten & Protokolle
verfügbar. Der Datenbankschutz umfasst weiterhin auch Lagerlose,
Lagerbewegungen und das Journal. Schon eine frühere Archivierung eines leeren
Workspace erzeugt aufbewahrte Journaldaten und verhindert danach die direkte
Löschung. Im Demo-Modus ist dieser Server-Lebenszyklus ausdrücklich deaktiviert.

Standard- und eigene Ausgabenkategorien sperren eine Löschung für sich allein
nicht. Eine Wiederholungsregel, eine Ausgabe oder ein Beleg gilt dagegen als
aufbewahrungsrelevante Geschäftsdaten und führt zuverlässig zur
Archivierungsentscheidung.

## Vollständiges Datenarchiv

Das ZIP enthält zusätzlich zu den CSV-Dateien für Einkäufe und Ausgaben die
Metadaten beider Belegarten. Vorhandene Originaldateien liegen unverändert unter
`documents/<storage_path>`; dieser Pfad ist aus dem jeweiligen Metadaten-Datensatz
ableitbar und bleibt damit über Exporte hinweg stabil. `document-downloads.json`
nennt für jeden Beleg, ob seine Originaldatei aufgenommen werden konnte. Fehlende
oder nicht lesbare Dateien werden dort mit Ursache ausgewiesen und führen in der
Oberfläche zu einer Warnung statt zu einer Erfolgsmeldung für ein vollständiges
Archiv.

## Prüfung

`supabase/tests/workspace_retention.sql` enthält Verhaltenstests einschließlich
Rollen, direkter Umgehungsversuche, Kosten-/Medien-/Belegkindern, Buchungs-RPCs,
Verschiebungen, Wiederherstellung, Leserechten und Export.
Service- und Komponententests prüfen Bestätigung, direkte Löschung,
Aufbewahrungssperren ohne technischen Sync-Fehler, Archivierung als Alternative
und Wiederherstellung in der Workspace-Verwaltung.

Lokale Supabase-Befehle nur mit einem ausdrücklich isolierten `--workdir`
ausführen. Nach Migrationen Typen regenerieren, alle Datenbanktests und Advisors
ausführen und abschließend den deklarativen Diff auf Leere prüfen.

# Abnahme: Warenwirtschaft und Verkaufsmodell

Datum der lokalen Abnahme: 2026-08-28
Migrationsname: `20260828101500_backfill_legacy_sale_lines.sql`

## Datenübernahme

Die Migration ergänzt für jeden bestehenden Verkaufsheader ohne Position genau
eine `sale_lines`-Zeile. Die Zeile erhält `quantity = 1`, die ursprüngliche
`inventory_item_id`, `sale_price` als Einzel- und Zeilenpreis sowie den
vorhandenen `allocated_purchase_cost` als COGS-Snapshot. Die Steuerart nutzt
zuerst einen gültigen Artikel-Override, danach eine gültige Workspace-Steuerart
und sonst den dokumentierten Standard `diff_25a`.

Die Rückfüllung ist idempotent. Sie ändert weder `inventory_items`, `sales`
noch `item_media` und erzeugt ausdrücklich keine `stock_lots` oder
`stock_movements` für historische Daten.

Die Vormigrationsfixture wurde in einer lokalen, zurückgerollten Transaktion
angelegt und danach mit der tatsächlichen Migration ausgeführt. Geprüft wurden:

- Legacy-Artikel, zugehöriges Bild und Verkaufsheader bleiben mit ihren
  ursprünglichen Werten lesbar.
- Der historische Verkauf besitzt danach exakt eine passende Verkaufsposition
  (`1 × 29,99 EUR`, COGS `12,34 EUR`).
- Null, alle drei gültigen Steuerarten, ein ungültiger Legacy-Freitext und die
  Priorität eines gültigen Overrides sind abgedeckt.
- Für den historischen Workspace existieren weiterhin null Bestandslose und
  null Bestandsbewegungen.

## Fachliche lokale Abnahme

Die lokale SQL-Akzeptanz deckte den fachlichen Ablauf mit einer LED-Lampe ab:

1. Mengenartikel und Einkauf `5 × 4,99 EUR` anlegen und vollständig einbuchen.
2. Mengenbestand `5` bestätigen, zwei Stück zentral verkaufen und Bestand `3`
   bestätigen.
3. Überverkauf ablehnen und die vollständige Retoure mit Bestand `5`
   bestätigen.
4. Shop-Checkout für zwei Stück idempotent ausführen; es entstehen genau eine
   Bestellung, eine Shopposition, ein zentraler Verkauf und eine
   Verkaufsposition.
5. Ein Mystery-Einzelstück separat zentral verkaufen; Status und COGS-Snapshot
   werden atomar bestätigt.

Die SQL-Verträge liefen lokal gegen den Supabase-Postgres-Container. Die
interaktive Browser-Endabnahme wurde anschließend im Demo-Modus durchgeführt
und ist weiter unten dokumentiert.

## Nachtrag: HTTP-Demo-Modus

Bei der Controller-Browserprüfung über eine HTTP-Adresse ohne
`crypto.randomUUID` wurde beim Anlegen eines Katalogartikels ein Defekt
gefunden: Der Demo-Service brach ab und der Dialog blieb auf „Speichere…“.
Die ID-Erzeugung ist jetzt zentralisiert. Datenbank-, Checkout- und andere
sicherheitsrelevante Kennungen verwenden `randomUUID` oder den
kryptografischen Browser-Fallback `getRandomValues`; ohne beides wird kein
schwacher Ersatzwert erzeugt. Die ausdrücklich getrennte lokale Demo-/temporäre
Kennung darf dagegen ausschließlich für Demo- und kurzlebige Clientdaten einen
nicht-kryptografischen Fallback verwenden.

Der Katalogdialog fängt geworfene Servicefehler ab und beendet seinen
Speicherzustand zuverlässig. Der Checkout schützt seinen Submit-Zustand auch,
wenn vor dem Serviceaufruf keine sichere Browser-UUID erzeugt werden kann.
Die interaktive Wiederholungsprüfung im Browser wurde nach der Korrektur
erfolgreich durchgeführt.

## Nachtrag: Demo-Einkauf mit Mengenpositionen

Die Browserprüfung fand außerdem einen fehlerhaften Übergang beim Anlegen eines
Demo-Einkaufs mit einer vorhandenen Mengenposition (`5 × 4,99 EUR`). Das Modal
übergab die Position korrekt. Danach speicherten die getrennten LocalStorage-
Schreibwege Einkauf und Position jedoch unabhängig und unterdrückten
Speicherfehler. Dadurch war ein positionsloser Einkauf mit falscher
Erfolgsmeldung möglich. Die Demo-Persistenz schreibt Eltern-Einkauf und erste
Positionen jetzt journalgestützt atomar und übernimmt die Signale erst nach
erfolgreichem Speichern.

Die Einkaufsübersicht und Detailansicht zählen offene Mengenpositionen nach
bestellter Menge, nicht nur bereits angelegte Inventarartikel. Der 5er-Einkauf
zeigt damit fünf Positionen vor dem Wareneingang, kann später erneut geladen
und vollständig eingebucht werden. Auch nach dem Wareneingang bleibt es bei
fünf: Der Demo- und der Supabase-Ladepfad beziehen die Einkaufspositionen ein,
ohne Lose oder verknüpfte Einzelartikel doppelt zu zählen. Positionslose
Demo-Einzelkäufe legen weiterhin ihren Inventarartikel an.

## Interaktive Browser-Endabnahme

Der vollständige Mengenartikel-Ablauf wurde im Demo-Modus über die echte
Anwendungsoberfläche geprüft:

1. Den Artikelstamm `LED-Lampe Abnahme` direkt aus der Einkaufsanlage auswählen.
2. Einen Nachkauf mit `5 × 4,99 EUR` anlegen und die Detailseite neu laden.
3. Den Wareneingang über alle fünf Stück buchen und Bestand `5` bestätigen.
4. Zwei Stück zu je `9,99 EUR` über Kleinanzeigen verkaufen und Bestand `3`
   bestätigen.
5. Verkaufsliste und Dashboard prüfen: Umsatz `19,98 EUR`, COGS `9,98 EUR`
   und realisierter Gewinn `10,00 EUR` wurden korrekt angezeigt.
6. Den Verkauf vollständig retournieren: Bestand wieder `5`; Umsatz und
   realisierter Gewinn des retournierten Verkaufs werden im Dashboard nicht
   mehr als realisiert ausgewiesen.

Mystery-Einzelverkauf und Shop-Checkout wurden nicht zusätzlich mit künstlichen
UI-Daten wiederholt. Beide Abläufe sind durch den zentralen lokalen
SQL-Akzeptanzvertrag abgedeckt; der dabei verwendete Abnahmeartikel hatte
bewusst keinen öffentlichen Shop-Verkaufspreis und wurde deshalb nicht im Shop
angeboten.

Der Backendpfad wurde separat geprüft: Er übergibt die Startpositionen erst mit
der bestätigten finalen Einkaufs-ID und meldet einen Positionsfehler nicht als
vollen Erfolg.

Zusätzlich ist der Checkout ohne `crypto.randomUUID` und ohne
`crypto.getRandomValues` abgedeckt: Die Bestellung wird nicht aufgerufen, der
Fehler bleibt sichtbar, der Submit-Zustand wird beendet und die Formulardaten
bleiben erhalten.

## Nachtrag: direkter Katalogzugriff und eindeutige Demo-Einkäufe

Der Einkaufspositionseditor lädt den Artikelstamm beim Öffnen nun selbst für
den aktiven Workspace. Damit steht ein persistierter Mengenartikel wie die
LED-Lampe auch dann sofort zur Auswahl, wenn seit dem App-Start noch keine
Artikelstammseite besucht wurde. Während des Ladens ist die Auswahl gesperrt;
Fehler werden direkt am Editor mit einer Wiederholen-Aktion angezeigt. Das gilt
für Demo-Daten und den Supabase-Ladepfad gleichermaßen.

Demo-Einkäufe verwenden für ihre Elternkennung jetzt denselben kollisionsfesten
lokalen ID-Generator wie ihre Positionen. Zwei Einkäufe innerhalb derselben
Millisekunde bleiben dadurch getrennte Datensätze; ihre Einkaufspositionen
verweisen jeweils auf den richtigen Eltern-Einkauf.

## Nachtrag: Positions-Reload und Workspace-Rennen

Die Persistenzprüfung bildet jetzt den vollständigen Neustart nach: Einkauf
anlegen, neue Store- und Serviceinstanz erzeugen, Detail laden und anschließend
Wareneingang buchen. Dabei bleibt exakt eine Mengenposition mit `5` bestellt
und `0` eingegangen erhalten. Die Detailseite reagiert zusätzlich auf einen
später verfügbaren oder gewechselten Workspace und Demo-Kontext. Verspätete
Antworten eines alten Kontexts dürfen den aktuellen Detailzustand nicht mehr
überschreiben. Ein gespeicherter `items_count` kaschiert bei einem ausdrücklich
geladenen, aber leeren Positionssatz keine fehlenden Datensätze mehr.

Der Katalogladevorgang ist ebenfalls kontextgebunden: Er wird pro Workspace
dedupliziert, ignoriert verspätete Antworten und bietet ausschließlich Produkte
des aktiven Workspace an. Bei fehlgeschlagenem Laden bleiben fremde gecachte
Produkte unsichtbar und die Auswahl gesperrt.

## Abschlussprüfung des Gesamtbranches

Der abschließende unabhängige Branch-Review wurde nach zwei Korrekturrunden
mit `APPROVED` beendet. Dabei wurden insbesondere folgende Integritätsfälle
noch einmal gegen Datenbank und Demo-Modus geprüft:

- Drei getrennte Einzelverkäufe aus einem Los mit Gesamtkosten von `30,04 EUR`
  ergeben zusammen exakt `30,04 EUR` COGS; Rundungsreste gehen nicht verloren.
- Nachträglich erfasste Einkaufspositionen erhalten vor dem Wareneingang ihren
  korrekten Anteil bereits vorhandener Zusatzkosten. Nach dem Wareneingang ist
  diese strukturelle Änderung gesperrt.
- Teilgutschriften reduzieren Umsatz und Gewinn, erzeugen aber ohne physische
  Rücknahme keine falsche Bestandsbewegung und keinen Retourenstatus.
- Direkte Schreibrechte auf Bestandslose, Bestandsbewegungen,
  Verkaufspositionen und deren Loszuordnungen sind entzogen. Buchungen laufen
  ausschließlich über die workspace-gesicherten Transaktionsfunktionen.
- Shop-Checkout, manueller Verkauf und Demo-Modus verwenden dieselbe zentrale
  FIFO- und Kostenlogik. Öffentliche Angebote benötigen einen positiven,
  gespeicherten Verkaufspreis.

## Ausgeführte Prüfungen

| Befehl                                                                                         | Ergebnis                                                                                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npx supabase db reset --local`                                                                | Erfolgreich; alle Migrationen einschließlich `20260828101500_backfill_legacy_sale_lines.sql` angewendet.        |
| `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts`            | Erfolgreich; keine Typänderung aus der reinen Datenmigration.                                                   |
| `npx supabase db diff --local`                                                                 | Erfolgreich: `No schema changes found`.                                                                         |
| `Get-Content -Raw supabase/tests/inventory_sales_schema.sql \| docker exec ... psql ...`       | PASS: `BEGIN`, fünf `DO`, `ROLLBACK`.                                                                           |
| `Get-Content -Raw supabase/tests/inventory_sales_transactions.sql \| docker exec ... psql ...` | PASS: `BEGIN`, `DO`, `ROLLBACK`.                                                                                |
| `.\supabase\tests\run_inventory_sales_legacy_migration.ps1`                                    | PASS: echte Migration zweimal per `\i` ausgeführt; `BEGIN`, `DO`, `INSERT 0 7`, `INSERT 0 0`, `DO`, `ROLLBACK`. |
| Zentraler Mengen-/Einzelverkauf-/Shop-Checkoutvertrag im lokalen Container                     | PASS: `BEGIN`, `DO`, `ROLLBACK`.                                                                                |
| `npm run typecheck`                                                                            | PASS.                                                                                                           |
| `npm test -- --run`                                                                            | PASS: 101 Testdateien, 685 Tests.                                                                               |
| `npm run format:check`                                                                         | PASS: alle Dateien entsprechen Prettier.                                                                        |
| `npm run build`                                                                                | PASS; bekannte Bundle- und CommonJS-Warnungen, siehe unten.                                                     |
| `git diff --check`                                                                             | PASS: keine Whitespace-Fehler.                                                                                  |
| Gezielte HTTP-Demo-Regressionssuiten (Befehl unten)                                            | PASS: 8 Testdateien, 41 Tests; sichere Fallback-UUID, Demo-Katalog und Submit-Fehlerzustand.                    |
| Gezielte Einkaufszählungs-, Persistenz- und Checkout-Regressionssuiten (Befehl unten)          | PASS: 8 Testdateien, 43 Tests.                                                                                  |
| Gezielte Katalog-Direkteinstiegs-, Modal- und Einkaufsregressionssuiten (Befehl unten)         | PASS: 9 Testdateien, 55 Tests.                                                                                  |
| Gezielte Positions-Reload-, Workspace-Race- und Einkaufsregressionssuiten (Befehl unten)       | PASS: 11 Testdateien, 62 Tests.                                                                                 |

```powershell
npm test -- --run src/app/core/utils/client-identity.spec.ts src/app/core/services/catalog.service.spec.ts src/app/features/catalog/catalog.component.spec.ts src/app/features/store/pages/store-checkout/store-checkout-actions.spec.ts src/app/core/services/purchase-create-persistence.spec.ts src/app/core/services/mock-data-store-individual-receipt.spec.ts src/app/core/services/inventory-persistence.spec.ts src/app/core/services/bank-reconciliation.service.spec.ts

npm test -- --run src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts src/app/core/services/purchase-demo-create.spec.ts src/app/core/services/purchase-quantity-count.spec.ts src/app/core/services/purchase-create-persistence.spec.ts src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts src/app/features/store/pages/store-checkout/store-checkout-actions.spec.ts src/app/core/services/mock-data-store-individual-receipt.spec.ts src/app/core/services/stock.service.spec.ts

npm test -- --run src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.spec.ts src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts src/app/core/services/purchase-demo-create.spec.ts src/app/core/services/purchase-create-persistence.spec.ts src/app/core/services/purchase-persistence.spec.ts src/app/core/services/purchase-line-money.spec.ts src/app/core/services/purchase-cost-allocation.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts src/app/features/purchases/purchases-toast-actions.spec.ts

npm test -- --run src/app/core/services/catalog.service.spec.ts src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.spec.ts src/app/core/services/purchase-demo-create.spec.ts src/app/core/services/purchase-quantity-count.spec.ts src/app/core/services/purchase-create-persistence.spec.ts src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts src/app/core/services/purchase-persistence.spec.ts src/app/core/services/purchase-line-money.spec.ts src/app/core/services/purchase-cost-allocation.spec.ts src/app/features/purchases/purchases-toast-actions.spec.ts
```

## Bekannte Vorbefunde und Bedenken

- Der Production-Build bleibt erfolgreich, warnt aber weiterhin wegen eines
  um 16,61 kB überschrittenen Initial-Budgets und der CommonJS-Abhängigkeiten
  `jszip` sowie `jsbarcode`.
- Es wurde ausschließlich die lokale Supabase-Datenbank zurückgesetzt und
  geprüft. Es gab keine Remote- oder Produktionsmigration und keine
  Produktionsdatenänderung.
- Die interaktive Browser-Endabnahme ist abgeschlossen. Mystery-Einzelverkauf
  und Shop-Checkout sind zusätzlich durch den zentralen SQL-Vertrag abgedeckt.

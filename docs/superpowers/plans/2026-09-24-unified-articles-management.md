# Unified Articles Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Artikeltabelle mit Bestand, sichtbarer Bearbeitung, reversibler Archivierung und auf unbenutzte Artikel begrenztem Löschen liefern.

**Architecture:** `/catalog` bleibt die einzige aktive Listenroute. Ein reiner Adapter führt bestehende Katalog- und Bestandsdaten zusammen; Feature-Services führen Aktionen aus. Datenbankfunktionen erzwingen Archiv- und Löschregeln transaktional, während eine geschützte Warteschlange private Bilddateien nach dem Löschen bereinigt.

**Tech Stack:** Angular 22, TypeScript, Signals, Tailwind CSS, Supabase/Postgres, pgTAP, Vitest, Deno Edge Functions.

**Spec:** `docs/superpowers/specs/2026-09-24-unified-articles-management-design.md`

## Global Constraints

- Eine Zeile je `catalog_products`-Datensatz oder eigenständigem `inventory_items`-Stück; keine Zusammenführung nach Titel/EAN.
- Archivieren darf bei Bestand erfolgen; physische Menge, Wert, Buchungen und Belege bleiben gleich. Archivierte Artikel sind für neue Verkäufe und Inserate nicht verfügbar.
- Löschen nur ohne jeglichen Einkaufs-, Bestands-, Verkaufs-, Shopauftrags- oder Inseratsbezug. Prüfungen gehören in dieselbe Datenbanktransaktion wie das Löschen.
- Alle Tabellen bleiben in `public`; neue Schema-Dateien in `supabase/schemas/` und in `supabase/config.toml` registrieren. Migrationen mit `supabase db diff` erzeugen, prüfen und mit den generierten Typen im selben PR einreichen.
- Neue Tabellen mit RLS und expliziten Policies/Rechten je Operation und Rolle. Funktionen verwenden `set search_path = ''`, vollqualifizierte Namen und minimale `security definer`-Rechte.
- Angular: Standalone, OnPush, Signals, externe Templates, neue Control-Flow-Syntax, Tailwind im Template. Tabellen mit `DataTableComponent`; Gestaltung nach `docs/design/admin-ui-guidelines.md`, Markenakzent `#fcc601`.
- Code-Bezeichner Englisch, Oberflächentexte Deutsch und Du-Ansprache. Neue Zweige `juna/`, Commits mit Nutzer-Autor und ohne KI-Signatur.
- Fremde Zweige/Worktrees unangetastet lassen. Vor einem Push die gezielten Prüfungen ausführen; vor PR-Erstellung die in `AGENTS.md` vorgegebene Frage stellen.

## Review Focus

1. Zwei Workspaces haben Artikel mit gleicher EAN und gleichem Titel: Suche und Aktionen dürfen sie nie vermischen. Test in Task 2 und 6.
2. Ein vorbereitetes, noch nicht veröffentlichtes Inserat verweist auf den Artikel: Archivieren muss mit erklärbarem Fehler scheitern. Test in Task 1.
3. Ein Verkauf wird retourniert, während `status` eines älteren Stücks noch „sold“ ist: physischer Bestand darf nicht allein aus `archived_at` oder `status` geraten werden. Test in Task 2.
4. Nach einem Workspace-Wechsel trifft eine alte Archiv-/Löschantwort ein: der neue Workspace bleibt unverändert. Test in Task 6.
5. Ein Bildpfad zeigt auf einen anderen Artikel oder ein anderes Workspace: der Bereinigungsdienst darf die Datei nicht löschen. Test in Task 4.

## Dateigrenzen und Schnittstellen

| Einheit | Dateien | Verantwortung |
| --- | --- | --- |
| Archivregeln | `supabase/schemas/database.sql`, `97_inventory_archive.sql`, neue `235_article_lifecycle.sql` | Metadaten, gesicherte Archivaktionen und Löschprüfung |
| Medienaufträge | neue Tabelle in `235_article_lifecycle.sql`, neue `supabase/functions/article-media-cleanup/` | Persistente Dateipfade und wiederholbare Storage-Bereinigung |
| Mengen | `src/app/features/catalog/utils/catalog-overview.ts`, `src/app/features/inventory/utils/inventory-presentation.ts`, `src/app/core/models/inventory-sellability.ts` | Physisch vorhanden, reserviert und verkaufbar getrennt berechnen |
| Artikeltabelle | `src/app/features/catalog/catalog.component.ts/.html`, neue `features/catalog/models/article-row.ts` | Eine Zeile je Identität, Filter, Spalten, Aktionen |
| Aktionen | neue `features/catalog/services/article-lifecycle.service.ts`, bestehende Archiv-/Katalogservices | RPC-Aufruf, Pending-Zustand und Reload ohne Cross-Workspace-Leak |
| Schreibwege | `230_listings.sql`, Verkaufs-/Shopfunktionen in `database.sql`, betroffene Auswahlkomponenten | Archivierte Artikel serverseitig abweisen und in neuen Auswahlen verbergen |
| Navigation | `article-navigation.ts`, `workspace-navigation.ts`, `app.routes.ts`, `table-defaults.config.ts` | Ein Sidebar-Eintrag, alte Links und gespeicherte Tabellenansicht |

Die `article-row.ts` definiert `ArticleKind = 'catalog' | 'item'` und `ArticleRow` mit `key`, `id`, `kind`, `title`, `detailLink`, `onHand`, `available`, `reserved`, `quantityState`, `inventoryValue`, `archivedAt` und `canOfferDelete`. `null` bei Mengen bedeutet ungeklärt, niemals null Stück. Die Lifecycle-Service-Schnittstellen sind `setArchived(workspaceId, kind, id, archived): Promise<void>` und `deleteUnused(workspaceId, kind, id): Promise<void>`.

### Task 1: Transaktionale Archivierung für beide Artikelarten

**Files:**
- Modify: `supabase/schemas/database.sql` (neue Spalten am Ende der `catalog_products`-Definition)
- Modify: `supabase/schemas/97_inventory_archive.sql`
- Create: `supabase/schemas/235_article_lifecycle.sql`
- Modify: `supabase/config.toml` (`235_article_lifecycle.sql` nach `230_listings.sql` registrieren)
- Modify: `supabase/tests/inventory_archive.test.sql`
- Create: `supabase/tests/article_lifecycle.test.sql`
- Generated: neue `supabase/migrations/YYYYMMDDHHmmss_article_lifecycle.sql`, `src/app/core/models/supabase.types.ts`

**Interfaces:** `public.set_catalog_product_archived(uuid, uuid, boolean) returns public.catalog_products`; bestehendes `public.set_inventory_item_archived(uuid, uuid, boolean) returns public.inventory_items` bleibt signaturgleich.

- [ ] **Step 1: Fehlende SQL-Tests ergänzen.** Ein aktives Einzelstück mit Kosten 5 und ohne offene Bindung wird archiviert; `archived_at` wird gesetzt, Kosten und Verkaufs-/Bestandszustand bleiben gleich. Ein Stammartikel mit Losbestand wird ebenfalls archiviert. Ein `listings.status = 'prepared'`-Datensatz, eine offene Reservierung und ein offener Shopauftrag sperren beide Arten; fremder Nutzer, fremder Workspace und direkte Client-Änderung der Archivspalten scheitern.

```sql
select lives_ok($$select public.set_inventory_item_archived('97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000021',true)$$,
  'Vorhandenes Einzelstück darf archiviert werden');
select is((select allocated_purchase_cost from public.inventory_items where id='97000000-0000-4000-8000-000000000021'),5::numeric,
  'Archivieren ändert Kosten nicht');
select throws_ok($$select public.set_catalog_product_archived('97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000040',true)$$,
  '22023',null,'Vorbereitetes Inserat sperrt Archivierung');
```

- [ ] **Step 2: Tests rot laufen lassen.** `npm run test:db -- --file supabase/tests/article_lifecycle.test.sql` beziehungsweise `npx supabase test db --file ...`; die neue Funktion fehlt und der bisherige Einzelstücktest erwartet noch das alte Verbot.
- [ ] **Step 3: Schema umsetzen.** `catalog_products` erhält `archived_at timestamptz` und `archived_by uuid` mit Akteursbezug und Index `(workspace_id, archived_at)`. Schutztrigger verweigert direkte Archivänderungen. Beide RPCs sperren Mitgliedschaft/Workspace und Zielzeile, prüfen offene Reservierungen, `listings.status <> 'ended'` und offene Shopaufträge, setzen nur Metadaten und schreiben je Zustandswechsel genau ein `business_events`-Ereignis. Vorhandene `inventory_items.status='archived'`-Altwerte werden nicht stillschweigend umgeschrieben. Beispiel der unveränderlichen Kernregel:

```sql
if p_archived and exists (
  select 1 from public.listings l
  where l.workspace_id = p_workspace_id and l.catalog_product_id = p_product_id
    and l.status <> 'ended'
) then
  raise exception using errcode = '22023', message = 'Bitte das Inserat zuerst beenden.';
end if;
```

- [ ] **Step 4: DB-Tests grün; Migration und Typen erzeugen.** `supabase stop`, `supabase db diff -f article_lifecycle`; erzeugte Migration auf fehlende Rechte, Trigger, Policies und destruktive Befehle prüfen, nie eine bestehende Migration ändern. `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts`. Bei fehlendem Docker dieselben Schritte in isolierter Testumgebung ausführen, nicht auf Produktion ausweichen.
- [ ] **Step 5: Geänderte Dateien prüfen und committen.** `npx prettier --check` für geänderte unterstützte Dateien, gezielte DB-Tests, `git diff --check`; `git commit -m "feat(inventory): add guarded article archive"`.

### Task 2: Physische Menge und Artikelzeilen korrekt ableiten

**Files:**
- Create: `src/app/features/catalog/models/article-row.ts`
- Modify: `src/app/features/catalog/utils/catalog-overview.ts`
- Modify: `src/app/features/catalog/utils/catalog-overview.spec.ts`
- Modify: `src/app/features/inventory/utils/inventory-presentation.ts`
- Modify: `src/app/features/inventory/utils/inventory-presentation.spec.ts`
- Modify: `src/app/core/models/inventory-sellability.ts`
- Modify: `src/app/core/models/flipbase.models.ts` (`CatalogProduct.archived_at`, `archived_by`)

**Interfaces:** `buildCatalogOverview(...)` liefert weiterhin genau eine Zeile je Identität, nun mit `onHand`, `available`, `reserved`, `quantityState`, `inventoryValue` und `archivedAt`. `isSellableInventoryItem` berücksichtigt Archivmetadaten; `onHand` verwendet sie ausdrücklich nicht.

- [ ] **Step 1: Falltests schreiben.** Produkte ohne Wareneingang → `onHand=0`; archiviertes Los mit Restmenge 3 → `onHand=3`, `available=0`, Wert unverändert; archiviertes unsold Einzelstück → `onHand=1`, `available=0`; retourniertes Stück mit abweichendem altem `status` → „Zu prüfen“ statt behaupteter Null; gleiche EAN in zwei Workspaces → nur eigener Datensatz; unbekannte Menge → `null`.

```ts
expect(rows.find((row) => row.key === 'catalog:own')?.onHand).toBe(3);
expect(rows.find((row) => row.key === 'catalog:own')?.available).toBe(0);
expect(rows.some((row) => row.key === 'catalog:other')).toBe(false);
```

- [ ] **Step 2: Tests rot laufen lassen.** `npx vitest run --project=node src/app/features/catalog/utils/catalog-overview.spec.ts src/app/features/inventory/utils/inventory-presentation.spec.ts`; erwarteter Fehler: Felder fehlen oder Archiv setzt Lagerbestand auf null.
- [ ] **Step 3: Minimal berechnen.** Bestehende `summarizeStockQuantities`/Kostenfunktionen wiederverwenden. `archived_at` wirkt nur auf `available`/`canSell`; verkaufte Stücke folgen belegtem Verkaufszustand, nicht dem Archivdatum. Verknüpfte Einzelstücke anhand `purchase_line_id` genau einmal beim Stammartikel addieren. Statuskonflikte behalten `quantityState='review_required'`.

```ts
const onHandQuantity = quantityState !== 'known' ? null : sold === 1 ? 0 : 1;
const available = item.archived_at ? 0 : isSellableInventoryItem(item) ? 1 : 0;
```

- [ ] **Step 4: Gezielte Tests grün laufen lassen, formatieren und committen.** Zusätzlich `npm run typecheck`; `git commit -m "fix(inventory): preserve archived on-hand stock"`.

### Task 3: Unbenutzte Artikel transaktional löschen und Bilder vormerken

**Files:**
- Modify: `supabase/schemas/235_article_lifecycle.sql`
- Modify: `supabase/tests/article_lifecycle.test.sql`
- Modify: `supabase/tests/catalog_product_media.test.sql`
- Generated: neue Migration und generierte Supabase-Typen im selben Commit

**Interfaces:** `public.delete_unused_article(p_workspace_id uuid, p_article_kind text, p_article_id uuid) returns jsonb` liefert `{"deleted":true,"queued_media":N}` oder wirft einen fachlichen Fehler. Neue `public.article_media_cleanup_jobs` hält pro Datei Workspace, Artikelart/-ID, Bucket, kanonischen Pfad, Versuche, nächsten Versuch, Abschluss und letzten Fehler.

- [ ] **Step 1: SQL-Fälle rot machen.** Unbenutzter Stammartikel mit zwei Bildern wird samt Metadaten gelöscht und erzeugt exakt zwei Aufträge; ein Artikel mit Einkaufsposition, Lagerlos, Bestandsposition, Bewegung, Einzelstück, Verkauf, Shopauftrag oder Inserat bleibt vollständig erhalten. Bei Legacy-Stücken zusätzlich `purchase_id`, `purchase_line_id`, `item_costs`, `returns`, `inventory_reconciliation_events`, `store_order_items`, `activity_logs` und `item_media` prüfen; eigene Medien sind löschbar, fachliche Bezüge nicht. Unbekannte Art/ID, fremder Workspace, anonymer Nutzer und parallele Verknüpfung scheitern.

```sql
select throws_ok($$select public.delete_unused_article('97000000-0000-4000-8000-000000000010','catalog','97000000-0000-4000-8000-000000000040')$$,
  '23503',null,'Vorhandene Einkaufsposition verhindert Löschen');
select is((select count(*) from public.listings where catalog_product_id='97000000-0000-4000-8000-000000000040'),1::bigint,
  'Keine Inserate werden kaskadierend gelöscht');
```

- [ ] **Step 2: DB-Tests rot laufen lassen.** Die RPC und Auftrags-Tabelle fehlen.
- [ ] **Step 3: Auftrags-Tabelle und RPC ergänzen.** RLS einschalten, Mitgliedern ausschließlich `select` auf eigene Aufträge gewähren, alle Client-Schreibrechte entziehen; `service_role` erhält nur die benötigten `select`-/`update`-Rechte für die Bereinigung. RPC mit `security definer`, `set search_path=''`, `(select auth.uid())`, Zeilensperre und expliziter Existenzprüfung jeder fachlichen Referenz. Fremdschlüssel mit `restrict` sind zweite Barriere; `listings` mit `cascade` muss die RPC vor `delete` ausdrücklich ablehnen. Bildpfade zuerst in die Warteschlange kopieren, dann Bildmetadaten und Artikel in derselben Transaktion löschen, schließlich Löschereignis mit Titel-Snapshot schreiben.

```sql
if exists (select 1 from public.purchase_lines where workspace_id=p_workspace_id and catalog_product_id=p_article_id)
   or exists (select 1 from public.listings where workspace_id=p_workspace_id and catalog_product_id=p_article_id)
then
  raise exception using errcode='23503', message='Der Artikel wird bereits verwendet und kann nur archiviert werden.';
end if;
```

- [ ] **Step 4: DB-Tests grün; Migration/Typen aktualisieren.** Schema-Diff nach `supabase stop` neu erzeugen; bestehende generierte Migration aus Task 1 auf diesem noch unveröffentlichten Zweig nur durch eine neue Migration ergänzen. SQL-Review auf Transaktionalität, Privilegien, RLS, Trigger und alle FK-Bezüge. `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts`.
- [ ] **Step 5: Commit.** Gezielte DB-Tests und `git diff --check`, dann `git commit -m "feat(inventory): delete only unused articles"`.

### Task 4: Private Bilddateien bereinigen und Fehler sichtbar machen

**Files:**
- Create: `supabase/functions/article-media-cleanup/index.ts`
- Create: `supabase/functions/article-media-cleanup/index.test.ts`
- Create: `src/app/features/catalog/services/article-media-cleanup.service.ts`
- Test: `src/app/features/catalog/services/article-media-cleanup.service.angular.spec.ts`

**Interfaces:** Edge Function `POST /article-media-cleanup` mit `{ workspaceId, force?: boolean }`, Nutzer-JWT und Antwort `{ completed, pending, failed }`. Sie verifiziert die Mitgliedschaft mit dem Nutzerkontext, liest anschließend nur dessen Workspace-Aufträge mit serverseitigen Rechten und ruft `storage.from('item-media').remove([exactPath])`. Ein lokaler Typ `CleanupJob` enthält `workspace_id`, `article_kind`, `article_id`, `storage_path` und `next_attempt_at`; `isCanonicalArticlePath(job: CleanupJob): boolean` prüft für Stammartikel `catalog-products/<workspace>/<article>/<uuid>.<Bildendung>` und für ältere Stücke `<article>/<Dateiname>` ohne Pfadwechsel. `ArticleMediaCleanupService.retry(workspaceId, force)` liefert den Status für den sichtbaren Hinweis.

- [ ] **Step 1: Deno- und Service-Tests schreiben.** Anderer Workspace → 403; Pfad außerhalb `catalog-products/<workspace>/<article>/...` bzw. Legacy-Item-Pfad → niemals `remove`; erfolgreiche Löschung markiert Auftrag erledigt; Storage-Fehler erhöht Versuche und setzt `next_attempt_at`; derselbe Auftrag ist wiederholbar; fehlende Service-Role-Konfiguration ergibt einen klaren Serverfehler. Im UI bleibt nach Fehler „Bildbereinigung ausstehend“ mit „Erneut versuchen“ sichtbar.

```ts
expect(storageRemove).not.toHaveBeenCalledWith(['catalog-products/other/item/image.png']);
expect(await service.retry('own-workspace')).toEqual({ completed: 1, pending: 0, failed: 0 });
```

- [ ] **Step 2: Tests rot laufen lassen.** `deno test --allow-env supabase/functions/article-media-cleanup/index.test.ts` und `npx vitest run --project=angular ...article-media-cleanup.service.angular.spec.ts`.
- [ ] **Step 3: Funktion und Aufruf implementieren.** Nutzer-JWT mit Supabase Auth prüfen, Workspace-Mitgliedschaft vor Service-Role-Zugriff verifizieren, Bucket/Pfad gegen die gespeicherte Artikel-ID prüfen, fällige Aufträge begrenzt laden, `remove` pro Pfad durchführen und Ergebnis persistent speichern. Bei einem vorübergehenden Fehler bis zu drei begrenzte Versuche im Hintergrund mit `EdgeRuntime.waitUntil` ausführen; danach bleibt der Auftrag erhalten. Funktion nach Löschung und beim nächsten Öffnen der Artikelseite anstoßen; der sichtbare „Erneut versuchen“-Knopf sendet `force: true` und darf nur eigene Workspace-Aufträge erneut anstoßen. Keine Service-Role-Zugangsdaten im Angular-Bundle.

```ts
if (job.workspace_id !== workspaceId || !isCanonicalArticlePath(job)) {
  throw new Error('Ungültiger Bildpfad im Bereinigungsauftrag.');
}
const { error } = await admin.storage.from('item-media').remove([job.storage_path]);
```

- [ ] **Step 4: Deno-/Angular-Tests grün, Edge-Rechte und Build prüfen.** Die Funktion muss im lokalen/CI-Test mit simuliertem Storage laufen; keine Produktionsdateien für Tests verwenden.
- [ ] **Step 5: Commit.** `git commit -m "feat(image-opt): clean deleted article media"`.

### Task 5: Neue Vorgänge mit archivierten Artikeln sperren

**Files:**
- Modify: `supabase/schemas/database.sql` (`record_sale`, `record_legacy_inventory_sale`, `place_store_order`)
- Modify: `supabase/schemas/230_listings.sql` (`prepare_listing`, `set_listing_online`)
- Modify: `supabase/tests/inventory_sales_transactions.sql`
- Modify: `supabase/tests/listings.test.sql`
- Modify: `supabase/tests/product_core_contract.test.sql`
- Modify: `src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.ts` und `.angular.spec.ts`
- Modify: `src/app/features/purchases/components/purchase-product-picker/purchase-product-picker.component.ts` und `.angular.spec.ts`
- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts` und `.angular.spec.ts`
- Modify: `src/app/features/listings/pages/listing-editor/listing-editor.component.ts` und `.angular.spec.ts`
- Generated: neue Migration und aktualisierte Typen

**Interfaces:** SQL-Schreibwege lesen `catalog_products.archived_at`/`inventory_items.archived_at` nach Zeilensperre und werfen `22023` bei neuen Verkaufs-, Shop- oder Inseratsvorgängen. Abgeschlossene Vorgänge, Retouren, Korrekturen und historische Ansichten bleiben möglich.

- [ ] **Step 1: Regressionsfälle rot schreiben.** Archiviertes Produkt mit Lagerbestand kann weder `record_sale` noch `place_store_order` noch `prepare_listing`/`set_listing_online` nutzen. Legacy-Stück ebenso. Beendete Inserate und vorhandene Verkäufe bleiben lesbar; Wiederherstellung erlaubt nur bei sonst gültigem Zustand neue Aktionen.

```sql
select throws_ok($$select public.prepare_listing('97000000-0000-4000-8000-000000000010',null,'{}'::jsonb,'97000000-0000-4000-8000-000000000040')$$,
  '22023',null,'Archiviertes Produkt bleibt aus neuen Inseraten');
```

- [ ] **Step 2: Gezielte SQL-Tests rot laufen lassen.** Bestehende Funktion in `230_listings.sql` prüft `archived_at` bereits, aber die Spalte fehlte bisher; alle anderen Schreibwege explizit prüfen.
- [ ] **Step 3: Serverseitige Prüfungen und Picker ergänzen.** Archivstatus an jeder tatsächlichen Schreibgrenze lesen, nicht nur im Browser filtern. In neuen Einkaufs-/Verkaufs-/Inseratsauswahlen archivierte Artikel ausblenden, direkte URLs/RPC-Aufrufe trotzdem serverseitig abweisen. Historische Selektoren behalten ihre bestehenden Datensätze. Nur fachlich nötige SQL-Funktionen ändern; keine Änderung bestehender Buchungen.

```ts
const selectableProducts = computed(() => products().filter((product) => !product.archived_at));
```

- [ ] **Step 4: Tests grün; Migration/Typen aktualisieren.** Auf vollständige, transaktionale Migration ohne Seiteneffekte prüfen. Gezielte Angular-Tests und `npm run build` für Template-Bindungen ausführen.
- [ ] **Step 5: Commit.** `git commit -m "fix(inventory): reject archived articles in new workflows"`.

### Task 6: Aktionen und eine Tabelle im Artikel-Feature

**Files:**
- Create: `src/app/features/catalog/services/article-lifecycle.service.ts`
- Create: `src/app/features/catalog/services/article-lifecycle.service.angular.spec.ts`
- Modify: `src/app/features/catalog/catalog.component.ts/.html`
- Modify: `src/app/features/catalog/catalog.component.angular.spec.ts`
- Modify: `src/app/features/catalog/pages/product-detail/product-detail.component.html`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.html`
- Modify: `src/app/core/config/table-defaults.config.ts`
- Modify: `src/app/features/catalog/services/catalog-view-state.service.ts`
- Test: neue Angular-Interaktionstests im Artikel-Feature, nicht nur Template-Textsuche

**Interfaces:** `ArticleLifecycleService.setArchived(workspaceId, kind, id, archived)` ruft je Art die passende RPC; `deleteUnused(...)` ruft `delete_unused_article`. Die Komponente hält `view: signal<ArticleView>` und `rows: computed<ArticleRow[]>`; `ArticleView = 'active' | 'archive' | 'all' | 'stock' | 'empty' | 'review'`.

- [ ] **Step 1: Angular-Tests rot schreiben.** Eine Zeile mit Bestand null bleibt sichtbar; Desktop und Mobil bieten „Bearbeiten“; Archiv-Dialog benennt Bestand und Wert; Delete-Dialog erscheint nur für vermutet unbenutzte Artikel; Fehler lässt Zeile unverändert; Erfolg lädt Daten neu. Nach Workspace-Wechsel darf eine verspätete RPC-Antwort den neuen Workspace nicht verändern. Gleicher Titel/EAN in zwei Workspaces bleibt getrennt. Tastatur aktiviert Aktionen, Fokus kehrt nach Dialogschluss an Auslöser zurück.

```ts
fixture.nativeElement.querySelector('[data-article-archive="catalog:product-a"]').click();
await fixture.whenStable();
expect(fixture.nativeElement.textContent).toContain('3 Stück');
expect(lifecycle.setArchived).toHaveBeenCalledWith('workspace-a', 'catalog', 'product-a', true);
```

- [ ] **Step 2: Tests rot laufen lassen.** `npx vitest run --project=angular src/app/features/catalog`; fehlende Service-Aktionen und Tabellenfelder sind der erwartete Fehler.
- [ ] **Step 3: Services und Oberfläche implementieren.** Signale für Pending-IDs und Antwortkontext, explizite RPC-Datenprüfung, fachliche Fehlermeldungen. `DataTableComponent` beibehalten; Standardspalten Artikel, Auf Lager, Verfügbar, Status, Aktionen; optionale Spalten gemäß Spec. Filter vor Sortierung anwenden, unbekannte Mengen nie als null sortieren. Aktionen als echte Buttons mit zugänglichem Namen; Detail-Editoren über den Rückweg `/catalog` erreichbar halten. `ArticleMediaCleanupService.retry` nach erfolgreichem Löschen aufrufen und seinen Status anzeigen.

```ts
if (this.workspace.currentWorkspace()?.id !== workspaceId) {
  throw new Error('Der Workspace hat sich geändert. Bitte neu laden.');
}
const rpcName = kind === 'catalog' ? 'set_catalog_product_archived' : 'set_inventory_item_archived';
```

- [ ] **Step 4: Gezielte Tests, AXE und Build grün.** `npx vitest run --project=angular src/app/features/catalog`, `npm run typecheck`, `npm run build`, gezielte AXE-/Browserprüfung für Dialog und Filter.
- [ ] **Step 5: Commit.** `git commit -m "feat(inventory): manage articles in one table"`.

### Task 7: Navigation, alte Links und Gesamtabnahme

**Files:**
- Modify: `src/app/core/config/article-navigation.ts`
- Modify: `src/app/core/config/workspace-navigation.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/core/config/article-navigation.spec.ts`
- Modify: `src/app/core/config/workspace-navigation.spec.ts`
- Create: `src/app/app.routes.angular.spec.ts`
- Modify: `docs/design/admin-ui-guidelines.md`
- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:** Sidebar-Eintrag „Artikel“ → `/catalog`; `/inventory` → `/catalog?view=stock`; `/inventory/new` → `/catalog/new`; `/inventory/:id` bleibt für ältere Einzelstücke. Der kanonische Listenfilter liest den `view`-Query-Parameter mit ungültigem Wert als `active`.

- [ ] **Step 1: Routing-/Navigationstests rot schreiben.** Exakt ein Artikel-Eintrag und keine Kinder; alter Bestandslink öffnet die gemeinsame Tabelle mit Bestandsfilter; alte Einzelstück-Detail-URL bleibt erhalten; unbekannter `view`-Wert fällt auf „Aktiv“ zurück. Browser-Back stellt vorherigen Filter ohne zweite Seite wieder her.

```ts
expect(articleNavigation.children).toBeUndefined();
await router.navigateByUrl('/inventory');
expect(router.url).toBe('/catalog?view=stock');
await router.navigateByUrl('/inventory/legacy-item');
expect(router.url).toBe('/inventory/legacy-item');
```

- [ ] **Step 2: Tests rot laufen lassen.** Navigation zeigt derzeit noch zwei Kinder und `/inventory` lädt die zweite Liste.
- [ ] **Step 3: Navigation und Doku umstellen.** Routen in der richtigen Reihenfolge (`inventory/new`, `inventory/:id`, dann `inventory`) halten; Redirect darf Detail-Links nicht abfangen. `docs/design/admin-ui-guidelines.md` nennt eine Tabelle mit Filtern statt zwei Sidebar-Unterpunkten. Changelog dokumentiert Verhalten und tatsächliche Prüfungen.

```ts
{ path: 'inventory/new', redirectTo: '/catalog/new' },
{ path: 'inventory/:id', loadComponent: () => import('./features/inventory/pages/item-detail/item-detail.component').then((m) => m.ItemDetailComponent) },
{ path: 'inventory', pathMatch: 'full', redirectTo: '/catalog?view=stock' },
```

- [ ] **Step 4: Gezielte Abnahme.** Datenbanktests für Archiv, Löschung, Inserat und Verkauf; Edge-/Angular-Tests; `node scripts/check-admin-shared-ui.mjs`; betroffene Dateien formatieren/linten; `npm run typecheck` und `npm run build`. `git diff --check` und generierte Migration mit Schema vergleichen. Wenn lokale DB/Runtime fehlt, isolierte CI-Prüfung vor dem PR-Merge nutzen und den fehlenden lokalen Lauf offen benennen.
- [ ] **Step 5: Commit und PR-Freigabe fragen.** `git commit -m "feat(ui): use one article navigation entry"`. Vor Push exakt fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“ Erst nach Ja pushen, PR auf Deutsch erstellen, Pflichtprüfungen abwarten und gemäß Projektregel per Merge-Commit abschließen.

## Plan-Selbstprüfung

- Spec-Abdeckung: Navigation, Tabelle, bestehende Editoren, Archivierung, Werte/Mengen, Löschsperre, Bilddateien, Fehlerzustände und Prüfungen haben jeweils eine Task.
- Der Plan ändert keine historische Buchung und schafft keine automatische Produktzusammenführung.
- Neue SQL-Dateien werden in `schema_paths` eingetragen; Migrationen und Typen laufen im selben PR. `230_listings.sql` wird auf die neue Spalte abgestimmt.
- Die fünf Fälle unter „Review Focus“ sind in den Tests der Tasks 1, 2, 4 und 6 ausdrücklich enthalten.

# Systemweite Aktionsmeldungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede ausdrücklich ausgelöste Änderung in Flipbase erhält eine eindeutige Erfolgs- oder Fehlermeldung im zentralen Toast-Stapel.

**Architecture:** Der bestehende signalbasierte `ToastService` verwaltet kurzlebige normale Meldungen und angepinnte Fehler. Ein eigener Bridge-Service überführt `SyncStatusService`-Fehler genau einmal in denselben Stapel und koppelt das manuelle Schließen zurück; Feature-Komponenten melden konkrete Erfolge und nur solche fachlichen Fehler selbst, die nicht bereits über den Sync-Kanal laufen.

**Tech Stack:** Angular 22, TypeScript 6, Signals, Tailwind CSS 4, Vitest 4, Supabase JS 2

**Spec:** `docs/superpowers/specs/2026-08-24-systemweite-aktionsmeldungen-design.md`

## Global Constraints

- Keine neue externe Bibliothek.
- Keine Datenbankmigration.
- Keine Toasts für automatische Hintergrund-Ladevorgänge.
- Keine doppelte Fehleranzeige über Banner und Toast.
- Keine verlorenen Formulareingaben oder Navigation bei einem Fehler.
- Erfolg: grün und 4 Sekunden; Information: blau und 4 Sekunden; Warnung: gelb und 6 Sekunden; Fehler: rot, angepinnt und nur manuell schließbar.
- Neue Meldungen erscheinen unten und schieben ältere Meldungen nach oben.
- Feldbezogene Validierung bleibt direkt am Formular und erzeugt keinen Toast.
- Alle bestehenden und neuen Tests, TypeScript-Prüfung, Lint und Produktionsbuild müssen erfolgreich sein.

---

### Task 1: Ausdrückliches Toast-Modell und angepinnte Sync-Fehler

**Files:**

- Modify: `src/app/shared/components/toast/toast.service.ts`
- Modify: `src/app/shared/components/toast/toast.service.spec.ts`
- Modify: `src/app/shared/components/toast/toast-container.component.ts`
- Modify: `src/app/shared/components/toast/toast-container.component.html`
- Create: `src/app/shared/components/toast/toast-sync-bridge.service.ts`
- Create: `src/app/shared/components/toast/toast-sync-bridge.service.spec.ts`
- Modify: `src/app/layout/shell/shell.component.ts`
- Modify: `src/app/layout/shell/shell.component.html`
- Delete: `src/app/shared/components/sync-error-banner/sync-error-banner.component.ts`
- Delete: `src/app/shared/components/sync-error-banner/sync-error-banner.component.html`

**Interfaces:**

- Consumes: `SyncStatusService.fehler`, `SyncStatusService.verwerfen(id)`.
- Produces: `ToastMessage { id, type, title, description?, persistent }`.
- Produces: `ToastService.success(title, description?)`, `error(title, description?)`, `warning(title, description?)`, `info(title, description?)`, `dismiss(id)`.
- Produces: `ToastSyncBridgeService`, einmalig durch die Shell instanziert.

- [ ] **Step 1: Service-Tests auf Titel, Beschreibung und dauerhafte Fehler umstellen**

```ts
it('pinnt Fehler an, bis sie ausdrücklich geschlossen werden', () => {
  const id = service.error(
    'Lieferant konnte nicht gelöscht werden.',
    'Dem Lieferanten sind noch Einkäufe zugeordnet.',
  );

  vi.advanceTimersByTime(60_000);
  expect(service.toasts()).toContainEqual({
    id,
    type: 'error',
    title: 'Lieferant konnte nicht gelöscht werden.',
    description: 'Dem Lieferanten sind noch Einkäufe zugeordnet.',
    persistent: true,
  });

  service.dismiss(id);
  expect(service.toasts()).toEqual([]);
});
```

- [ ] **Step 2: Bridge-Tests für genau eine Sync-Meldung und rückgekoppeltes Schließen schreiben**

```ts
it('überführt einen Sync-Fehler genau einmal und verwirft ihn beim Schließen', () => {
  syncStatus.melde('Löschen des Lieferanten', {
    code: '23503',
    message: 'foreign key violation',
  });
  TestBed.flushEffects();

  expect(toast.toasts()).toHaveLength(1);
  expect(toast.toasts()[0]).toMatchObject({
    type: 'error',
    title: 'Löschen des Lieferanten fehlgeschlagen.',
    description: 'Ein verknüpfter Datensatz fehlt oder wurde gelöscht.',
    persistent: true,
  });

  toast.dismiss(toast.toasts()[0].id);
  TestBed.flushEffects();
  expect(syncStatus.fehler()).toEqual([]);
});
```

- [ ] **Step 3: Fokussierte Tests rot ausführen**

Run: `npm test -- src/app/shared/components/toast/toast.service.spec.ts src/app/shared/components/toast/toast-sync-bridge.service.spec.ts`

Expected: FAIL, weil `ToastMessage` noch nur `message` kennt, Fehler nach acht Sekunden verschwinden und die Bridge fehlt.

- [ ] **Step 4: Modell, Timer und Bridge minimal implementieren**

```ts
export interface ToastMessage {
  readonly id: number;
  readonly type: ToastType;
  readonly title: string;
  readonly description?: string;
  readonly persistent: boolean;
}

error(title: string, description?: string): number {
  return this.show('error', title, description, true);
}

private show(
  type: ToastType,
  title: string,
  description: string | undefined,
  persistent: boolean,
): number {
  const toast = { id: this.naechsteId++, type, title: title.trim(), description, persistent };
  this.toasts.update((liste) => {
    const erweitert = [...liste, toast];
    const normaleIds = new Set(
      erweitert
        .filter((meldung) => !meldung.persistent)
        .slice(-4)
        .map((meldung) => meldung.id),
    );
    return erweitert.filter((meldung) => meldung.persistent || normaleIds.has(meldung.id));
  });
  if (!persistent) {
    this.timer.set(toast.id, setTimeout(() => this.dismiss(toast.id), ANZEIGEDAUER[type]));
  }
  return toast.id;
}
```

Die Bridge führt zwei Maps `syncZuToast` und `toastZuSync`. Ihr Effect erzeugt nur für unbekannte `SyncFehler.id` einen Toast; ein zweiter Effect erkennt manuell entfernte Toasts und ruft `syncStatus.verwerfen(syncId)` auf. Entfernt eine andere Stelle den Sync-Fehler, schließt die Bridge den zugehörigen Toast.

- [ ] **Step 5: Container auf Titel/Beschreibung, Maximalhöhe und neue Stapelrichtung umstellen**

```html
<section
  class="pointer-events-none fixed right-3 bottom-20 z-[100] flex max-h-[70vh] w-[calc(100vw-1.5rem)] max-w-md flex-col gap-2 overflow-y-auto md:right-6 md:bottom-6"
>
  @for (toast of toastService.toasts(); track toast.id) {
  <article [attr.role]="toast.type === 'error' ? 'alert' : 'status'">
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold">{{ toast.title }}</p>
      @if (toast.description) {
      <p class="mt-1 text-xs leading-5 text-current/80">{{ toast.description }}</p>
      }
    </div>
  </article>
  }
</section>
```

- [ ] **Step 6: Alten Banner aus der Shell und seine Dateien entfernen; Bridge einmalig injizieren**

```ts
private readonly toastSyncBridge = inject(ToastSyncBridgeService);
```

`SyncErrorBannerComponent` aus `imports` und `<app-sync-error-banner>` aus dem Template entfernen. Die Bridge-Injektion bleibt absichtlich als privates Feld bestehen, damit ihre Effects für die Lebensdauer der Shell aktiv sind.

- [ ] **Step 7: Fokussierte Tests und Build grün ausführen**

Run: `npm test -- src/app/shared/components/toast/toast.service.spec.ts src/app/shared/components/toast/toast-sync-bridge.service.spec.ts`

Run: `npm run build`

Expected: beide Befehle mit Exitcode 0; keine doppelte Banner-Darstellung.

- [ ] **Step 8: Commit**

```bash
git add src/app/shared/components/toast src/app/shared/components/sync-error-banner src/app/layout/shell
git commit -m "feat: angepinnte Fehler-Toasts zentralisieren"
```

### Task 2: Einstellungen, Profil, Workspaces und Integrationen

**Files:**

- Modify: `src/app/features/settings/settings.component.ts`
- Modify: `src/app/features/settings/settings.component.html`
- Create: `src/app/features/settings/settings-toast-actions.spec.ts`
- Modify: `src/app/shared/components/workspace-modal/workspace-modal.component.ts`
- Create: `src/app/shared/components/workspace-modal/workspace-modal-actions.spec.ts`

**Interfaces:**

- Consumes: `ToastService` aus Task 1 und bestehende Service-Ergebnisse.
- Produces: Toasts für Profil, Workspace-Einstellungen, Workspace-Erstellung/-Löschung, Zahlungs-, Carrier-, eBay- und Webhook-Konfiguration, Push-Berechtigung/-Test, Einladungen, Rollen und Mitgliedschaft.

- [ ] **Step 1: Tests für Profil- und Einstellungsfeedback schreiben**

```ts
it('bestätigt gespeicherte Workspace-Einstellungen und entfernt das alte Erfolgsbanner', async () => {
  workspaceService.updateWorkspaceSettings.mockResolvedValue({ error: null });
  await component.onSaveSettings();
  expect(toast.toasts()[0].title).toBe('Einstellungen wurden gespeichert.');
  expect(component.saveSuccess()).toBe(false);
});

it('behält den Workspace-Dialog bei einem Fehler geöffnet', async () => {
  workspaceService.createWorkspace.mockResolvedValue({ data: null, error: new Error('Fehler') });
  await component.onCreateWorkspace();
  expect(component.isCreatingWorkspace()).toBe(true);
});
```

- [ ] **Step 2: Tests rot ausführen**

Run: `npm test -- src/app/features/settings/settings-toast-actions.spec.ts src/app/shared/components/workspace-modal/workspace-modal-actions.spec.ts`

Expected: FAIL, weil Einstellungen noch lokale Statussignale verwenden und der Workspace-Dialog keinen Toast erzeugt.

- [ ] **Step 3: Exakte Meldungsmatrix in `SettingsComponent` umsetzen**

```text
onSaveProfil              -> Profil wurde gespeichert.
onSaveSettings            -> Einstellungen wurden gespeichert.
onCreateWorkspace         -> Workspace wurde erstellt.
onDeleteWorkspace         -> Workspace wurde gelöscht.
onSavePaymentConfig       -> Zahlungsmethoden wurden gespeichert.
onSaveCarrierConfig       -> Versanddienstleister wurden gespeichert.
onSaveEbayConfig          -> eBay-Verbindung wurde gespeichert.
onSaveWebhookConfig       -> Webhook-Konfiguration wurde gespeichert.
onTogglePushSetting       -> Benachrichtigungseinstellung wurde gespeichert.
onRequestPushPermission   -> Browser-Benachrichtigungen wurden aktiviert. / konnten nicht aktiviert werden.
onTestWebPush             -> Test-Benachrichtigung wurde versendet. / konnte nicht versendet werden.
testWebhook               -> Test-Webhook wurde versendet. / konnte nicht versendet werden.
onSendInvite              -> Einladung wurde versendet.
onUpdateRole              -> Rolle wurde geändert.
onRemoveMember            -> Mitglied wurde entfernt.
onCancelInvite            -> Einladung wurde zurückgezogen.
exportPurchasesCsv        -> Einkäufe wurden exportiert.
exportInventoryCsv        -> Inventar wurde exportiert.
exportSalesCsv            -> Verkäufe wurden exportiert.
```

Für `{ error }`-Ergebnisse: bei Fehler früh zurückkehren; Sync-Fehler nicht doppelt melden. Für `boolean`-Ergebnisse: selbst einen angepinnten Fehler-Toast mit dem konkreten Titel und der vorhandenen Statusmeldung erzeugen. `saveSuccess`, allgemeine Erfolgsblöcke und ihre Timer aus TS und HTML entfernen.

- [ ] **Step 4: Workspace-Modal anbinden**

```ts
const { error } = await this.workspaceService.createWorkspace(name);
this.isSubmitting.set(false);
if (error) return;
this.toast.success('Workspace wurde erstellt.');
this.created.emit();
```

- [ ] **Step 5: Tests grün ausführen**

Run: `npm test -- src/app/features/settings/settings-toast-actions.spec.ts src/app/shared/components/workspace-modal/workspace-modal-actions.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/settings src/app/shared/components/workspace-modal
git commit -m "feat: Einstellungen mit Aktionsmeldungen bestätigen"
```

### Task 3: Quellen, Lieferanten und Einkäufe

**Files:**

- Modify: `src/app/features/sources/sources.component.ts`
- Create: `src/app/features/sources/sources-toast-actions.spec.ts`
- Modify: `src/app/features/purchases/purchases.component.ts`
- Modify: `src/app/features/purchases/purchases.component.html`
- Modify: `src/app/features/purchases/components/purchase-create-modal/purchase-create-modal.component.ts`
- Create: `src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts`
- Modify: `src/app/core/services/purchase.service.ts`
- Create: `src/app/core/services/purchase-persistence.spec.ts`

**Interfaces:**

- Consumes: `ToastService`, `SourcesService`, `SuppliersService`, `PurchaseService`, `OfflineSyncService`.
- Produces: Meldungen für Stammdaten-CRUD, Einkauf-CRUD, Kostenverteilung, Tracking und Offline-Aktionen.

- [ ] **Step 1: Tests für Quellen/Lieferanten und Einkaufsdialog schreiben**

```ts
it('meldet das Archivieren einer Quelle erst nach Erfolg', async () => {
  sourcesService.setSourceArchiviert.mockResolvedValue({ error: null });
  await component.archiviereQuelle('source-1', true);
  expect(toast.toasts()[0].title).toBe('Quelle wurde archiviert.');
});

it('schließt den Einkaufsdialog bei einem Speicherfehler nicht', async () => {
  purchaseService.createPurchase.mockResolvedValue({ data: null, error: new Error('Fehler') });
  await component.onSubmit();
  expect(closed.emit).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Tests rot ausführen**

Run: `npm test -- src/app/features/sources/sources-toast-actions.spec.ts src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts`

Expected: FAIL wegen fehlender Toasts für die neu erfassten Aktionen.

- [ ] **Step 3: Quellen- und Lieferantenmeldungen umsetzen**

```text
onAddSource                    -> Quelle wurde angelegt.
speichereQuelle                -> Quelle wurde gespeichert.
archiviereQuelle(true/false)   -> Quelle wurde archiviert. / Quelle wurde wiederhergestellt.
onDeleteSource                 -> Quelle wurde gelöscht.
onAddSupplier                  -> Lieferant wurde angelegt.
speichereLieferant             -> Lieferant wurde gespeichert.
archiviereLieferant(true/false)-> Lieferant wurde archiviert. / Lieferant wurde wiederhergestellt.
onDeleteSupplier               -> Lieferant wurde gelöscht.
```

Alle Create-Aufrufe müssen das vorhandene `{ data, error }`-Ergebnis prüfen. Formulare und Bearbeitungsmodus werden ausschließlich bei `error === null` zurückgesetzt.

- [ ] **Step 4: Einkaufsdialog und Einkaufsliste umsetzen**

```text
PurchaseCreateModal.onSubmit/create  -> Einkauf wurde angelegt.
PurchaseCreateModal.onSubmit/update  -> Einkauf wurde gespeichert.
saveNewSource                        -> Quelle wurde angelegt.
saveNewSupplier                      -> Lieferant wurde angelegt.
Purchases.onSubmitRapidPurchase      -> Einkauf wurde lokal vorgemerkt.
Purchases.onSaveWalletConfig         -> Wallet-Konfiguration wurde gespeichert.
Purchases.onSyncNow                  -> Offline-Daten wurden synchronisiert.
Purchases.onDeletePending            -> Vorgemerkter Einkauf wurde entfernt.
```

Das bisherige lokale Erfolgssignal des Schnellerfassungsformulars entfernen. Bei synchronen Offline-Aktionen unmittelbar nach dem Service-Aufruf den Erfolg melden.

- [ ] **Step 5: Einkaufsdetail vervollständigen**

```ts
const { error } = await this.purchaseService.updatePurchaseTracking(/* bestehende Werte */);
if (error) return;
this.isEditingTracking.set(false);
this.toast.success('Sendungsverfolgung wurde gespeichert.');
```

```text
applyAllocations       -> Kosten wurden verteilt.
setAllocationMode      -> Verteilmethode wurde geändert.
saveTracking           -> Sendungsverfolgung wurde gespeichert.
markDeliveredAndSync   -> Einkauf wurde als zugestellt markiert.
```

Vorhandene Meldungen für Artikel, Nebenkosten und Einkaufslöschung auf die neue `title`/`description`-Signatur aus Task 1 umstellen.

- [ ] **Step 6: Tests grün ausführen**

Run: `npm test -- src/app/features/sources/sources-toast-actions.spec.ts src/app/features/purchases/components/purchase-create-modal/purchase-create-modal-actions.spec.ts src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/sources src/app/features/purchases
git commit -m "feat: Stammdaten und Einkäufe mit Toasts ergänzen"
```

### Task 4: Inventar und Medien

**Files:**

- Modify: `src/app/features/inventory/inventory.component.ts`
- Create: `src/app/features/inventory/inventory-toast-actions.spec.ts`
- Modify: `src/app/features/inventory/components/item-create-modal/item-create-modal.component.ts`
- Modify: `src/app/features/inventory/components/item-create-modal/item-create-modal-actions.spec.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail.component.ts`
- Modify: `src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts`
- Modify: `src/app/core/services/inventory.service.ts`
- Create: `src/app/core/services/inventory-persistence.spec.ts`

**Interfaces:**

- Consumes: neues Toast-Modell und Ergebnisse von `InventoryService` und `MediaService`.
- Produces: Meldungen für Status, Shop-Freigabe, Medien und alle bereits angebundenen Artikelaktionen.

- [ ] **Step 1: Fehlende Verhaltenstests schreiben**

```ts
it('meldet eine Shop-Freigabe und rollt den Schalter bei Fehler zurück', async () => {
  inventoryService.updateItem.mockResolvedValue({ error: new Error('Fehler') });
  await component.onTogglePublicStore(item, checkboxEvent(true));
  expect(item.is_public_store).toBe(false);
});

it('meldet einen erfolgreichen Medien-Upload', async () => {
  mediaService.uploadItemMedia.mockResolvedValue({ data: medium, error: null });
  await component.onFilesSelected(fileEvent([datei]));
  expect(toast.toasts()[0].title).toBe('Bild wurde hochgeladen.');
});
```

- [ ] **Step 2: Tests rot ausführen**

Run: `npm test -- src/app/features/inventory/inventory-toast-actions.spec.ts src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts src/app/features/inventory/components/item-create-modal/item-create-modal-actions.spec.ts`

Expected: FAIL bei Shop-Freigabe und Medienaktionen.

- [ ] **Step 3: Inventarliste und Artikeldetail vervollständigen**

```text
Inventory.onChangeItemStatus       -> Artikelstatus wurde geändert.
Inventory.onTogglePublicStore      -> Artikel wurde im Shop veröffentlicht. / aus dem Shop entfernt.
ItemDetail.onFilesSelected         -> Bild wurde hochgeladen. / Bilder wurden hochgeladen.
ItemDetail.onSetPrimary            -> Hauptbild wurde geändert.
ItemDetail.onDeleteMedia           -> Bild wurde gelöscht.
ItemDetail.onTogglePublicStore     -> Artikel wurde im Shop veröffentlicht. / aus dem Shop entfernt.
```

Bei jeder Methode das Service-Ergebnis prüfen. Liefert ein älterer Media-Service noch kein `{ error }`-Ergebnis, dessen Signatur in derselben Änderung auf `{ data?, error }` vereinheitlichen, statt Erfolg nach einem ungeprüften Aufruf zu melden.

- [ ] **Step 4: Bereits vorhandene Artikeltoasts migrieren**

```ts
this.toast.success('Artikel wurde angelegt.');
this.toast.error('Artikel konnte nicht gespeichert werden.', fachlicheUrsache);
```

Alle bisherigen Zugriffe auf `toast.message` in Tests auf `toast.title` umstellen. Bildfehler bleiben Warnungen mit Titel „Artikel wurde angelegt.“ und Beschreibung „Das Bild konnte nicht hochgeladen werden.“

- [ ] **Step 5: Tests grün ausführen**

Run: `npm test -- src/app/features/inventory/inventory-toast-actions.spec.ts src/app/features/inventory/pages/item-detail/item-detail-actions.spec.ts src/app/features/inventory/components/item-create-modal/item-create-modal-actions.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/inventory src/app/core/services/media.service.ts
git commit -m "feat: Inventaraktionen einheitlich bestätigen"
```

### Task 5: Verkäufe, Retouren und Rechnungen

**Files:**

- Modify: `src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts`
- Create: `src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts`
- Modify: `src/app/features/sales/sales.component.ts`
- Create: `src/app/features/sales/sales-toast-actions.spec.ts`
- Modify: `src/app/shared/components/invoice-modal/invoice-modal.component.ts`
- Create: `src/app/shared/components/invoice-modal/invoice-modal-actions.spec.ts`

**Interfaces:**

- Consumes: Ergebnisse von `SalesService`, `ReturnService`, `InvoiceService`.
- Produces: Meldungen für Verkaufsabschluss/-bearbeitung/-löschung, Retouren und E-Mail-Versand.

- [ ] **Step 1: Tests für Erfolg und stehenbleibenden Fehlerdialog schreiben**

```ts
it('bestätigt einen abgeschlossenen Verkauf', async () => {
  salesService.createSale.mockResolvedValue({ data: sale, error: null });
  await component.onSubmit();
  expect(toast.toasts()[0].title).toBe('Verkauf wurde abgeschlossen.');
});

it('navigiert nach fehlgeschlagenem Löschen nicht weiter und meldet keinen Erfolg', async () => {
  salesService.deleteSale.mockResolvedValue({ error: new Error('Fehler') });
  await component.onDeleteSale(sale);
  expect(toast.toasts().some((t) => t.type === 'success')).toBe(false);
});
```

- [ ] **Step 2: Tests rot ausführen**

Run: `npm test -- src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts src/app/features/sales/sales-toast-actions.spec.ts src/app/shared/components/invoice-modal/invoice-modal-actions.spec.ts`

Expected: FAIL wegen fehlender Toast-Aufrufe und teilweise ungeprüfter Service-Ergebnisse.

- [ ] **Step 3: Meldungsmatrix umsetzen**

```text
SaleCreateModal create  -> Verkauf wurde abgeschlossen.
SaleCreateModal update  -> Verkauf wurde gespeichert.
Sales.onSubmitReturn    -> Retoure wurde erfasst.
Sales.onDeleteSale      -> Verkauf wurde gelöscht.
InvoiceModal.sendEmail  -> Bestätigung wurde per E-Mail versendet.
```

Return- und Delete-Service-Ergebnisse vereinheitlichen, falls sie noch keine Fehler zurückgeben. Modal-Events und Formular-Reset nur nach Erfolg ausführen. Bestehende `errorMessage` am Verkaufsformular als feldnahen/kontextuellen Hinweis behalten.

- [ ] **Step 4: Tests grün ausführen**

Run: `npm test -- src/app/features/sales/components/sale-create-modal/sale-create-modal-actions.spec.ts src/app/features/sales/sales-toast-actions.spec.ts src/app/shared/components/invoice-modal/invoice-modal-actions.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/sales src/app/shared/components/invoice-modal src/app/core/services/return.service.ts src/app/core/services/sales.service.ts
git commit -m "feat: Verkäufe und Retouren mit Toasts ergänzen"
```

### Task 6: Listings, Fulfillment, Recherche und Bildexport

**Files:**

- Modify: `src/app/features/listings/listings.component.ts`
- Modify: `src/app/features/listings/listings.component.html`
- Create: `src/app/features/listings/listings-toast-actions.spec.ts`
- Modify: `src/app/features/fulfillment/fulfillment.component.ts`
- Create: `src/app/features/fulfillment/fulfillment-toast-actions.spec.ts`
- Modify: `src/app/features/research/research.component.ts`
- Create: `src/app/features/research/research-toast-actions.spec.ts`
- Modify: `src/app/features/image-optimizer/image-optimizer.component.ts`
- Create: `src/app/features/image-optimizer/image-optimizer-toast-actions.spec.ts`

**Interfaces:**

- Consumes: `ListingStudioService`, `FulfillmentService`, `PriceTrackerService`, vorhandene Exportdienste.
- Produces: Meldungen für Veröffentlichung, Bündelung, Versanddaten, Preisübernahme und abgeschlossenen Export.

- [ ] **Step 1: Failing Tests für jeden Featurebereich schreiben**

```ts
it('ersetzt das lokale Veröffentlichungsbanner durch einen Toast', async () => {
  listingStudio.publishToCustomStore.mockResolvedValue({ error: null });
  await component.publishToStore();
  expect(toast.toasts()[0].title).toBe('Artikel wurde im Shop veröffentlicht.');
  expect(component.publishSuccessMsg()).toBeNull();
});

it('bestätigt die Übernahme eines Radarpreises nur bei true', async () => {
  priceTracker.applyRecommendedPrice.mockResolvedValue(true);
  await component.onApplyRadarPrice('item-1');
  expect(toast.toasts()[0].title).toBe('Preisempfehlung wurde übernommen.');
});
```

- [ ] **Step 2: Tests rot ausführen**

Run: `npm test -- src/app/features/listings/listings-toast-actions.spec.ts src/app/features/fulfillment/fulfillment-toast-actions.spec.ts src/app/features/research/research-toast-actions.spec.ts src/app/features/image-optimizer/image-optimizer-toast-actions.spec.ts`

Expected: FAIL wegen lokaler Statusbanner beziehungsweise fehlender Toasts.

- [ ] **Step 3: Exakte Meldungen umsetzen**

```text
Listings.markAsListed          -> Artikel wurde als gelistet markiert.
Listings.publishToStore        -> Artikel wurde im Shop veröffentlicht.
Fulfillment.onBundleCandidate  -> Sendungen wurden gebündelt.
Fulfillment.onUnbundleOrder    -> Sammelpaket wurde aufgelöst.
Fulfillment.onConfirmPurchaseLabel -> Sendungsnummer wurde gespeichert.
Fulfillment.onSaveTracking     -> Sendungsverfolgung wurde gespeichert.
Research.onApplyRadarPrice     -> Preisempfehlung wurde übernommen.
ImageOptimizer.exportiere      -> Bilder wurden exportiert.
```

`publishSuccessMsg` und das zugehörige Template-Banner entfernen. Kein Toast für Marktrecherche, Live-Scan, Bilddrehung oder Zuschnittvorschau, weil diese laut Spezifikation keine abgeschlossene persistente Änderung sind. Exportfehler als angepinnten Fehler mit Titel „Bilder konnten nicht exportiert werden.“ und vorhandener Ausnahmebeschreibung anzeigen.

- [ ] **Step 4: Tests grün ausführen**

Run: `npm test -- src/app/features/listings/listings-toast-actions.spec.ts src/app/features/fulfillment/fulfillment-toast-actions.spec.ts src/app/features/research/research-toast-actions.spec.ts src/app/features/image-optimizer/image-optimizer-toast-actions.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/listings src/app/features/fulfillment src/app/features/research src/app/features/image-optimizer
git commit -m "feat: Veröffentlichungs- und Exportaktionen bestätigen"
```

### Task 7: Buchhaltung, Rechnungsversand und Shop-Bestellung

**Files:**

- Modify: `src/app/features/accounting/accounting.component.ts`
- Modify: `src/app/features/accounting/accounting.component.html`
- Create: `src/app/features/accounting/accounting-toast-actions.spec.ts`
- Modify: `src/app/features/store/pages/store-checkout/store-checkout.component.ts`
- Create: `src/app/features/store/pages/store-checkout/store-checkout-actions.spec.ts`

**Interfaces:**

- Consumes: Ergebnisse von `BankReconciliationService`, `TaxAdvisorService`, `StoreService`.
- Produces: Meldungen für Import, Buchung, Zurücksetzen, Berichtsversand und Bestellung.

- [ ] **Step 1: Tests für Buchungsfeedback und Bestellung schreiben**

```ts
it('zeigt ein erfolgreiches Buchen als Toast statt als Seitenbanner', async () => {
  bankService.bookTransaction.mockResolvedValue({ success: true, message: 'Gebucht.' });
  await component.onBookTransaction('tx-1');
  expect(toast.toasts()[0]).toMatchObject({ type: 'success', title: 'Transaktion wurde gebucht.' });
  expect(component.bookingFeedback()).toBeNull();
});

it('meldet eine fehlgeschlagene Bestellung angepinnt und bleibt im Checkout', async () => {
  storeService.placeOrder.mockRejectedValue(new Error('Artikel nicht mehr verfügbar'));
  await component.onSubmitOrder();
  expect(router.navigate).not.toHaveBeenCalled();
  expect(toast.toasts()[0]).toMatchObject({ type: 'error', persistent: true });
});
```

- [ ] **Step 2: Tests rot ausführen**

Run: `npm test -- src/app/features/accounting/accounting-toast-actions.spec.ts src/app/features/store/pages/store-checkout/store-checkout-actions.spec.ts`

Expected: FAIL, weil Buchhaltung noch `bookingFeedback` verwendet und Checkout nur lokale Fehler behandelt.

- [ ] **Step 3: Buchhaltungsmeldungen umsetzen**

```text
processBankFile             -> Kontoauszug wurde importiert.
onLoadDemoStatement         -> Demo-Kontoauszug wurde geladen.
onBookTransaction           -> Transaktion wurde gebucht.
onBookAllExactMatches       -> Passende Transaktionen wurden gebucht.
onIgnoreTransaction         -> Transaktion wurde ignoriert.
onResetBankStatement        -> Kontoauszug wurde zurückgesetzt.
onDownloadDatev             -> DATEV-Buchungsstapel wurde exportiert.
onDownloadDiffTaxJournal    -> §-25a-Journal wurde exportiert.
onDownloadEur               -> EÜR-Bericht wurde exportiert.
onSendEmailToAdvisor        -> Bericht wurde an die Steuerberatung versendet.
```

Bei `success: false` die vorhandene `message` als Beschreibung eines angepinnten Fehler-Toasts verwenden. `bookingFeedback`, seine Timer und das allgemeine Feedback-Banner aus dem Template entfernen.

- [ ] **Step 4: Checkout abschließen**

Bei erfolgreicher `placeOrder` vor der Navigation `toast.success('Bestellung wurde aufgegeben.')` setzen. Bei Ausnahme `toast.error('Bestellung konnte nicht aufgegeben werden.', error.message)` setzen, Formularwerte behalten und nicht navigieren. Die Bestell-Erfolgsseite bleibt als ausführliche Ergebnisansicht bestehen.

- [ ] **Step 5: Tests grün ausführen**

Run: `npm test -- src/app/features/accounting/accounting-toast-actions.spec.ts src/app/features/store/pages/store-checkout/store-checkout-actions.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/accounting src/app/features/store/pages/store-checkout
git commit -m "feat: Buchungen und Bestellungen mit Toasts bestätigen"
```

### Task 8: Vollständigkeits-Audit und Gesamtprüfung

**Files:**

- Create: `src/app/systemweite-aktionsmeldungen.spec.ts`
- Modify: ausschließlich in Tasks 1–7 bereits genannte Dateien, falls der Audit eine konkrete Lücke zeigt.

**Interfaces:**

- Consumes: alle Toast-Anbindungen aus Tasks 1–7.
- Produces: maschinenlesbare Abdeckungsliste aller absichtlich einbezogenen und ausgeschlossenen Aktionen.

- [ ] **Step 1: Audit-Test mit expliziter Aktionsmatrix schreiben**

```ts
const erwarteteAktionen = [
  ['settings', 'onSaveProfil'],
  ['settings', 'onSaveSettings'],
  ['sources', 'onAddSource'],
  ['sources', 'onAddSupplier'],
  ['purchases', 'onSubmit'],
  ['inventory', 'onChangeItemStatus'],
  ['sales', 'onSubmit'],
  ['fulfillment', 'onBundleCandidate'],
  ['listings', 'publishToStore'],
  ['accounting', 'onBookTransaction'],
] as const;

it.each(erwarteteAktionen)('%s/%s besitzt einen geprüften Rückmeldungspfad', (feature, action) => {
  expect(aktionsabdeckung[feature]).toContain(action);
});
```

Die vollständige Matrix enthält jede in Tasks 2–7 benannte Methode. Bewusst ausgeschlossen werden Login/Logout, Navigation, Suche, automatisches Laden, Barcode-/KI-Analyse, Kopieren, Bilddrehung und reine Vorschauen; diese Ausschlüsse stehen als eigene Liste im Test, damit spätere Änderungen bewusst erfolgen.

- [ ] **Step 2: Audit-Test rot ausführen und jede konkrete Lücke schließen**

Run: `npm test -- src/app/systemweite-aktionsmeldungen.spec.ts`

Expected: zunächst FAIL für jede noch nicht in der Matrix registrierte Aktionsanbindung; nach Ergänzung PASS.

- [ ] **Step 3: Veraltete Rückmeldungen suchen**

Run: `rg -n "saveSuccess|publishSuccessMsg|bookingFeedback|alert\\(" src/app`

Expected: keine allgemeinen Erfolgsbanner oder Browser-Alerts für die migrierten Aktionen. Feldnahe `errorMessage`-Signale dürfen weiterhin vorhanden sein.

- [ ] **Step 4: Formatierung prüfen**

Run: `npm run format:check`

Expected: Exitcode 0. Falls ausschließlich geänderte Dateien gemeldet werden, diese mit Prettier formatieren und den Check wiederholen.

- [ ] **Step 5: Gesamte Test-Suite ausführen**

Run: `npm test`

Expected: alle Testdateien und Tests bestehen, keine fehlgeschlagenen Tests.

- [ ] **Step 6: Lint und Typen prüfen**

Run: `npm run lint`

Expected: Exitcode 0 und keine neuen Warnungen in geänderten Dateien.

Run: `npm run typecheck`

Expected: Exitcode 0.

- [ ] **Step 7: Produktionsbuild ausführen**

Run: `npm run build`

Expected: Exitcode 0; vorhandene CommonJS-Hinweise zu `jszip` und `jsbarcode` sind akzeptiert, neue Warnungen nicht.

- [ ] **Step 8: Abschluss-Commit**

```bash
git add src/app/systemweite-aktionsmeldungen.spec.ts docs/superpowers/plans/2026-08-24-systemweite-aktionsmeldungen.md docs/superpowers/plans/2026-08-24-speicherfeedback-und-toast.md docs/superpowers/specs/2026-08-24-speicherfeedback-und-toast-design.md
git commit -m "test: systemweite Aktionsmeldungen vollständig prüfen"
```

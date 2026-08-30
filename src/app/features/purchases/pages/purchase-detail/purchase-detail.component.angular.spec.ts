import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { provideTranslateService } from '@ngx-translate/core';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { provideRouter } from '@angular/router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase, PurchaseLine } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { InboundTrackingService } from '../../../../core/services/inbound-tracking.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { MediaService } from '../../../../core/services/media.service';
import { MockDataStoreService } from '../../../../core/services/mock-data-store.service';
import { ProfitEngineService } from '../../../../core/services/profit-engine.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { StockService } from '../../../../core/services/stock.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { PurchaseDetailComponent } from './purchase-detail.component';

describe('PurchaseDetailComponent', () => {
  describe('Aktionsmeldungen', () => {
    const einkauf: Purchase = {
      id: '33333333-3333-4333-8333-333333333333',
      workspace_id: '11111111-1111-4111-8111-111111111111',
      type: 'mystery_pack',
      title: 'Mystery Box',
      purchase_date: '2026-08-24',
      purchase_price: 31.98,
      shipping_cost: 0,
      source_id: null,
      supplier_id: null,
      cost_allocation_mode: 'even',
      created_at: '2026-08-24T10:00:00.000Z',
    };

    const mengenposition: PurchaseLine = {
      id: 'line-1',
      workspace_id: einkauf.workspace_id,
      purchase_id: einkauf.id,
      catalog_product_id: 'product-1',
      title_snapshot: 'LED-Lampe',
      line_kind: 'quantity',
      ordered_quantity: 5,
      received_quantity: 0,
      unit_purchase_price: 4.99,
      line_total: 24.95,
    };

    const einzelposition: PurchaseLine = {
      id: 'line-individual-1',
      workspace_id: einkauf.workspace_id,
      purchase_id: einkauf.id,
      catalog_product_id: null,
      title_snapshot: 'Mystery-Fundstück',
      line_kind: 'individual',
      ordered_quantity: 1,
      received_quantity: 0,
      unit_purchase_price: 12.5,
      line_total: 12.5,
    };

    function erstelleKomponente(
      ergebnis: { data: null; error: Error | null } = {
        data: null,
        error: null,
      },
    ) {
      const toast = new ToastService();
      const addItemToPurchase = vi.fn(async () => ergebnis);
      const receivePurchaseLines = vi.fn(async () => ({
        data: { purchaseLines: [mengenposition], stockLots: [] },
        error: null as Error | null,
        reportedBySyncStatus: false,
      }));
      const receiveIndividualPurchaseLine = vi.fn(async () => ({
        data: { purchaseLine: einzelposition, inventoryItem: null },
        error: null as Error | null,
        reportedBySyncStatus: false,
      }));
      const purchaseService = {
        selectedPurchase: signal<Purchase | null>(einkauf),
        purchaseLines: signal<PurchaseLine[]>([mengenposition]),
        purchaseItems: signal([]),
        addItemToPurchase,
        receivePurchaseLines,
        receiveIndividualPurchaseLine,
        markIndividualPurchaseLineReceived: vi.fn(async () => ({
          data: einzelposition,
          error: null as Error | null,
          reportedBySyncStatus: false,
        })),
        getPurchaseById: vi.fn(async () => einkauf),
        redistributeCosts: vi.fn(async () => ({ error: null as Error | null })),
        updateCostAllocationMode: vi.fn(async () => ({ error: null as Error | null })),
        updatePurchaseTracking: vi.fn(async () => ({
          data: einkauf as Purchase | null,
          error: null as Error | null,
        })),
        markPurchaseDeliveredAndSyncItems: vi.fn(async () => ({
          updatedCount: 1,
          error: null as Error | null,
        })),
      };
      const komponente = Object.create(
        PurchaseDetailComponent.prototype,
      ) as PurchaseDetailComponent;

      Object.assign(komponente, {
        purchaseService,
        itemForm: new FormGroup({
          title: new FormControl('Neuer Artikel', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(2)],
          }),
          condition: new FormControl<'used'>('used', { nonNullable: true }),
          expected_value: new FormControl<number | null>(20),
        }),
        selectedImageFile: signal<File | null>(null),
        selectedImageDataUrl: signal<string | null>(null),
        isAddingItem: signal(true),
        isSavingPurchaseLines: signal(false),
        isReceivingLines: signal(true),
        receivingQuantities: signal<Record<string, number>>({ 'line-1': 5 }),
        purchaseLineDrafts: signal([]),
        isAllocatorOpen: signal(true),
        isApplyingAllocation: signal(false),
        allocatorMode: signal<'even' | 'value_weighted'>('even'),
        editableExpectedValues: signal<Record<string, number>>({ 'item-1': 20 }),
        isEditingTracking: signal(true),
        trackingNumberDraft: signal('00340434161094000001'),
        trackingCarrierDraft: signal<'dhl' | null>('dhl'),
        isMarkingDelivered: signal(false),
        mediaService: { uploadItemMedia: vi.fn() },
        logger: { warn: vi.fn() },
        toast,
        syncStatus: new SyncStatusService(),
        stockService: { loadPositions: vi.fn(async () => undefined) },
      });

      return {
        komponente,
        toast,
        addItemToPurchase,
        receivePurchaseLines,
        receiveIndividualPurchaseLine,
        purchaseService,
      };
    }

    describe('PurchaseDetailComponent – Rückmeldung beim Artikelanlegen', () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      it('behält Formular und Eingaben bei einem Speicherfehler geöffnet', async () => {
        const { komponente, toast } = erstelleKomponente({
          data: null,
          error: new Error('Speichern fehlgeschlagen'),
        });

        await komponente.onAddItem();

        expect(komponente.isAddingItem()).toBe(true);
        expect(komponente.itemForm.controls.title.value).toBe('Neuer Artikel');
        expect(toast.toasts()[0]).toMatchObject({
          type: 'error',
          title: 'Artikel konnte nicht gespeichert werden.',
          description: 'Speichern fehlgeschlagen',
          persistent: true,
        });
      });

      it('schließt das Formular erst nach erfolgreichem Anlegen und bestätigt die Aktion', async () => {
        const { komponente, toast } = erstelleKomponente({ data: null, error: null });

        await komponente.onAddItem();

        expect(komponente.isAddingItem()).toBe(false);
        expect(komponente.itemForm.controls.title.value).toBe('');
        expect(toast.toasts()[0]).toMatchObject({
          type: 'success',
          title: 'Artikel wurde angelegt.',
        });
      });

      it('schließt die Kostenverteilung erst nach Erfolg und bestätigt beide Verteilaktionen', async () => {
        const verteilen = erstelleKomponente();
        await verteilen.komponente.applyAllocations();
        expect(verteilen.komponente.isAllocatorOpen()).toBe(false);
        expect(verteilen.toast.toasts()[0].title).toBe('Kosten wurden verteilt.');

        const modus = erstelleKomponente();
        await modus.komponente.setAllocationMode('value_weighted');
        expect(modus.toast.toasts()[0].title).toBe('Verteilmethode wurde geändert.');
      });

      it('behält die Kostenverteilung bei einem zentral gemeldeten Fehler geöffnet', async () => {
        const { komponente, toast, purchaseService } = erstelleKomponente();
        const syncStatus = new SyncStatusService();
        const error = syncStatus.melde('Kostenverteilung', new Error('Keine Berechtigung.'));
        purchaseService.redistributeCosts.mockResolvedValue({ error });
        Object.assign(komponente, { syncStatus });

        await komponente.applyAllocations();

        expect(komponente.isApplyingAllocation()).toBe(false);
        expect(komponente.isAllocatorOpen()).toBe(true);
        expect(toast.toasts()).toEqual([]);
      });

      it('meldet einen neuen lokalen Fehler trotz gleichlautendem älteren Sync-Fehler', async () => {
        const { komponente, toast, purchaseService } = erstelleKomponente();
        const syncStatus = new SyncStatusService();
        const alterFehler = syncStatus.melde('Kostenverteilung', new Error('Keine Berechtigung.'));
        purchaseService.redistributeCosts.mockResolvedValue({
          error: new Error(alterFehler.message),
        });
        Object.assign(komponente, { syncStatus });

        await komponente.applyAllocations();

        expect(toast.toasts()[0]).toMatchObject({
          type: 'error',
          title: 'Kosten konnten nicht verteilt werden.',
        });
      });

      it('schließt die Tracking-Bearbeitung erst nach Erfolg', async () => {
        const erfolg = erstelleKomponente();
        await erfolg.komponente.saveTracking();
        expect(erfolg.komponente.isEditingTracking()).toBe(false);
        expect(erfolg.toast.toasts()[0].title).toBe('Sendungsverfolgung wurde gespeichert.');

        const fehler = erstelleKomponente();
        fehler.purchaseService.updatePurchaseTracking.mockResolvedValue({
          data: null,
          error: new Error('Einkauf nicht gefunden'),
        });
        await fehler.komponente.saveTracking();
        expect(fehler.komponente.isEditingTracking()).toBe(true);
        expect(fehler.toast.toasts()[0]).toMatchObject({
          type: 'error',
          title: 'Sendungsverfolgung konnte nicht gespeichert werden.',
          persistent: true,
        });
      });

      it('behält die Tracking-Bearbeitung bei einer geworfenen Ausnahme geöffnet', async () => {
        const { komponente, toast, purchaseService } = erstelleKomponente();
        purchaseService.updatePurchaseTracking.mockRejectedValue(
          new Error('Dienst nicht erreichbar'),
        );

        await komponente.saveTracking();

        expect(komponente.isEditingTracking()).toBe(true);
        expect(toast.toasts()[0]).toMatchObject({
          type: 'error',
          title: 'Sendungsverfolgung konnte nicht gespeichert werden.',
          description: 'Dienst nicht erreichbar',
          persistent: true,
        });
      });

      it('bestätigt das Zustellen nur nach vollständig erfolgreichem Service-Aufruf', async () => {
        const erfolg = erstelleKomponente();
        await erfolg.komponente.markDeliveredAndSync();
        expect(erfolg.komponente.isMarkingDelivered()).toBe(false);
        expect(erfolg.toast.toasts()[0].title).toBe('Einkauf wurde als zugestellt markiert.');

        const fehler = erstelleKomponente();
        fehler.purchaseService.markPurchaseDeliveredAndSyncItems.mockResolvedValue({
          updatedCount: 0,
          error: new Error('Einkauf nicht gefunden'),
        });
        await fehler.komponente.markDeliveredAndSync();
        expect(fehler.toast.toasts()[0]).toMatchObject({
          type: 'error',
          title: 'Einkauf konnte nicht als zugestellt markiert werden.',
          persistent: true,
        });
      });

      it('bucht fünf Mengenartikel als eine Einkaufsposition statt fünf Inventarartikel', async () => {
        const { komponente, purchaseService, receivePurchaseLines, addItemToPurchase } =
          erstelleKomponente();

        await komponente.receivePurchaseLine(mengenposition);

        expect(receivePurchaseLines).toHaveBeenCalledWith(einkauf.id, [
          { purchaseLineId: 'line-1', receivedQuantity: 5 },
        ]);
        expect(addItemToPurchase).not.toHaveBeenCalled();
        expect(purchaseService.getPurchaseById).toHaveBeenCalledWith(einkauf.id);
        expect(komponente.stockService.loadPositions).toHaveBeenCalledWith(einkauf.workspace_id);
      });

      it('bucht einen Einzelartikel atomar ohne nachgelagerte Inventar- oder Positionsmutation', async () => {
        const { komponente, addItemToPurchase, purchaseService, receiveIndividualPurchaseLine } =
          erstelleKomponente();

        await komponente.captureIndividualItem(einzelposition);

        expect(receiveIndividualPurchaseLine).toHaveBeenCalledWith(einkauf.id, einzelposition.id, {
          title: 'Mystery-Fundstück',
          condition: 'used',
          allocatedPurchaseCost: 12.5,
        });
        expect(addItemToPurchase).not.toHaveBeenCalled();
        expect(purchaseService.markIndividualPurchaseLineReceived).not.toHaveBeenCalled();
      });
    });
  });

  describe('Artikelnavigation', () => {
    beforeAll(async () => {
      registerLocaleData(localeDe);
      const resources: Record<string, string> = {
        './purchase-detail.component.html':
          'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
        './image-cropper-modal.component.html':
          'src/app/shared/components/image-cropper-modal/image-cropper-modal.component.html',
        './image-cropper-modal.component.scss':
          'src/app/shared/components/image-cropper-modal/image-cropper-modal.component.scss',
        './custom-select.component.html':
          'src/app/shared/components/custom-select/custom-select.component.html',
        './custom-checkbox.component.html':
          'src/app/shared/components/custom-checkbox/custom-checkbox.component.html',
        './custom-checkbox.component.scss':
          'src/app/shared/components/custom-checkbox/custom-checkbox.component.scss',
        './purchase-line-editor.component.html':
          'src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html',
        './purchase-create-modal.component.html':
          'src/app/features/purchases/components/purchase-create-modal/purchase-create-modal.component.html',
      };
      await ɵresolveComponentResources((url) => {
        const resource = resources[url];
        if (resource) return readFile(resolve(resource), 'utf8');

        return readdir(resolve('src/app'), { recursive: true }).then((files) => {
          const matches = files.filter((file) => file.endsWith(url.slice(2)));
          if (matches.length !== 1) throw new Error(`Unbekannte Test-Ressource: ${url}`);
          return readFile(resolve('src/app', matches[0]), 'utf8');
        });
      });
    });

    const purchase: Purchase = {
      id: 'purchase-1',
      workspace_id: 'workspace-1',
      type: 'single',
      title: 'Test-Einkauf',
      purchase_date: '2026-08-30',
      purchase_price: 10,
      cost_allocation_mode: 'even',
    };

    const item: InventoryItem = {
      id: 'item-1',
      workspace_id: purchase.workspace_id,
      purchase_id: purchase.id,
      title: 'Testartikel',
      condition: 'used',
      status: 'received',
      allocated_purchase_cost: 10,
    };

    describe('PurchaseDetailComponent – Artikelnavigation', () => {
      it('überträgt die Einkaufs-ID an beide Artikeldetail-Links', async () => {
        const purchaseService = {
          selectedPurchase: signal<Purchase | null>(purchase),
          purchaseItems: signal<InventoryItem[]>([item]),
          purchaseLines: signal([]),
          getPurchaseById: async () => purchase,
        };

        await TestBed.configureTestingModule({
          imports: [PurchaseDetailComponent],
          providers: [
            provideRouter([]),
            provideTranslateService(),
            { provide: ConfirmDialogService, useValue: {} },
            { provide: PurchaseService, useValue: purchaseService },
            { provide: StockService, useValue: {} },
            { provide: LoggerService, useValue: {} },
            { provide: MediaService, useValue: {} },
            { provide: InboundTrackingService, useValue: { carrierOptions: [] } },
            { provide: ProfitEngineService, useValue: {} },
            { provide: ToastService, useValue: {} },
            { provide: SyncStatusService, useValue: {} },
            {
              provide: CatalogService,
              useValue: {
                products: signal([]),
                loadError: signal(null),
                isLoading: signal(false),
                loadedWorkspaceId: signal(purchase.workspace_id),
                loadProducts: async () => undefined,
              },
            },
            {
              provide: WorkspaceService,
              useValue: { currentWorkspace: signal({ id: purchase.workspace_id }) },
            },
            { provide: MockDataStoreService, useValue: { isDemoMode: signal(false) } },
          ],
        }).compileComponents();

        const fixture = TestBed.createComponent(PurchaseDetailComponent);
        Object.assign(fixture.componentInstance, { id: signal(purchase.id) });
        fixture.detectChanges();
        await fixture.whenStable();

        const host = fixture.nativeElement as HTMLElement;
        const links = [
          ...host.querySelectorAll<HTMLAnchorElement>(`a[href*="/inventory/${item.id}"]`),
        ];
        expect(links).toHaveLength(2);
        for (const link of links) {
          const url = new URL(link.href);
          expect(url.pathname).toBe(`/inventory/${item.id}`);
          expect(url.searchParams.get('fromPurchaseId')).toBe(purchase.id);
        }
      });
    });
  });
});

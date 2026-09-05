import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase, PurchaseLine } from '../../../../core/models/flipbase.models';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
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
        });
        expect(addItemToPurchase).not.toHaveBeenCalled();
        expect(purchaseService.markIndividualPurchaseLineReceived).not.toHaveBeenCalled();
      });
    });
  });
});

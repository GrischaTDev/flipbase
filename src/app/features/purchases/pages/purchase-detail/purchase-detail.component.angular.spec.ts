import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase, PurchaseLine } from '../../../../core/models/flipbase.models';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { PurchaseDetailComponent } from './purchase-detail.component';

describe('PurchaseDetailComponent', () => {
  it('zeigt Druckaktionen erst nach dem Entwurf und entfernt den Prüfbeleg', () => {
    const template = readFileSync(
      'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
      'utf8',
    );

    expect(template).toContain("@if (p.receiving_status !== 'draft')");
    expect(template).toContain('data-purchase-print-link');
    expect(template).not.toContain('data-purchase-audit-print-link');
    expect(template).not.toContain('Prüfbeleg');
  });

  it('zeigt offene Einkaufspreise als Hinweis zwischen Kopf und Inhalt', () => {
    const template = readFileSync(
      'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
      'utf8',
    );
    const lifecycleEnd = template.indexOf('</app-purchase-lifecycle-actions>');
    const notice = template.indexOf('data-open-purchase-prices');
    const content = template.indexOf('@if (isEditing())');

    expect(notice).toBeGreaterThan(lifecycleEnd);
    expect(notice).toBeLessThan(content);
    expect(template).toContain('Einkaufspreise offen');
  });

  it('verwendet in den Einkaufsartikeln keine persönliche Spaltenauswahl mehr', () => {
    const template = readFileSync(
      'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
      'utf8',
    );

    expect(template).not.toContain('<app-table-column-picker');
    expect(template).not.toContain('[visibleColumns]');
  });

  it('zeigt in der reinen Ansicht keine redundante Artikelbearbeitung und nur offene Wareneingänge', () => {
    const template = readFileSync(
      'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
      'utf8',
    );

    expect(template).not.toContain('>Artikel bearbeiten</app-button');
    expect(template).toContain('hasOutstandingReceiptLines()');
  });

  it('ordnet die Belege rechts direkt nach der Sendungsverfolgung ein', () => {
    const template = readFileSync(
      'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
      'utf8',
    );
    const sidebar = template.indexOf('data-testid="purchase-entry-sidebar"');
    const tracking = template.indexOf('[ngTemplateOutlet]="trackingCard"', sidebar);
    const documents = template.indexOf('<app-purchase-documents-card', sidebar);

    expect(tracking).toBeGreaterThan(sidebar);
    expect(documents).toBeGreaterThan(tracking);
  });

  it('bietet den fehlenden Eigenbeleg nach einem Speicherfehler erneut an', async () => {
    const component = Object.create(PurchaseDetailComponent.prototype) as PurchaseDetailComponent;
    const ensureForFinalizedPurchase = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error('Belegspeicher nicht erreichbar') })
      .mockResolvedValueOnce({ error: null });
    const success = vi.fn();
    const selfReceiptError = signal<string | null>(null);
    const historyRevision = signal(0);
    Object.assign(component, {
      purchase: () => ({ id: 'purchase-1' }),
      selfReceiptMissing: () => true,
      isCreatingSelfReceipt: signal(false),
      selfReceiptError,
      selfReceipts: { ensureForFinalizedPurchase },
      historyRevision,
      toast: { success },
    });

    await component.retrySelfReceipt();
    expect(selfReceiptError()).toBe('Belegspeicher nicht erreichbar');
    expect(success).not.toHaveBeenCalled();

    await component.retrySelfReceipt();
    expect(selfReceiptError()).toBeNull();
    expect(historyRevision()).toBe(1);
    expect(success).toHaveBeenCalledWith('Eigenbeleg wurde erstellt.');
  });

  it('zeigt Verkäuferangaben, Beschreibung und Nachtrag ohne entfernte Einkaufsfelder', () => {
    const template = readFileSync(
      'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
      'utf8',
    );

    expect(template).toContain('>Verkäufer<');
    expect(template).toContain('Beschreibung');
    expect(template).toContain('purchaseSellerDetailRows(p)');
    expect(template).toContain("p.notes || p.title || 'Nicht angegeben'");
    expect(template).not.toContain('>Angebotslink<');
    expect(template).not.toContain('original_url');
    expect(template).toContain('<app-purchase-seller-details-dialog');
    expect(template).toContain('<app-purchase-documents-card');
    expect(template).not.toContain('Original-Angebot');
    expect(template).not.toContain('>Lieferant<');
  });

  describe('Gemeinsame Bearbeitungsmaske', () => {
    function workspace(entryStatus = 'draft') {
      const component = Object.create(PurchaseDetailComponent.prototype) as PurchaseDetailComponent;
      Object.assign(component, {
        purchaseService: {
          selectedPurchase: signal({ id: 'purchase-1', entry_status: entryStatus }),
        },
        isEditing: signal(false),
        editingPurchase: signal(null),
        entryForm: () => undefined,
        packageContentDialog: () => undefined,
        isReloadingAfterSave: signal(false),
        saveReloadFailed: signal(false),
        router: { navigate: vi.fn() },
      });
      return component;
    }

    it('öffnet die vorhandenen Angaben auf derselben Seite', () => {
      const component = workspace();
      component.editPurchase('purchase-1');
      expect(component.isEditing()).toBe(true);
      expect(component.editingPurchase()?.id).toBe('purchase-1');
    });

    it('öffnet keinen abgeschlossenen oder fremden Einkauf zur direkten Bearbeitung', () => {
      const finalized = workspace('finalized');
      finalized.editPurchase('purchase-1');
      expect(finalized.isEditing()).toBe(false);
      const other = workspace();
      other.editPurchase('purchase-2');
      expect(other.isEditing()).toBe(false);
    });

    it('behält Eingaben bei abgelehntem Verwerfen und setzt den Entwurf nach Zustimmung zurück', async () => {
      const component = workspace();
      let confirmed = false;
      const resetToPurchase = vi.fn();
      Object.assign(component, {
        entryForm: () => ({
          hasUnsavedChanges: () => true,
          isSaving: () => false,
          resetToPurchase,
        }),
        dialog: { frage: async () => confirmed },
      });
      component.editPurchase('purchase-1');
      await component.discardEdits();
      expect(component.isEditing()).toBe(true);
      expect(component.editingPurchase()?.id).toBe('purchase-1');
      confirmed = true;
      await component.discardEdits();
      expect(component.isEditing()).toBe(true);
      expect(resetToPurchase).toHaveBeenCalledWith(component.purchaseService.selectedPurchase());
    });

    it('behält den Bearbeitungssnapshot bei erneutem Öffnen derselben Erfassung', () => {
      const component = workspace();
      component.editPurchase('purchase-1');
      const snapshot = component.editingPurchase();
      Object.assign(component.purchaseService, {
        selectedPurchase: signal({
          id: 'purchase-1',
          entry_status: 'draft',
          title: 'Aktualisiert',
        } as Purchase),
      });
      component.editPurchase('purchase-1');
      expect(component.editingPurchase()).toBe(snapshot);
    });

    it('verhindert das Verwerfen während einer laufenden Speicherung', async () => {
      const component = workspace();
      Object.assign(component, {
        entryForm: () => ({ hasUnsavedChanges: () => true, isSaving: () => true }),
        dialog: { frage: async () => true },
      });
      component.editPurchase('purchase-1');
      await component.discardEdits();
      expect(component.isEditing()).toBe(true);
    });

    it('sperrt Eingaben bis der gespeicherte Stand geladen ist und behält bei Ladefehler den Entwurf', async () => {
      const component = workspace();
      let resolveLoad: (purchase: Purchase | null) => void = () => undefined;
      const load = new Promise<Purchase | null>((resolve) => {
        resolveLoad = resolve;
      });
      const resetToPurchase = vi.fn();
      Object.assign(component, {
        id: () => 'purchase-1',
        workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
        saveReloadFailed: signal(false),
        historyRevision: signal(0),
        entryForm: () => ({ isSaving: () => false, resetToPurchase }),
      });
      Object.assign(component.purchaseService, { getPurchaseById: vi.fn(() => load) });
      component.editPurchase('purchase-1');
      const finish = component.finishEditing();
      expect(component.isSaving()).toBe(true);
      resolveLoad(null);
      await finish;
      expect(component.isSaving()).toBe(false);
      expect(component.isReloadingAfterSave()).toBe(true);
      expect(component.saveReloadFailed()).toBe(true);
      expect(resetToPurchase).not.toHaveBeenCalled();
      const saved = {
        id: 'purchase-1',
        workspace_id: 'workspace-1',
        entry_status: 'draft',
      } as Purchase;
      Object.assign(component.purchaseService, { getPurchaseById: vi.fn(async () => saved) });
      await component.finishEditing();
      expect(component.isSaving()).toBe(false);
      expect(resetToPurchase).toHaveBeenCalledWith(saved);
      expect(component.historyRevision()).toBe(1);
    });
  });

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

    it('zieht den Rabatt auch ohne berechnete Serversumme vom Warenbetrag ab', () => {
      const component = Object.create(PurchaseDetailComponent.prototype) as PurchaseDetailComponent;
      expect(
        component.purchaseTotalCost({
          ...einkauf,
          purchase_price: 100,
          discount_amount: 10,
          shipping_cost: 5,
        }),
      ).toBe(95);
      expect(
        component.purchaseTotalCost({ ...einkauf, purchase_price: null, discount_amount: 10 }),
      ).toBeNull();
    });

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
      const deletePurchase = vi.fn(async () => ({ error: null as Error | null }));
      const dialog = { frage: vi.fn(async () => true) };
      const router = { navigate: vi.fn(async () => true) };
      const receivingQuantities = signal<Record<string, number>>({ 'line-1': 5 });
      const purchaseService = {
        selectedPurchase: signal<Purchase | null>(einkauf),
        purchaseLines: signal<PurchaseLine[]>([mengenposition]),
        purchaseItems: signal([]),
        addItemToPurchase,
        receivePurchaseLines,
        receiveIndividualPurchaseLine,
        deletePurchase,
        markIndividualPurchaseLineReceived: vi.fn(async () => ({
          data: einzelposition,
          error: null as Error | null,
          reportedBySyncStatus: false,
        })),
        getPurchaseById: vi.fn(async () => einkauf),
        refreshAfterCostingChange: vi.fn(async () => null),
        redistributeCosts: vi.fn(async () => ({ error: null as Error | null })),
        updateCostAllocationMode: vi.fn(async () => ({ error: null as Error | null })),
        updatePurchaseTracking: vi.fn(async () => ({
          data: einkauf as Purchase | null,
          error: null as Error | null,
        })),
        setPurchaseWorkflowStatus: vi.fn(async () => ({ error: null as Error | null })),
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
        dialog,
        router,
        entryForm: () => undefined,
        packageContentDialog: () => undefined,
        isReloadingAfterSave: signal(false),
        saveReloadFailed: signal(false),
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
        receivingQuantities,
        selectedReceiptLines: () =>
          purchaseService.purchaseLines().flatMap((line) => {
            const receivedQuantity = receivingQuantities()[line.id] ?? 0;
            const remainingQuantity = line.ordered_quantity - line.received_quantity;
            return receivedQuantity >= 1 && receivedQuantity <= remainingQuantity
              ? [{ purchaseLineId: line.id, receivedQuantity }]
              : [];
          }),
        quantityPurchaseLines: () =>
          purchaseService.purchaseLines().filter((line) => line.line_kind === 'quantity'),
        individualPurchaseLines: () =>
          purchaseService
            .purchaseLines()
            .filter((line) => line.line_kind === 'individual' && !line.is_package),
        hasOutstandingReceiptLines: () =>
          purchaseService
            .purchaseLines()
            .some((line) => line.received_quantity < line.ordered_quantity),
        purchaseLineDrafts: signal([]),
        isAllocatorOpen: signal(true),
        isApplyingAllocation: signal(false),
        allocatorMode: signal<'even' | 'value_weighted'>('even'),
        editableExpectedValues: signal<Record<string, number>>({ 'item-1': 20 }),
        isEditingTracking: signal(true),
        trackingNumberDraft: signal('00340434161094000001'),
        trackingCarrierDraft: signal<'dhl' | null>('dhl'),
        historyRevision: signal(0),
        isLifecycleSubmitting: signal(false),
        isEditing: signal(false),
        editingPurchase: signal<Purchase | null>(null),
        canReopenPurchase: signal(true),
        purchaseCostingService: {
          reopenPurchase: vi.fn(async () => ({
            data: {
              purchaseId: einkauf.id,
              totalPurchaseCost: 31.98,
              allocatedTotalCost: 31.98,
              entryStatus: 'capturing' as const,
              eventId: 'event-reopened',
            },
            error: null,
            reportedBySyncStatus: false,
          })),
        },
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
        dialog,
        router,
        deletePurchase,
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
        expect(erfolg.komponente.historyRevision()).toBe(1);
        expect(erfolg.toast.toasts()[0].title).toBe('Sendungsverfolgung wurde gespeichert.');

        const fehler = erstelleKomponente();
        fehler.purchaseService.updatePurchaseTracking.mockResolvedValue({
          data: null,
          error: new Error('Einkauf nicht gefunden'),
        });
        await fehler.komponente.saveTracking();
        expect(fehler.komponente.isEditingTracking()).toBe(true);
        expect(fehler.komponente.historyRevision()).toBe(0);
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

      it('entfernt eine freiwillige Sendungsverfolgung bei leerer Nummer', async () => {
        const { komponente, toast, purchaseService } = erstelleKomponente();
        komponente.trackingNumberDraft.set('');
        komponente.trackingCarrierDraft.set(null);

        await komponente.saveTracking();

        expect(purchaseService.updatePurchaseTracking).toHaveBeenCalledWith(
          einkauf.id,
          null,
          null,
          'pending',
        );
        expect(komponente.isEditingTracking()).toBe(false);
        expect(toast.toasts()[0].title).toBe('Sendungsverfolgung wurde entfernt.');
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

      it('bucht alle ausgewählten Mengenpositionen gemeinsam', async () => {
        const { komponente, purchaseService, receivePurchaseLines } = erstelleKomponente();
        const zweitePosition = {
          ...mengenposition,
          id: 'line-2',
          title_snapshot: 'Kabel',
          ordered_quantity: 3,
        };
        purchaseService.purchaseLines.set([mengenposition, zweitePosition]);
        komponente.receivingQuantities.set({ 'line-1': 5, 'line-2': 2 });

        await komponente.receiveSelectedPurchaseLines();

        expect(receivePurchaseLines).toHaveBeenCalledWith(einkauf.id, [
          { purchaseLineId: 'line-1', receivedQuantity: 5 },
          { purchaseLineId: 'line-2', receivedQuantity: 2 },
        ]);
        expect(komponente.isReceivingLines()).toBe(false);
      });

      it('öffnet keinen leeren Wareneingang, wenn alle Positionen vollständig erfasst sind', () => {
        const { komponente, purchaseService } = erstelleKomponente();
        purchaseService.purchaseLines.set([
          { ...mengenposition, received_quantity: mengenposition.ordered_quantity },
        ]);
        komponente.isReceivingLines.set(false);

        komponente.startReceivingLines();

        expect(komponente.isReceivingLines()).toBe(false);
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

    describe('Einkauf löschen', () => {
      it('verwendet die Belegnummer im Löschdialog, wenn kein Titel gepflegt ist', async () => {
        const { komponente, dialog, purchaseService } = erstelleKomponente();
        purchaseService.selectedPurchase.set({
          ...einkauf,
          entry_status: 'draft',
          record_number: 'PO-0042',
          title: '',
        });

        await komponente.onDeletePurchase();

        expect(dialog.frage).toHaveBeenCalledWith(
          expect.objectContaining({
            titel: 'Einkauf löschen?',
            text: '„PO-0042“ wird gelöscht, zusammen mit allen zugeordneten Artikeln und Nebenkosten. Das lässt sich nicht rückgängig machen.',
          }),
        );
      });

      it('verwendet neutralen Text im Löschdialog, wenn weder Belegnummer noch Titel vorhanden sind', async () => {
        const { komponente, dialog, purchaseService } = erstelleKomponente();
        purchaseService.selectedPurchase.set({
          ...einkauf,
          entry_status: 'draft',
          record_number: '',
          title: '',
          supplier: undefined,
        });

        await komponente.onDeletePurchase();

        expect(dialog.frage).toHaveBeenCalledWith(
          expect.objectContaining({
            titel: 'Einkauf löschen?',
            text: 'Dieser Einkauf wird gelöscht, zusammen mit allen zugeordneten Artikeln und Nebenkosten. Das lässt sich nicht rückgängig machen.',
          }),
        );
      });

      it('löscht den Entwurf nach Bestätigung und navigiert zurück', async () => {
        const { komponente, deletePurchase, toast, router, purchaseService } = erstelleKomponente();
        purchaseService.selectedPurchase.set({
          ...einkauf,
          entry_status: 'draft',
          record_number: 'PO-0042',
        });

        await komponente.onDeletePurchase();

        expect(deletePurchase).toHaveBeenCalledWith(einkauf.id);
        expect(toast.toasts()[0].title).toBe('Einkauf wurde gelöscht.');
        expect(router.navigate).toHaveBeenCalledWith(['/purchases']);
      });

      it('bricht den Löschvorgang ab, wenn im Dialog abgebrochen wird', async () => {
        const { komponente, dialog, deletePurchase, purchaseService } = erstelleKomponente();
        dialog.frage.mockResolvedValue(false);
        purchaseService.selectedPurchase.set({
          ...einkauf,
          entry_status: 'draft',
          record_number: 'PO-0042',
        });

        await komponente.onDeletePurchase();

        expect(deletePurchase).not.toHaveBeenCalled();
      });
    });

    describe('Einkauf wieder öffnen', () => {
      it('übernimmt den bestätigten Status und wechselt direkt in die Erfassungsmaske', async () => {
        const { komponente, purchaseService } = erstelleKomponente();
        purchaseService.selectedPurchase.set({ ...einkauf, entry_status: 'finalized' });
        purchaseService.refreshAfterCostingChange.mockImplementation(async () => {
          purchaseService.selectedPurchase.set({
            ...einkauf,
            entry_status: 'capturing',
            purchase_price: null,
          });
          return null;
        });

        await komponente.reopenPurchase();

        expect(purchaseService.refreshAfterCostingChange).toHaveBeenCalledWith(
          einkauf.workspace_id,
          einkauf.id,
          expect.objectContaining({ entryStatus: 'capturing' }),
        );
        expect(komponente.isEditing()).toBe(true);
        expect(komponente.editingPurchase()).toEqual(
          expect.objectContaining({ id: einkauf.id, entry_status: 'capturing' }),
        );
      });
    });
  });
});

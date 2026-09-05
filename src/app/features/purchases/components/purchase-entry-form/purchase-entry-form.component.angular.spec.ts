import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase, PurchaseType } from '../../../../core/models/flipbase.models';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { InboundTrackingService } from '../../../../core/services/inbound-tracking.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { SourcesService } from '../../../../core/services/sources.service';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { PurchaseCostDraft } from '../purchase-cost-editor/purchase-cost-editor.component';
import { PurchaseEntryFormComponent } from './purchase-entry-form.component';

beforeAll(() => TestBed.resetTestingModule());

const einkauf: Purchase = {
  id: 'purchase-1',
  workspace_id: 'workspace-1',
  type: 'single',
  title: 'Konsole',
  purchase_date: '2026-08-24',
  purchase_price: 50,
  shipping_cost: 0,
  source_id: null,
  supplier_id: null,
  cost_allocation_mode: 'even',
  created_at: '2026-08-24T10:00:00.000Z',
};

interface CreateProblem {
  readonly kind: 'additional_costs' | 'inventory_item' | 'activity_log';
  readonly error: Error;
  readonly reportedBySyncStatus: boolean;
}

interface CreateAntwort {
  readonly status: 'success' | 'partial' | 'failed';
  readonly data: Purchase | null;
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
  readonly problems: readonly CreateProblem[];
}

function erstelleKomponente(vorhandener: Purchase | null = null) {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const created = { emit: vi.fn() };
  const closed = { emit: vi.fn() };
  const purchaseService = {
    createPurchase: vi.fn(async (): Promise<CreateAntwort> => ({
      status: 'success',
      data: einkauf,
      error: null,
      reportedBySyncStatus: false,
      problems: [],
    })),
    updatePurchase: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
    ersetzeZusatzkosten: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
    updatePurchaseDraft: vi.fn(async () => ({
      data: einkauf,
      error: null,
      reportedBySyncStatus: false,
    })),
    refreshAfterFinalization: vi.fn(async () => undefined),
  };
  const purchaseCostingService = {
    finalizePurchase: vi.fn(
      async (): Promise<{
        data: {
          purchaseId: string;
          totalPurchaseCost: number;
          allocatedTotalCost: number;
          entryStatus: 'finalized';
          eventId: string;
        } | null;
        error: Error | null;
        reportedBySyncStatus: boolean;
      }> => ({
        data: {
          purchaseId: einkauf.id,
          totalPurchaseCost: 50,
          allocatedTotalCost: 50,
          entryStatus: 'finalized' as const,
          eventId: 'event-1',
        },
        error: null,
        reportedBySyncStatus: false,
      }),
    ),
  };
  const sourcesService = {
    createSource: vi.fn(
      async (): Promise<{ data: { id: string } | null; error: Error | null }> => ({
        data: { id: 'source-1' },
        error: null,
      }),
    ),
  };
  const suppliersService = {
    createSupplier: vi.fn(
      async (): Promise<{ data: { id: string } | null; error: Error | null }> => ({
        data: { id: 'supplier-1' },
        error: null,
      }),
    ),
  };
  const komponente = Object.create(
    PurchaseEntryFormComponent.prototype,
  ) as PurchaseEntryFormComponent;

  Object.assign(komponente, {
    purchase: () => vorhandener,
    purchaseService,
    purchaseCostingService,
    sourcesService,
    suppliersService,
    trackingService: { autoDetectCarrier: vi.fn(() => 'dhl') },
    toast,
    syncStatus,
    created,
    closed,
    isSubmitting: signal(false),
    errorMessage: signal<string | null>(null),
    persistedDraft: signal<Purchase | null>(null),
    isAddingSource: signal(true),
    isAddingSupplier: signal(true),
    newSourceName: signal('Flohmarkt'),
    newSupplierName: signal('Lieferant GmbH'),
    costDrafts: signal<readonly PurchaseCostDraft[]>([]),
    initialCostDrafts: signal<readonly PurchaseCostDraft[]>([]),
    areAdditionalCostsValid: signal(true),
    purchaseBasePrice: signal<number | null>(50),
    purchaseLines: signal([]),
    form: new FormGroup({
      type: new FormControl<PurchaseType>('single', { nonNullable: true }),
      title: new FormControl('Konsole', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
      source_id: new FormControl<string | null>(null),
      supplier_id: new FormControl<string | null>(null),
      purchase_date: new FormControl('2026-08-24', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      purchase_price: new FormControl<number | null>(50, {
        validators: [Validators.min(0)],
      }),
      tracking_number: new FormControl('', { nonNullable: true }),
      tracking_carrier: new FormControl<'dhl' | null>(null),
      original_url: new FormControl('', { nonNullable: true }),
      notes: new FormControl('', { nonNullable: true }),
      single_item_condition: new FormControl<'used'>('used', { nonNullable: true }),
      single_item_expected_value: new FormControl<number | null>(null),
    }),
  });

  return {
    komponente,
    toast,
    syncStatus,
    created,
    closed,
    purchaseService,
    purchaseCostingService,
    sourcesService,
    suppliersService,
  };
}

describe('PurchaseEntryFormComponent – zentrale Aktionsmeldungen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('schließt die Erfassung erst über die atomare Finalisierung ab', async () => {
    const { komponente, purchaseService, purchaseCostingService, created, closed } =
      erstelleKomponente();
    komponente.onPurchaseLinesChanged([
      {
        draftId: 'draft-console',
        catalogProductId: null,
        titleSnapshot: 'Konsole',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 50,
        lineTotal: 50,
        estimatedMarketValue: null,
      },
    ]);

    await komponente.onFinalize();

    expect(purchaseCostingService.finalizePurchase).toHaveBeenCalledWith(
      einkauf.workspace_id,
      einkauf.id,
    );
    expect(purchaseService.refreshAfterFinalization).toHaveBeenCalledWith(
      einkauf.workspace_id,
      einkauf.id,
    );
    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
  });

  it('legt beim Abschließen keinen positionslosen Einkauf an', async () => {
    const { komponente, purchaseService, purchaseCostingService } = erstelleKomponente();

    await komponente.onFinalize();

    expect(purchaseService.createPurchase).not.toHaveBeenCalled();
    expect(purchaseCostingService.finalizePurchase).not.toHaveBeenCalled();
    expect(komponente.errorMessage()).toContain('Einkaufsposition');
  });

  it('behält den vollständigen Entwurf offen, wenn die Finalisierung fehlschlägt', async () => {
    const { komponente, purchaseCostingService, created, closed } = erstelleKomponente();
    komponente.onPurchaseLinesChanged([
      {
        draftId: 'draft-console',
        catalogProductId: null,
        titleSnapshot: 'Konsole',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 50,
        lineTotal: 50,
        estimatedMarketValue: null,
      },
    ]);
    purchaseCostingService.finalizePurchase.mockResolvedValue({
      data: null,
      error: new Error('Die Kostenaufteilung ist noch nicht vollständig.'),
      reportedBySyncStatus: false,
    });

    await komponente.onFinalize();

    expect(komponente.form.controls.title.value).toBe('Konsole');
    expect(komponente.errorMessage()).toContain('Kostenaufteilung');
    expect(created.emit).not.toHaveBeenCalled();
    expect(closed.emit).not.toHaveBeenCalled();
  });

  it('zeigt die zentrale Demo-Einschränkung ohne Erfolg, Schließen oder doppelten Toast', async () => {
    const { komponente, toast, syncStatus, purchaseCostingService, created, closed } =
      erstelleKomponente();
    komponente.onPurchaseLinesChanged([
      {
        draftId: 'draft-console',
        catalogProductId: null,
        titleSnapshot: 'Konsole',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 50,
        lineTotal: 50,
        estimatedMarketValue: null,
      },
    ]);
    const centralError = syncStatus.melde(
      'Finalisieren des Einkaufs',
      new Error('In der Demo können aktuell nur Mystery Boxen abgeschlossen werden.'),
    );
    purchaseCostingService.finalizePurchase.mockResolvedValue({
      data: null,
      error: centralError,
      reportedBySyncStatus: true,
    });

    await komponente.onFinalize();

    expect(komponente.errorMessage()).toContain(
      'In der Demo können aktuell nur Mystery Boxen abgeschlossen werden.',
    );
    expect(toast.toasts()).toEqual([]);
    expect(created.emit).not.toHaveBeenCalled();
    expect(closed.emit).not.toHaveBeenCalled();
  });

  it('überschreibt vor dem Finalisierungs-Retry denselben Draft atomar mit allen Änderungen', async () => {
    const { komponente, purchaseService, purchaseCostingService, created, closed } =
      erstelleKomponente();
    const persistedLine = {
      id: 'line-persisted',
      workspace_id: einkauf.workspace_id,
      purchase_id: einkauf.id,
      catalog_product_id: null,
      title_snapshot: 'Konsole',
      line_kind: 'individual' as const,
      ordered_quantity: 1,
      received_quantity: 0,
      price_mode: 'priced' as const,
      unit_purchase_price: 50,
      line_total: 50,
      condition_snapshot: 'used',
      estimated_market_value: null,
    };
    purchaseService.createPurchase.mockResolvedValue({
      status: 'success',
      data: {
        ...einkauf,
        entry_status: 'draft',
        purchase_lines: [persistedLine],
        costs: [
          {
            id: 'cost-persisted',
            type: 'shipping',
            amount: 5,
            allocation_method: 'direct',
            target_purchase_line_id: persistedLine.id,
          },
        ],
      },
      error: null,
      reportedBySyncStatus: false,
      problems: [],
    });
    purchaseCostingService.finalizePurchase
      .mockResolvedValueOnce({
        data: null,
        error: new Error('Finalisierung vorübergehend fehlgeschlagen.'),
        reportedBySyncStatus: false,
      })
      .mockResolvedValueOnce({
        data: {
          purchaseId: einkauf.id,
          totalPurchaseCost: 75,
          allocatedTotalCost: 75,
          entryStatus: 'finalized',
          eventId: 'event-retry',
        },
        error: null,
        reportedBySyncStatus: false,
      });
    komponente.onPurchaseLinesChanged([
      {
        draftId: 'line-draft',
        catalogProductId: null,
        titleSnapshot: 'Konsole',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 50,
        lineTotal: 50,
        estimatedMarketValue: null,
      },
    ]);
    komponente.onCostsChanged([
      {
        type: 'shipping',
        amount: 5,
        description: 'Erster Versand',
        allocationMethod: 'direct',
        targetPurchaseLineId: 'line-draft',
      },
    ]);

    await komponente.onFinalize();

    expect(komponente.purchaseLines()[0]?.draftId).toBe(persistedLine.id);
    expect(komponente.costDrafts()[0]?.targetPurchaseLineId).toBe(persistedLine.id);
    komponente.form.controls.title.setValue('Konsole mit Zubehör');
    komponente.onPurchaseLinesChanged([
      {
        draftId: persistedLine.id,
        catalogProductId: null,
        titleSnapshot: 'Konsole mit Controller',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'very_good',
        priceMode: 'priced',
        unitPurchasePrice: 70,
        lineTotal: 70,
        estimatedMarketValue: 90,
      },
    ]);
    komponente.onCostsChanged([
      {
        type: 'shipping',
        amount: 5,
        description: 'Geänderter Direktversand',
        allocationMethod: 'direct',
        targetPurchaseLineId: persistedLine.id,
      },
    ]);

    await komponente.onFinalize();

    expect(purchaseService.createPurchase).toHaveBeenCalledOnce();
    expect(purchaseService.updatePurchaseDraft).toHaveBeenCalledOnce();
    expect(purchaseService.updatePurchaseDraft).toHaveBeenCalledWith(
      einkauf.id,
      expect.objectContaining({
        title: 'Konsole mit Zubehör',
        purchase_lines: [
          expect.objectContaining({
            draftId: persistedLine.id,
            titleSnapshot: 'Konsole mit Controller',
            condition: 'very_good',
            unitPurchasePrice: 70,
            lineTotal: 70,
            estimatedMarketValue: 90,
          }),
        ],
        initial_costs: [
          expect.objectContaining({
            amount: 5,
            description: 'Geänderter Direktversand',
            allocationMethod: 'direct',
            targetPurchaseLineId: persistedLine.id,
          }),
        ],
      }),
    );
    expect(purchaseService.updatePurchaseDraft.mock.invocationCallOrder[0]).toBeLessThan(
      purchaseCostingService.finalizePurchase.mock.invocationCallOrder[1],
    );
    expect(purchaseCostingService.finalizePurchase).toHaveBeenCalledTimes(2);
    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
  });

  it('speichert nach einem Finalisierungsfehler denselben Draft statt einen zweiten Einkauf anzulegen', async () => {
    const { komponente, purchaseService, purchaseCostingService, created, closed } =
      erstelleKomponente();
    purchaseCostingService.finalizePurchase.mockResolvedValue({
      data: null,
      error: new Error('Finalisierung vorübergehend fehlgeschlagen.'),
      reportedBySyncStatus: false,
    });
    komponente.onPurchaseLinesChanged([
      {
        draftId: 'line-draft',
        catalogProductId: null,
        titleSnapshot: 'Konsole',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 50,
        lineTotal: 50,
        estimatedMarketValue: null,
      },
    ]);

    await komponente.onFinalize();
    komponente.form.controls.title.setValue('Konsole als gespeicherter Draft');
    await komponente.onSubmit();

    expect(purchaseService.createPurchase).toHaveBeenCalledOnce();
    expect(purchaseService.updatePurchaseDraft).toHaveBeenCalledOnce();
    expect(purchaseService.updatePurchaseDraft).toHaveBeenCalledWith(
      einkauf.id,
      expect.objectContaining({ title: 'Konsole als gespeicherter Draft' }),
    );
    expect(purchaseCostingService.finalizePurchase).toHaveBeenCalledOnce();
    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
  });

  it('meldet einen nur teilweise gespeicherten Entwurf nicht als abgeschlossen', async () => {
    const { komponente, purchaseService, purchaseCostingService, created, closed } =
      erstelleKomponente();
    komponente.onPurchaseLinesChanged([
      {
        draftId: 'draft-console',
        catalogProductId: null,
        titleSnapshot: 'Konsole',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 50,
        lineTotal: 50,
        estimatedMarketValue: null,
      },
    ]);
    purchaseService.createPurchase.mockResolvedValue({
      status: 'partial',
      data: einkauf,
      error: null,
      reportedBySyncStatus: false,
      problems: [
        {
          kind: 'inventory_item',
          error: new Error('Entwurfsartikel unvollständig'),
          reportedBySyncStatus: false,
        },
      ],
    });

    await komponente.onFinalize();

    expect(purchaseCostingService.finalizePurchase).not.toHaveBeenCalled();
    expect(komponente.errorMessage()).toContain('Entwurf wurde gespeichert');
    expect(created.emit).not.toHaveBeenCalled();
    expect(closed.emit).not.toHaveBeenCalled();
  });

  it('schließt den Einkaufsdialog bei einem Speicherfehler nicht', async () => {
    const { komponente, toast, created, closed, purchaseService } = erstelleKomponente();
    purchaseService.createPurchase.mockResolvedValue({
      status: 'failed',
      data: null,
      error: new Error('Kein aktiver Workspace'),
      reportedBySyncStatus: false,
      problems: [],
    });

    await komponente.onSubmit();

    expect(komponente.isSubmitting()).toBe(false);
    expect(komponente.form.controls.title.value).toBe('Konsole');
    expect(created.emit).not.toHaveBeenCalled();
    expect(closed.emit).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Einkauf konnte nicht angelegt werden.',
      description: 'Kein aktiver Workspace',
      persistent: true,
    });
  });

  it('erklärt eine ungültige Direktzuordnung und speichert keinen Entwurf stillschweigend', async () => {
    const { komponente, purchaseService } = erstelleKomponente();
    komponente.areAdditionalCostsValid.set(false);

    await komponente.onSubmit();

    expect(purchaseService.createPurchase).not.toHaveBeenCalled();
    expect(komponente.errorMessage()).toContain('Direkte Zusatzkosten');
    expect(komponente.errorMessage()).toContain('Zielposition');
  });

  it('bietet neue Positions-Draft-IDs als direkte Zuordnungsziele an', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PurchaseService, useValue: {} },
        { provide: SourcesService, useValue: { sources: signal([]) } },
        { provide: SuppliersService, useValue: { suppliers: signal([]) } },
        { provide: InboundTrackingService, useValue: {} },
        ToastService,
        SyncStatusService,
      ],
    });
    const komponente = TestBed.runInInjectionContext(() => new PurchaseEntryFormComponent());

    komponente.onPurchaseLinesChanged([
      {
        draftId: 'draft-camera',
        catalogProductId: null,
        titleSnapshot: 'Kamera',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 20,
        lineTotal: 20,
        estimatedMarketValue: null,
      },
    ]);

    expect(komponente.purchaseLineOptions()).toEqual([{ value: 'draft-camera', label: 'Kamera' }]);

    komponente.onPurchaseLinesChanged([]);

    expect(komponente.purchaseLineOptions()).toEqual([]);
  });

  it('beendet den Ladezustand und hält den Einkaufsdialog bei einer Ausnahme geöffnet', async () => {
    const { komponente, toast, created, closed, purchaseService } = erstelleKomponente();
    purchaseService.createPurchase.mockRejectedValue(new Error('Dienst nicht erreichbar'));

    await komponente.onSubmit();

    expect(komponente.isSubmitting()).toBe(false);
    expect(created.emit).not.toHaveBeenCalled();
    expect(closed.emit).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Einkauf konnte nicht angelegt werden.',
      description: 'Dienst nicht erreichbar',
      persistent: true,
    });
  });

  it('bestätigt einen neuen Einkauf und schließt erst nach Erfolg', async () => {
    const { komponente, toast, created, closed } = erstelleKomponente();

    await komponente.onSubmit();

    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Einkauf wurde angelegt.',
    });
  });

  it('übergibt die vollständige Mengenposition beim Anlegen an den Dienst', async () => {
    const { komponente, purchaseService } = erstelleKomponente();
    komponente.form.controls.type.setValue('lot');
    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: 'catalog-led',
        titleSnapshot: 'LED-Lampe',
        lineKind: 'quantity',
        orderedQuantity: 5,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 4.99,
        lineTotal: 24.95,
        estimatedMarketValue: null,
      },
    ]);

    await komponente.onSubmit();

    expect(purchaseService.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'lot',
        purchase_price: 24.95,
        purchase_lines: [
          {
            catalogProductId: 'catalog-led',
            titleSnapshot: 'LED-Lampe',
            lineKind: 'quantity',
            orderedQuantity: 5,
            condition: 'used',
            priceMode: 'priced',
            unitPurchasePrice: 4.99,
            lineTotal: 24.95,
            estimatedMarketValue: null,
          },
        ],
      }),
    );
  });

  it('behält den Kopfpreis null, solange eine normale Position noch unbepreist ist', () => {
    const { komponente } = erstelleKomponente();
    komponente.form.controls.purchase_price.setValue(null);

    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: 'catalog-open',
        titleSnapshot: 'Noch unbepreiste Ware',
        lineKind: 'quantity',
        orderedQuantity: 2,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: null,
        lineTotal: null,
        estimatedMarketValue: null,
      },
      {
        catalogProductId: 'catalog-free',
        titleSnapshot: 'Kostenlose Ware',
        lineKind: 'quantity',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 0,
        lineTotal: 0,
        estimatedMarketValue: null,
      },
    ]);

    expect(komponente.form.controls.purchase_price.value).toBeNull();
  });

  it('summiert ausdrücklich bepreiste Nullpositionen zu einem echten Kopfpreis von null Euro', () => {
    const { komponente } = erstelleKomponente();
    komponente.form.controls.purchase_price.setValue(null);

    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: 'catalog-free',
        titleSnapshot: 'Kostenlose Ware',
        lineKind: 'quantity',
        orderedQuantity: 2,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 0,
        lineTotal: 0,
        estimatedMarketValue: null,
      },
    ]);

    expect(komponente.form.controls.purchase_price.value).toBe(0);
  });

  it('sperrt den aus normalen Positionssummen abgeleiteten Kopfpreis', () => {
    const { komponente } = erstelleKomponente();

    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: 'catalog-camera',
        titleSnapshot: 'Kamera',
        lineKind: 'quantity',
        orderedQuantity: 2,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 12.5,
        lineTotal: 25,
        estimatedMarketValue: null,
      },
    ]);

    expect(komponente.form.controls.purchase_price.value).toBe(25);
    expect(komponente.form.controls.purchase_price.disabled).toBe(true);
  });

  it('bewahrt den manuellen Mystery-Kopfpreis bei Marktwertänderungen', () => {
    const { komponente } = erstelleKomponente();
    komponente.form.controls.type.setValue('mystery_pack');
    komponente.form.controls.purchase_price.setValue(60);

    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: null,
        titleSnapshot: 'Mystery-Figur',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'unpriced_mystery',
        unitPurchasePrice: null,
        lineTotal: null,
        estimatedMarketValue: 12,
      },
    ]);
    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: null,
        titleSnapshot: 'Mystery-Figur',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'unpriced_mystery',
        unitPurchasePrice: null,
        lineTotal: null,
        estimatedMarketValue: 18,
      },
    ]);

    expect(komponente.form.controls.purchase_price.value).toBe(60);
    expect(komponente.form.controls.purchase_price.disabled).toBe(false);
  });

  it('speichert unbepreiste Mystery-Zeilen mit dem manuellen Kopfpreis', async () => {
    const { komponente, purchaseService } = erstelleKomponente();
    komponente.form.controls.type.setValue('mystery_pack');
    komponente.form.controls.purchase_price.setValue(45);
    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: null,
        titleSnapshot: 'Mystery-Comic',
        lineKind: 'individual',
        orderedQuantity: 1,
        condition: 'very_good',
        priceMode: 'unpriced_mystery',
        unitPurchasePrice: null,
        lineTotal: null,
        estimatedMarketValue: 15,
      },
    ]);

    await komponente.onSubmit();

    expect(purchaseService.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mystery_pack',
        purchase_price: 45,
        purchase_lines: [
          expect.objectContaining({
            priceMode: 'unpriced_mystery',
            unitPurchasePrice: null,
            lineTotal: null,
          }),
        ],
      }),
    );
  });

  it('speichert eine leere Mystery Box mit Kopfpreis und Zusatzkosten als Entwurf', async () => {
    const { komponente, purchaseService } = erstelleKomponente();
    komponente.form.controls.type.setValue('mystery_pack');
    komponente.form.controls.purchase_price.setValue(100);
    komponente.onCostsChanged([
      {
        type: 'shipping',
        amount: 10,
        description: '',
        allocationMethod: 'by_value',
        targetPurchaseLineId: null,
      },
    ]);

    expect(komponente.form.valid).toBe(true);
    await komponente.onSubmit();

    expect(purchaseService.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mystery_pack',
        purchase_price: 100,
        initial_costs: [expect.objectContaining({ amount: 10 })],
        purchase_lines: [],
      }),
    );
  });

  it('markiert eine bewusst gewählte Einkaufsart als ungespeicherte Änderung', () => {
    const { komponente } = erstelleKomponente();

    komponente.selectPurchaseType('mystery_pack');

    expect(komponente.form.controls.type.dirty).toBe(true);
    expect(komponente.hasUnsavedChanges()).toBe(true);
  });

  it('berücksichtigt unfertige Schnellanlage-Eingaben und blockiert paralleles Einkaufsspeichern', async () => {
    const { komponente, purchaseService } = erstelleKomponente();
    Object.assign(komponente, {
      lineEditor: () => ({
        hasUnsavedChanges: () => true,
        isSavingProduct: () => true,
      }),
    });

    expect(komponente.hasUnsavedChanges()).toBe(true);
    expect(komponente.isSaving()).toBe(true);
    await komponente.onSubmit();
    expect(purchaseService.createPurchase).not.toHaveBeenCalled();
  });

  it('berücksichtigt ungespeicherte Quellen- und Lieferantennamen', () => {
    const { komponente } = erstelleKomponente();
    komponente.newSourceName.set('Neue Quelle');
    expect(komponente.hasUnsavedChanges()).toBe(true);

    komponente.newSourceName.set('');
    komponente.newSupplierName.set('Neuer Lieferant');
    expect(komponente.hasUnsavedChanges()).toBe(true);
  });

  it('sendet eine nach dem Bepreisen wieder geleerte Position nicht an den Einkaufsdienst', async () => {
    const { komponente, purchaseService } = erstelleKomponente();
    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: 'catalog-open',
        titleSnapshot: 'Zunächst bepreiste Ware',
        lineKind: 'quantity',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 5,
        lineTotal: 5,
        estimatedMarketValue: null,
      },
    ]);
    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: 'catalog-open',
        titleSnapshot: 'Wieder unbepreiste Ware',
        lineKind: 'quantity',
        orderedQuantity: 1,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: null,
        lineTotal: null,
        estimatedMarketValue: null,
      },
    ]);

    await komponente.onSubmit();

    expect(purchaseService.createPurchase).not.toHaveBeenCalled();
    expect(komponente.errorMessage()).toContain('Positionspreise');
  });

  it('bestätigt das Speichern eines vorhandenen Einkaufs', async () => {
    const { komponente, toast, created, closed } = erstelleKomponente(einkauf);

    await komponente.onSubmit();

    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Einkauf wurde gespeichert.',
    });
  });

  it('erzeugt für einen zentral gemeldeten Einkaufsfehler keinen zweiten Toast', async () => {
    const { komponente, toast, purchaseService } = erstelleKomponente();
    const syncStatus = new SyncStatusService();
    const error = syncStatus.melde(
      'Speichern des Einkaufs',
      new Error('Keine Berechtigung für diesen Workspace.'),
    );
    Object.assign(komponente, { syncStatus });
    purchaseService.createPurchase.mockResolvedValue({
      status: 'failed',
      data: null,
      error,
      reportedBySyncStatus: true,
      problems: [],
    });

    await komponente.onSubmit();

    expect(toast.toasts()).toEqual([]);
  });

  it('meldet einen neuen lokalen Quellenfehler trotz gleichlautendem älteren Sync-Fehler', async () => {
    const { komponente, toast, sourcesService } = erstelleKomponente();
    const syncStatus = new SyncStatusService();
    const alterFehler = syncStatus.melde('Speichern der Quelle', new Error('offline'));
    sourcesService.createSource.mockResolvedValue({
      data: null,
      error: new Error(alterFehler.message),
    });
    Object.assign(komponente, { syncStatus });

    await komponente.saveNewSource();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Quelle konnte nicht angelegt werden.',
    });
  });

  it('schließt nach persistiertem Einkauf mit Teilproblem ohne grünen Vollerfolg', async () => {
    const { komponente, toast, created, closed, purchaseService } = erstelleKomponente();
    purchaseService.createPurchase.mockResolvedValue({
      status: 'partial',
      data: einkauf,
      error: null,
      reportedBySyncStatus: false,
      problems: [
        {
          kind: 'additional_costs',
          error: new Error('Speichern der Zusatzkosten fehlgeschlagen'),
          reportedBySyncStatus: false,
        },
      ],
    });

    await komponente.onSubmit();

    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
    expect(toast.toasts()).toEqual([
      expect.objectContaining({
        type: 'warning',
        title: 'Einkauf wurde angelegt, aber nicht vollständig.',
        description: expect.stringContaining('Zusatzkosten'),
      }),
    ]);
  });

  it('schließt bei einem zentral gemeldeten Teilproblem ohne zweiten Feature-Toast', async () => {
    const { komponente, toast, created, closed, purchaseService } = erstelleKomponente();
    purchaseService.createPurchase.mockResolvedValue({
      status: 'partial',
      data: einkauf,
      error: null,
      reportedBySyncStatus: true,
      problems: [
        {
          kind: 'activity_log',
          error: new Error('Speichern des Aktivitätsprotokolls fehlgeschlagen'),
          reportedBySyncStatus: true,
        },
      ],
    });

    await komponente.onSubmit();

    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
    expect(toast.toasts()).toEqual([]);
  });

  it('bestätigt das schnelle Anlegen einer Quelle und eines Lieferanten', async () => {
    const quelle = erstelleKomponente();
    await quelle.komponente.saveNewSource();
    expect(quelle.komponente.form.controls.source_id.value).toBe('source-1');
    expect(quelle.komponente.isAddingSource()).toBe(false);
    expect(quelle.toast.toasts()[0].title).toBe('Quelle wurde angelegt.');

    const lieferant = erstelleKomponente();
    await lieferant.komponente.saveNewSupplier();
    expect(lieferant.komponente.form.controls.supplier_id.value).toBe('supplier-1');
    expect(lieferant.komponente.isAddingSupplier()).toBe(false);
    expect(lieferant.toast.toasts()[0].title).toBe('Lieferant wurde angelegt.');
  });

  it('behält die Schnellerfassung einer Quelle bei einem Fehler geöffnet', async () => {
    const { komponente, toast, sourcesService } = erstelleKomponente();
    sourcesService.createSource.mockResolvedValue({
      data: null,
      error: new Error('Kein aktiver Workspace ausgewählt'),
    });

    await komponente.saveNewSource();

    expect(komponente.newSourceName()).toBe('Flohmarkt');
    expect(komponente.isAddingSource()).toBe(true);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Quelle konnte nicht angelegt werden.',
      persistent: true,
    });
  });
});

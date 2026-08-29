import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase, PurchaseType } from '../../../../core/models/flipbase.models';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { PurchaseCreateModalComponent } from './purchase-create-modal.component';

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
    PurchaseCreateModalComponent.prototype,
  ) as PurchaseCreateModalComponent;

  Object.assign(komponente, {
    purchase: () => vorhandener,
    purchaseService,
    sourcesService,
    suppliersService,
    trackingService: { autoDetectCarrier: vi.fn(() => 'dhl') },
    toast,
    syncStatus: new SyncStatusService(),
    created,
    closed,
    isSubmitting: signal(false),
    errorMessage: signal<string | null>(null),
    isAddingSource: signal(true),
    isAddingSupplier: signal(true),
    newSourceName: signal('Flohmarkt'),
    newSupplierName: signal('Lieferant GmbH'),
    extraCosts: signal([]),
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
      purchase_price: new FormControl(50, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)],
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
    created,
    closed,
    purchaseService,
    sourcesService,
    suppliersService,
  };
}

describe('PurchaseCreateModalComponent – zentrale Aktionsmeldungen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

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
        unitPurchasePrice: 4.99,
        lineTotal: 24.95,
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
            unitPurchasePrice: 4.99,
            lineTotal: 24.95,
          },
        ],
      }),
    );
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

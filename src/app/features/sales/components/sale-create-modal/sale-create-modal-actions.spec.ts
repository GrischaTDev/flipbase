import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Sale, StockPosition } from '../../../../core/models/flipbase.models';
import { InventoryService } from '../../../../core/services/inventory.service';
import { ProfitEngineService } from '../../../../core/services/profit-engine.service';
import { SalesService } from '../../../../core/services/sales.service';
import { StockService } from '../../../../core/services/stock.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SaleCreateModalComponent } from './sale-create-modal.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const artikel: InventoryItem = {
  id: 'item-1',
  workspace_id: 'workspace-1',
  title: 'Testartikel',
  condition: 'used',
  status: 'ready',
  allocated_purchase_cost: 20,
};
const ledLampId = 'led-lamp-1';
const position: StockPosition = {
  catalog_product_id: ledLampId,
  title: 'LED-Lampe',
  available_quantity: 3,
  reserved_quantity: 0,
  on_hand_quantity: 3,
  oldest_available_unit_cost: 4,
  is_public_store: false,
};
const verkauf: Sale = {
  id: 'sale-1',
  workspace_id: 'workspace-1',
  inventory_item_id: artikel.id,
  platform: 'kleinanzeigen',
  sale_price: 50,
  sale_date: '2026-08-24',
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
};

function erstelleKomponente(bestehenderVerkauf: Sale | null = null) {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const created = { emit: vi.fn() };
  const closed = { emit: vi.fn() };
  const salesService = {
    recordSale: vi.fn(
      async (_payload: unknown): Promise<{ data: unknown; error: Error | null }> => ({
        data: { sale: verkauf },
        error: null,
      }),
    ),
    updateSale: vi.fn(async () => ({ data: verkauf, error: null })),
  };
  const komponente = Object.create(SaleCreateModalComponent.prototype) as SaleCreateModalComponent;
  Object.assign(komponente, {
    salesService,
    inventoryService: { items: signal([artikel]) },
    stockService: { positions: signal([position]) },
    profitEngine: { calculateProfit: vi.fn(() => 30), calculateRoi: vi.fn(() => 150) },
    toast,
    syncStatus,
    sale: signal(bestehenderVerkauf),
    isSubmitting: signal(false),
    isPersisted: signal(false),
    errorMessage: signal<string | null>(null),
    istBearbeitung: () => bestehenderVerkauf !== null,
    totalPrice: () => 19.98,
    created,
    closed,
    form: new FormGroup({
      lines: new FormArray([
        new FormGroup({
          target: new FormControl(`catalog:${ledLampId}`, {
            nonNullable: true,
            validators: [Validators.required],
          }),
          quantity: new FormControl(2, { nonNullable: true, validators: [Validators.required] }),
          unitSalePrice: new FormControl(9.99, {
            nonNullable: true,
            validators: [Validators.required],
          }),
        }),
      ]),
      platform: new FormControl('ebay', { nonNullable: true, validators: [Validators.required] }),
      saleDate: new FormControl('2026-08-26', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      platformFee: new FormControl(0, { nonNullable: true }),
      shippingCost: new FormControl(0, { nonNullable: true }),
      packagingCost: new FormControl(0, { nonNullable: true }),
      otherCosts: new FormControl(0, { nonNullable: true }),
      externalOrderId: new FormControl('', { nonNullable: true }),
      buyerNotes: new FormControl('', { nonNullable: true }),
    }),
  });
  Object.assign(komponente, { lines: komponente.form.controls.lines });
  if (bestehenderVerkauf) {
    komponente.lines.at(0).controls.target.setValue(`inventory:${artikel.id}`);
    komponente.lines.at(0).controls.quantity.setValue(1);
    komponente.lines.at(0).controls.unitSalePrice.setValue(50);
  }
  return { komponente, created, closed, salesService, syncStatus, toast };
}

describe('SaleCreateModalComponent – Aktionsmeldungen', () => {
  it('aktualisiert Gesamtpreis, Live-Kennzahlen und Legacy-Payload bei Formänderungen', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SalesService, useValue: { recordSale: vi.fn(), updateSale: vi.fn() } },
        { provide: InventoryService, useValue: { items: signal([artikel]) } },
        { provide: StockService, useValue: { positions: signal([position]) } },
        {
          provide: ProfitEngineService,
          useValue: {
            calculateProfit: (revenue: number, costs: number) => revenue - costs,
            calculateRoi: (profit: number, costs: number) =>
              costs === 0 ? 0 : (profit / costs) * 100,
          },
        },
        { provide: ToastService, useValue: new ToastService() },
        { provide: SyncStatusService, useValue: new SyncStatusService() },
      ],
    });
    const komponente = TestBed.runInInjectionContext(() => new SaleCreateModalComponent());
    const line = komponente.lines.at(0);
    line.controls.target.setValue(`inventory:${artikel.id}`);
    line.controls.unitSalePrice.setValue(50);

    expect(komponente.totalPrice()).toBe(50);
    expect(komponente.liveMetrics()).toMatchObject({ totalCosts: 20, profit: 30 });

    line.controls.unitSalePrice.setValue(65);
    komponente.form.controls.platformFee.setValue(5);

    expect(komponente.totalPrice()).toBe(65);
    expect(komponente.liveMetrics()).toMatchObject({ totalCosts: 25, profit: 40 });
    expect(
      (
        komponente as unknown as {
          legacyUpdatePayload: () => { sale_price: number };
        }
      ).legacyUpdatePayload().sale_price,
    ).toBe(65);
    TestBed.resetTestingModule();
  });

  it('übergibt einen Mengenverkauf mit Plattform und Datum an den atomaren Adapter', async () => {
    const { komponente, salesService, created, closed } = erstelleKomponente();
    await komponente.onSubmit();
    const payload = salesService.recordSale.mock.calls[0]?.[0] as {
      lines: unknown[];
      platform: string;
      saleDate: string;
    };
    expect(payload.lines).toEqual([
      { catalogProductId: ledLampId, titleSnapshot: 'LED-Lampe', quantity: 2, unitSalePrice: 9.99 },
    ]);
    expect(payload.platform).toBe('ebay');
    expect(payload.saleDate).toBe('2026-08-26');
    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
  });

  it('behält den Dialog bei einem lokalen Speicherfehler offen und meldet ihn persistent', async () => {
    const { komponente, closed, salesService, toast } = erstelleKomponente();
    salesService.recordSale.mockResolvedValue({
      data: null,
      error: new Error('Speichern fehlgeschlagen'),
    });
    await komponente.onSubmit();
    expect(komponente.errorMessage()).toBe('Speichern fehlgeschlagen');
    expect(closed.emit).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Verkauf konnte nicht abgeschlossen werden.',
      description: 'Speichern fehlgeschlagen',
      persistent: true,
    });
  });

  it('erzeugt für einen zentral gemeldeten Speicherfehler keinen zweiten Toast', async () => {
    const { komponente, salesService, syncStatus, toast } = erstelleKomponente();
    const fehler = syncStatus.melde('Speichern des Verkaufs', new Error('offline'));
    salesService.recordSale.mockResolvedValue({ data: null, error: fehler });
    await komponente.onSubmit();
    expect(toast.toasts()).toEqual([]);
  });

  it('bestätigt das Bearbeiten eines Verkaufs mit einem eigenen Erfolgstitel', async () => {
    const { komponente, toast } = erstelleKomponente(verkauf);
    await komponente.onSubmit();
    expect(toast.toasts()[0].title).toBe('Verkauf wurde gespeichert.');
  });
});

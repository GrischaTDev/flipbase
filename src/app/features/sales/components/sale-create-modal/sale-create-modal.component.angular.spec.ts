import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InventoryItem,
  InventoryItemSaleState,
  ItemStatus,
  Sale,
  StockPosition,
} from '../../../../core/models/flipbase.models';
import { InventoryService } from '../../../../core/services/inventory.service';
import { ProfitEngineService } from '../../../../core/services/profit-engine.service';
import { RecordSaleInput, SalesService } from '../../../../core/services/sales.service';
import { StockService } from '../../../../core/services/stock.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { SaleCreateModalComponent } from './sale-create-modal.component';

describe('SaleCreateModalComponent', () => {
  describe('Aktionsmeldungen', () => {
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
        recordLegacySale: vi.fn(async () => ({ data: { sale: verkauf }, error: null })),
        updateSale: vi.fn(async () => ({ data: verkauf, error: null })),
      };
      const komponente = Object.create(
        SaleCreateModalComponent.prototype,
      ) as SaleCreateModalComponent;
      Object.assign(komponente, {
        salesService,
        inventoryService: { items: signal([artikel]) },
        stockService: { positions: signal([position]) },
        profitEngine: {
          calculateProfit: vi.fn(() => 30),
          calculateMargin: vi.fn(() => 60),
          calculateRoi: vi.fn(() => 150),
        },
        toast,
        syncStatus,
        sale: signal(bestehenderVerkauf),
        legacyReconciliation: signal(null),
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
              quantity: new FormControl(2, {
                nonNullable: true,
                validators: [Validators.required],
              }),
              unitSalePrice: new FormControl(9.99, {
                nonNullable: true,
                validators: [Validators.required],
              }),
            }),
          ]),
          platform: new FormControl('ebay', {
            nonNullable: true,
            validators: [Validators.required],
          }),
          saleDate: new FormControl('2026-08-26', {
            nonNullable: true,
            validators: [Validators.required],
          }),
          platformFee: new FormControl(0, { nonNullable: true }),
          shippingCost: new FormControl(0, { nonNullable: true }),
          shippingRevenue: new FormControl(0, { nonNullable: true }),
          shippingMode: new FormControl('seller_arranged', { nonNullable: true }),
          additionalCosts: new FormArray([]),
          packagingCost: new FormControl(0, { nonNullable: true }),
          otherCosts: new FormControl(0, { nonNullable: true }),
          externalOrderId: new FormControl('', { nonNullable: true }),
          buyerNotes: new FormControl('', { nonNullable: true }),
        }),
      });
      Object.assign(komponente, {
        lines: komponente.form.controls.lines,
        additionalCosts: komponente.form.controls.additionalCosts,
        grossRevenue: () =>
          komponente.totalPrice() + komponente.form.controls.shippingRevenue.value,
      });
      if (bestehenderVerkauf) {
        komponente.lines.at(0).controls.target.setValue(`inventory:${artikel.id}`);
        komponente.lines.at(0).controls.quantity.setValue(1);
        komponente.lines.at(0).controls.unitSalePrice.setValue(50);
      }
      return { komponente, created, closed, salesService, syncStatus, toast };
    }

    describe('SaleCreateModalComponent – Aktionsmeldungen', () => {
      it('bietet exakt ready oder listed ohne aktiven Verkauf an und behandelt fehlenden Zustand fail-closed', () => {
        TestBed.resetTestingModule();
        const statuses: readonly ItemStatus[] = [
          'received',
          'needs_review',
          'researched',
          'ready',
          'listed',
          'reserved',
          'sold',
          'defective',
          'returned',
          'archived',
        ];
        const saleStates: readonly (InventoryItemSaleState | undefined)[] = [
          'no_active_sale',
          'sold',
          'legacy_sold_unverified',
          'legacy_sale_header_without_line',
          'sale_status_conflict',
          'multiple_active_sales',
          undefined,
        ];
        const items = statuses.flatMap((status) =>
          saleStates.map((saleState) => ({
            ...artikel,
            id: `${status}-${saleState ?? 'missing'}`,
            status,
            sale_state: saleState,
          })),
        );
        TestBed.configureTestingModule({
          providers: [
            { provide: SalesService, useValue: { recordSale: vi.fn(), updateSale: vi.fn() } },
            { provide: InventoryService, useValue: { items: signal(items) } },
            { provide: StockService, useValue: { positions: signal([]) } },
            {
              provide: ProfitEngineService,
              useValue: {
                calculateProfit: vi.fn(() => 0),
                calculateMargin: vi.fn(() => 0),
                calculateRoi: vi.fn(() => 0),
              },
            },
            { provide: ToastService, useValue: new ToastService() },
            { provide: SyncStatusService, useValue: new SyncStatusService() },
          ],
        });
        const component = TestBed.runInInjectionContext(() => new SaleCreateModalComponent());

        try {
          expect(component.availableItems().map(({ id }) => id)).toEqual([
            'ready-no_active_sale',
            'listed-no_active_sale',
          ]);
        } finally {
          TestBed.resetTestingModule();
        }
      });

      it('bietet kein Einzelstück eines archivierten Stammartikels zum Verkauf an', () => {
        TestBed.resetTestingModule();
        const linkedItem = {
          ...artikel,
          id: 'linked-item',
          purchase_line_id: 'line-1',
          sale_state: 'no_active_sale' as const,
        };
        const products = signal<{ id: string; archived_at: string | null }[]>([
          { id: 'product-1', archived_at: '2026-09-24T00:00:00Z' },
        ]);
        TestBed.configureTestingModule({
          providers: [
            { provide: SalesService, useValue: { recordSale: vi.fn(), updateSale: vi.fn() } },
            { provide: InventoryService, useValue: { items: signal([linkedItem]) } },
            { provide: StockService, useValue: { positions: signal([]) } },
            {
              provide: PurchaseService,
              useValue: {
                loadedWorkspaceId: signal('workspace-1'),
                purchaseLines: signal([{ id: 'line-1', catalog_product_id: 'product-1' }]),
              },
            },
            {
              provide: CatalogService,
              useValue: {
                loadedWorkspaceId: signal('workspace-1'),
                products,
              },
            },
            { provide: ToastService, useValue: new ToastService() },
            { provide: SyncStatusService, useValue: new SyncStatusService() },
          ],
        });
        const component = TestBed.runInInjectionContext(() => new SaleCreateModalComponent());
        try {
          expect(component.availableItems()).toEqual([]);
          products.set([{ id: 'product-1', archived_at: null }]);
          expect(component.availableItems().map(({ id }) => id)).toEqual(['linked-item']);
        } finally {
          TestBed.resetTestingModule();
        }
      });

      it('aktualisiert Gesamtpreis, Live-Kennzahlen und Legacy-Payload bei Formänderungen', () => {
        TestBed.configureTestingModule({
          providers: [
            { provide: SalesService, useValue: { recordSale: vi.fn(), updateSale: vi.fn() } },
            { provide: InventoryService, useValue: { items: signal([artikel]) } },
            { provide: StockService, useValue: { positions: signal([position]) } },
            {
              provide: ProfitEngineService,
              useValue: {
                calculateProfit: (revenue: number, costs: number) =>
                  Number((revenue - costs).toFixed(2)),
                calculateMargin: (profit: number, revenue: number) =>
                  revenue === 0 ? null : Number(((profit / revenue) * 100).toFixed(2)),
                calculateRoi: (profit: number, costs: number) =>
                  costs === 0 ? null : Number(((profit / costs) * 100).toFixed(2)),
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

      it('setzt Versandvorgaben nur beim Plattformwechsel und bewahrt den vollständigen Verkaufspayload', () => {
        TestBed.configureTestingModule({
          providers: [
            { provide: SalesService, useValue: { recordSale: vi.fn(), updateSale: vi.fn() } },
            { provide: InventoryService, useValue: { items: signal([artikel]) } },
            { provide: StockService, useValue: { positions: signal([position]) } },
            {
              provide: ProfitEngineService,
              useValue: {
                calculateProfit: (revenue: number, costs: number) =>
                  Number((revenue - costs).toFixed(2)),
                calculateMargin: (profit: number, revenue: number) =>
                  revenue === 0 ? null : Number(((profit / revenue) * 100).toFixed(2)),
                calculateRoi: (profit: number, costs: number) =>
                  costs === 0 ? null : Number(((profit / costs) * 100).toFixed(2)),
              },
            },
            { provide: ToastService, useValue: new ToastService() },
            { provide: SyncStatusService, useValue: new SyncStatusService() },
          ],
        });
        try {
          const component = TestBed.runInInjectionContext(() => new SaleCreateModalComponent());
          const shippingMode = component.form.get('shippingMode');
          const shippingRevenue = component.form.get('shippingRevenue');
          const additionalCosts = component.form.get('additionalCosts') as FormArray;
          const line = component.lines.at(0);
          line.controls.target.setValue(`catalog:${ledLampId}`);
          line.controls.unitSalePrice.setValue(39.99);

          component.form.controls.platform.setValue('ebay');
          expect(shippingMode?.value).toBe('seller_arranged');
          shippingRevenue?.setValue(2.99);
          component.form.controls.shippingCost.setValue(5.19);
          component.form.controls.platformFee.setValue(7.7);
          (component as unknown as { addAdditionalCost(): void }).addAdditionalCost();
          expect(additionalCosts.length).toBe(1);
          (
            component as unknown as { removeAdditionalCost(index: number): void }
          ).removeAdditionalCost(0);
          expect(additionalCosts.length).toBe(0);
          (component as unknown as { addAdditionalCost(): void }).addAdditionalCost();
          additionalCosts
            .at(0)
            .setValue({ category: 'other', description: 'Verkaufsförderung', amount: 1 });

          component.form.controls.platform.setValue('vinted');
          expect(shippingMode?.value).toBe('platform_prepaid');
          expect(shippingRevenue?.value).toBe(0);
          expect(component.form.controls.shippingCost.value).toBe(0);

          shippingMode?.setValue('seller_arranged');
          shippingRevenue?.setValue(2.99);
          component.form.controls.shippingCost.setValue(5.19);
          component.form.controls.platform.setValue('ebay');
          expect(shippingMode?.value).toBe('seller_arranged');
          expect(shippingRevenue?.value).toBe(2.99);

          expect((component as unknown as { grossRevenue(): number }).grossRevenue()).toBe(42.98);
          expect(component.liveMetrics()).toMatchObject({ profit: 25.09, margin: 58.38 });
          const payload = (
            component as unknown as { recordSalePayload(): RecordSaleInput }
          ).recordSalePayload();
          expect(payload).toMatchObject({
            shippingRevenue: 2.99,
            shippingMode: 'seller_arranged',
            additionalCosts: [{ category: 'other', description: 'Verkaufsförderung', amount: 1 }],
          });
        } finally {
          TestBed.resetTestingModule();
        }
      });

      it('bewahrt unbekannten Legacy-Versand für Vinted und Kleinanzeigen unverändert und editierbar', () => {
        TestBed.configureTestingModule({
          providers: [
            { provide: SalesService, useValue: { recordSale: vi.fn(), updateSale: vi.fn() } },
            { provide: InventoryService, useValue: { items: signal([artikel]) } },
            { provide: StockService, useValue: { positions: signal([position]) } },
            {
              provide: ProfitEngineService,
              useValue: {
                calculateProfit: (revenue: number, costs: number) => revenue - costs,
                calculateMargin: () => null,
                calculateRoi: () => null,
              },
            },
            { provide: ToastService, useValue: new ToastService() },
            { provide: SyncStatusService, useValue: new SyncStatusService() },
          ],
        });
        try {
          const component = TestBed.runInInjectionContext(() => new SaleCreateModalComponent());
          const fillExistingSale = component as unknown as { fillExistingSale(sale: Sale): void };
          for (const platform of ['vinted', 'kleinanzeigen'] as const) {
            fillExistingSale.fillExistingSale({
              ...verkauf,
              platform,
              shipping_cost: 5.19,
              shipping_revenue: 2.99,
              shipping_mode: null,
            });
            expect(component.form.controls.shippingMode.value).toBe('unknown');
            expect(component.form.controls.shippingCost.value).toBe(5.19);
            expect(component.form.controls.shippingRevenue.value).toBe(2.99);
            expect(component.form.controls.shippingCost.disabled).toBe(false);
            expect(component.form.controls.shippingRevenue.disabled).toBe(false);
            expect(
              (component as unknown as { recordSalePayload(): RecordSaleInput }).recordSalePayload()
                .shippingMode,
            ).toBeUndefined();
          }
        } finally {
          TestBed.resetTestingModule();
        }
      });

      it('übernimmt strukturierte Zusatzkosten eines bestehenden Verkaufs in Kennzahlen und Summen', () => {
        TestBed.configureTestingModule({
          providers: [
            { provide: SalesService, useValue: { recordSale: vi.fn(), updateSale: vi.fn() } },
            { provide: InventoryService, useValue: { items: signal([artikel]) } },
            { provide: StockService, useValue: { positions: signal([position]) } },
            {
              provide: ProfitEngineService,
              useValue: {
                calculateProfit: (revenue: number, costs: number) => revenue - costs,
                calculateMargin: () => null,
                calculateRoi: () => null,
              },
            },
            { provide: ToastService, useValue: new ToastService() },
            { provide: SyncStatusService, useValue: new SyncStatusService() },
          ],
        });
        try {
          const component = TestBed.runInInjectionContext(() => new SaleCreateModalComponent());
          (component as unknown as { fillExistingSale(sale: Sale): void }).fillExistingSale({
            ...verkauf,
            cost_entries: [
              {
                id: 'cost-1',
                workspace_id: 'workspace-1',
                sale_id: verkauf.id,
                category: 'packaging',
                description: 'Karton',
                amount: 2.5,
              },
              {
                id: 'cost-2',
                workspace_id: 'workspace-1',
                sale_id: verkauf.id,
                category: 'promotion',
                description: 'Anzeige',
                amount: 1.2,
              },
            ],
          });

          expect(component.additionalCosts.getRawValue()).toEqual([
            { category: 'packaging', description: 'Karton', amount: 2.5 },
            { category: 'promotion', description: 'Anzeige', amount: 1.2 },
          ]);
          expect(component.liveMetrics().sellingCosts).toBe(3.7);
          expect(
            (
              component as unknown as {
                legacyUpdatePayload(): { packaging_cost: number; other_costs: number };
              }
            ).legacyUpdatePayload(),
          ).toMatchObject({ packaging_cost: 2.5, other_costs: 1.2 });
        } finally {
          TestBed.resetTestingModule();
        }
      });

      it('synthetisiert aggregierte Legacy-Zusatzkosten, wenn Kostenzeilen fehlen', () => {
        TestBed.configureTestingModule({
          providers: [
            { provide: SalesService, useValue: { recordSale: vi.fn(), updateSale: vi.fn() } },
            { provide: InventoryService, useValue: { items: signal([artikel]) } },
            { provide: StockService, useValue: { positions: signal([position]) } },
            {
              provide: ProfitEngineService,
              useValue: {
                calculateProfit: (revenue: number, costs: number) => revenue - costs,
                calculateMargin: () => null,
                calculateRoi: () => null,
              },
            },
            { provide: ToastService, useValue: new ToastService() },
            { provide: SyncStatusService, useValue: new SyncStatusService() },
          ],
        });
        try {
          const component = TestBed.runInInjectionContext(() => new SaleCreateModalComponent());
          (component as unknown as { fillExistingSale(sale: Sale): void }).fillExistingSale({
            ...verkauf,
            packaging_cost: 3,
            other_costs: 4,
          });

          expect(component.additionalCosts.getRawValue()).toEqual([
            { category: 'packaging', description: '', amount: 3 },
            { category: 'other', description: 'Übernommene Altdaten-Kosten', amount: 4 },
          ]);
          expect(component.liveMetrics().sellingCosts).toBe(7);
          expect(
            (
              component as unknown as {
                legacyUpdatePayload(): { packaging_cost: number; other_costs: number };
              }
            ).legacyUpdatePayload(),
          ).toMatchObject({ packaging_cost: 3, other_costs: 4 });
        } finally {
          TestBed.resetTestingModule();
        }
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
          {
            catalogProductId: ledLampId,
            titleSnapshot: 'LED-Lampe',
            quantity: 2,
            unitSalePrice: 9.99,
          },
        ]);
        expect(payload.platform).toBe('ebay');
        expect(payload.saleDate).toBe('2026-08-26');
        expect(created.emit).toHaveBeenCalledOnce();
        expect(closed.emit).toHaveBeenCalledOnce();
      });

      it('verwendet für ungeklärten Altbestand ausschließlich den protokollierten Verkaufsadapter', async () => {
        const { komponente, salesService } = erstelleKomponente();
        Object.assign(komponente, {
          legacyReconciliation: signal({
            kind: 'legacy_sold_unverified',
            inventoryItemId: artikel.id,
          }),
        });
        komponente.lines.at(0).controls.target.setValue(`inventory:${artikel.id}`);
        komponente.lines.at(0).controls.quantity.setValue(1);
        komponente.lines.at(0).controls.unitSalePrice.setValue(50);

        await komponente.onSubmit();

        expect(salesService.recordLegacySale).toHaveBeenCalledWith(
          artikel.id,
          expect.objectContaining({
            lines: [expect.objectContaining({ inventoryItemId: artikel.id, quantity: 1 })],
          }),
        );
        expect(salesService.recordSale).not.toHaveBeenCalled();
      });

      it('lehnt einen historischen Verkaufsnachtrag mit mehreren Positionen ab', () => {
        const { komponente } = erstelleKomponente();

        expect(() =>
          validiereHistorischenVerkauf(komponente, artikel.id, {
            ...gueltigerHistorischerInput(),
            lines: [gueltigerHistorischerInput().lines[0], gueltigerHistorischerInput().lines[0]],
          }),
        ).toThrow('Der historische Verkaufsnachtrag ist unvollständig oder wurde verändert.');
      });

      it('lehnt einen historischen Verkaufsnachtrag für einen anderen Artikel ab', () => {
        const { komponente } = erstelleKomponente();

        expect(() =>
          validiereHistorischenVerkauf(komponente, artikel.id, {
            ...gueltigerHistorischerInput(),
            lines: [{ ...gueltigerHistorischerInput().lines[0], inventoryItemId: 'item-2' }],
          }),
        ).toThrow('Der historische Verkaufsnachtrag ist unvollständig oder wurde verändert.');
      });

      it('lehnt einen historischen Verkaufsnachtrag mit einer Menge ungleich eins ab', () => {
        const { komponente } = erstelleKomponente();

        expect(() =>
          validiereHistorischenVerkauf(komponente, artikel.id, {
            ...gueltigerHistorischerInput(),
            lines: [{ ...gueltigerHistorischerInput().lines[0], quantity: 2 }],
          }),
        ).toThrow('Der historische Verkaufsnachtrag ist unvollständig oder wurde verändert.');
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

    function gueltigerHistorischerInput(): RecordSaleInput {
      return {
        platform: 'ebay',
        saleDate: '2026-08-26',
        lines: [
          {
            inventoryItemId: artikel.id,
            titleSnapshot: artikel.title,
            quantity: 1,
            unitSalePrice: 50,
          },
        ],
      };
    }

    function validiereHistorischenVerkauf(
      komponente: SaleCreateModalComponent,
      inventoryItemId: string,
      input: RecordSaleInput,
    ): RecordSaleInput {
      return (
        komponente as unknown as {
          validatedLegacyInput(
            reconciliation: {
              readonly kind: 'legacy_sold_unverified';
              readonly inventoryItemId: string;
            },
            value: RecordSaleInput,
          ): RecordSaleInput;
        }
      ).validatedLegacyInput({ kind: 'legacy_sold_unverified', inventoryItemId }, input);
    }
  });

  describe('Historische Verkaufskorrektur', () => {
    interface AngularInputMetadata {
      inputs: Record<string, unknown>;
      declaredInputs: Record<string, string>;
    }

    interface MetadataSnapshot {
      readonly metadata: AngularInputMetadata;
      readonly inputs: Record<string, unknown>;
      readonly declaredInputs: Record<string, string>;
    }

    let metadataSnapshots: MetadataSnapshot[] = [];

    function bridgeInputMetadata(metadata: AngularInputMetadata, names: readonly string[]): void {
      metadataSnapshots.push({
        metadata,
        inputs: metadata.inputs,
        declaredInputs: metadata.declaredInputs,
      });
      metadata.inputs = {
        ...metadata.inputs,
        ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
      };
      metadata.declaredInputs = {
        ...metadata.declaredInputs,
        ...Object.fromEntries(names.map((name) => [name, name])),
      };
    }

    function installTestLocalInputBridges(): void {
      bridgeInputMetadata(
        (SaleCreateModalComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp,
        ['saleTarget', 'legacyReconciliation'],
      );
      bridgeInputMetadata(
        (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp,
        ['options', 'placeholder', 'size', 'ariaLabel'],
      );
      bridgeInputMetadata((DatePickerComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp, [
        'feldId',
      ]);
      bridgeInputMetadata(
        (ModalDialogDirective as unknown as { ɵdir: AngularInputMetadata }).ɵdir,
        ['dialogTitel'],
      );
      bridgeInputMetadata((ButtonComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp, [
        'variant',
        'size',
        'loading',
        'disabled',
        'icon',
        'iconPosition',
        'iconOnly',
        'fullWidth',
        'contentAlign',
        'type',
        'formId',
        'link',
        'href',
        'target',
        'queryParams',
        'ariaLabel',
        'title',
        'ariaExpanded',
        'ariaPressed',
        'ariaControls',
        'ariaHaspopup',
      ]);
      bridgeInputMetadata(
        (NumberInputComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp,
        [
          'value',
          'placeholder',
          'step',
          'min',
          'max',
          'unit',
          'id',
          'ariaLabel',
          'ariaDescribedby',
          'ariaInvalid',
          'asCurrency',
          'disabled',
          'showStepper',
          'platzhalter',
          'schritt',
          'minimum',
          'maximum',
          'einheit',
          'feldId',
          'beschriftung',
          'alsBetrag',
        ],
      );
      bridgeInputMetadata((TextFieldComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp, [
        'label',
        'labelHidden',
        'placeholder',
        'type',
        'multiline',
        'prefix',
        'suffix',
        'prefixIcon',
        'clearable',
        'monospaced',
        'error',
        'helpText',
        'disabled',
        'id',
        'ariaLabel',
        'ariaRequired',
        'ariaDescribedby',
        'ariaInvalid',
        'autocomplete',
        'required',
        'maxLength',
        'value',
      ]);
    }

    function restoreInputMetadata(): void {
      for (const snapshot of metadataSnapshots) {
        snapshot.metadata.inputs = snapshot.inputs;
        snapshot.metadata.declaredInputs = snapshot.declaredInputs;
      }
      metadataSnapshots = [];
    }

    async function resolveTemplateResources(): Promise<void> {
      await ɵresolveComponentResources((url) =>
        readdir(resolve('src/app'), { recursive: true }).then((files) => {
          const matches = files.filter((file) => file.split(/[\\/]/).at(-1) === url.slice(2));
          if (matches.length !== 1) throw new Error(`Unbekannte Test-Ressource: ${url}`);
          return readFile(resolve('src/app', matches[0]), 'utf8');
        }),
      );
    }

    beforeAll(async () => {
      registerLocaleData(localeDe);
      await resolveTemplateResources();
    });
    beforeEach(() => installTestLocalInputBridges());
    afterEach(() => {
      try {
        TestBed.resetTestingModule();
      } finally {
        restoreInputMetadata();
      }
    });

    async function erstelleGerendertenDialog() {
      const items = signal<InventoryItem[]>([]);
      const positions = signal<StockPosition[]>([]);
      const salesService = {
        recordSale: vi.fn(async () => ({ data: null, error: null })),
        recordLegacySale: vi.fn(async () => ({ data: null, error: null })),
        updateSale: vi.fn(async () => ({ data: null, error: null })),
      };
      TestBed.configureTestingModule({
        imports: [SaleCreateModalComponent],
        providers: [
          { provide: SalesService, useValue: salesService },
          { provide: InventoryService, useValue: { items } },
          { provide: StockService, useValue: { positions } },
          {
            provide: ProfitEngineService,
            useValue: {
              calculateProfit: () => 0,
              calculateMargin: () => null,
              calculateRoi: () => null,
            },
          },
          { provide: ToastService, useValue: new ToastService() },
          { provide: SyncStatusService, useValue: new SyncStatusService() },
        ],
      });
      await TestBed.compileComponents();
      const fixture = TestBed.createComponent(SaleCreateModalComponent);
      fixture.componentInstance.form.controls.shippingMode.setValue('seller_arranged');
      fixture.detectChanges();
      return { fixture, salesService, items, positions };
    }

    it('blendet archivierte Mengenartikel aus der neuen Verkaufsauswahl aus', async () => {
      const { fixture, positions } = await erstelleGerendertenDialog();
      positions.set([
        {
          catalog_product_id: 'active',
          title: 'Aktiv',
          available_quantity: 2,
          reserved_quantity: 0,
          on_hand_quantity: 2,
          oldest_available_unit_cost: 4,
          is_public_store: false,
          archived_at: null,
        },
        {
          catalog_product_id: 'archived',
          title: 'Archiviert',
          available_quantity: 2,
          reserved_quantity: 0,
          on_hand_quantity: 2,
          oldest_available_unit_cost: 4,
          is_public_store: false,
          archived_at: '2026-09-24',
        },
      ]);
      fixture.detectChanges();
      expect(fixture.componentInstance.targetOptions().map((option) => option.value)).toContain(
        'catalog:active',
      );
      expect(fixture.componentInstance.targetOptions().map((option) => option.value)).not.toContain(
        'catalog:archived',
      );
    });

    describe('SaleCreateModalComponent – historische Verkaufskorrektur', () => {
      it('zeigt den automatischen Protokollhinweis ohne manuelles Grundfeld', async () => {
        TestBed.configureTestingModule({
          imports: [SaleCreateModalComponent],
          providers: [
            {
              provide: SalesService,
              useValue: { recordSale: vi.fn(), recordLegacySale: vi.fn(), updateSale: vi.fn() },
            },
            { provide: InventoryService, useValue: { items: signal([]) } },
            { provide: StockService, useValue: { positions: signal([]) } },
            {
              provide: ProfitEngineService,
              useValue: {
                calculateProfit: () => 0,
                calculateMargin: () => null,
                calculateRoi: () => null,
              },
            },
            { provide: ToastService, useValue: new ToastService() },
            { provide: SyncStatusService, useValue: new SyncStatusService() },
          ],
        });
        await resolveTemplateResources();
        await TestBed.compileComponents();
        const fixture = TestBed.createComponent(SaleCreateModalComponent);
        fixture.componentRef.setInput('saleTarget', {
          kind: 'inventory_item',
          inventoryItemId: 'item-1',
          title: 'Testartikel',
        });
        fixture.componentRef.setInput('legacyReconciliation', {
          kind: 'legacy_sold_unverified',
          inventoryItemId: 'item-1',
        });
        fixture.detectChanges();

        expect(fixture.componentInstance.saleTarget()).toEqual({
          kind: 'inventory_item',
          inventoryItemId: 'item-1',
          title: 'Testartikel',
        });
        expect(fixture.componentInstance.legacyReconciliation()).toEqual({
          kind: 'legacy_sold_unverified',
          inventoryItemId: 'item-1',
        });
        const host = fixture.nativeElement as HTMLElement;
        expect(host.textContent).toContain('Historischen Verkauf nachtragen');
        expect(host.textContent).toContain('Diese Korrektur wird automatisch protokolliert.');
        expect(host.textContent).not.toContain('Dokumentierter Grund');
        expect(host.textContent).not.toContain('Legacy');
        expect(host.querySelector('#reconciliation-reason')).toBeNull();
      });

      it('zeigt fehlende Artikelkosten offen und berechnet echte Nullkosten nach dem Laden', async () => {
        const { fixture, items } = await erstelleGerendertenDialog();
        const component = fixture.componentInstance;
        const line = component.lines.at(0);
        line.controls.target.setValue('inventory:missing');
        line.controls.unitSalePrice.setValue(50);
        component.form.controls.platformFee.setValue(5);
        fixture.detectChanges();

        const summary = fixture.nativeElement.querySelector('[data-sale-summary]') as HTMLElement;
        expect(component.liveMetrics()).toMatchObject({
          costOfGoods: null,
          totalCosts: null,
          profit: null,
          margin: null,
          sellingCosts: 5,
        });
        expect(summary.textContent?.match(/Kosten prüfen/g)).toHaveLength(2);
        expect(summary.textContent).not.toContain('45,00');

        items.set([
          {
            id: 'missing',
            workspace_id: 'workspace-1',
            title: 'Geschenk',
            condition: 'used',
            status: 'ready',
            allocated_purchase_cost: 0,
          },
        ]);
        fixture.detectChanges();
        expect(component.liveMetrics()).toMatchObject({
          costOfGoods: 0,
          totalCosts: 5,
          profit: 45,
          margin: 90,
        });
        expect(summary.textContent).not.toContain('Kosten prüfen');
        expect(summary.textContent).toContain('45,00');
      });

      it('ignoriert veraltete Gesamtwerte bei ausdrücklich offenen Paketkosten', async () => {
        const { fixture, items } = await erstelleGerendertenDialog();
        items.set([
          {
            id: 'package-content',
            workspace_id: 'workspace-1',
            title: 'Schuh',
            condition: 'used',
            status: 'ready',
            allocated_purchase_cost: null,
            total_item_cost: 0,
            source_package_line_id: 'package',
          },
        ]);
        fixture.componentInstance.lines
          .at(0)
          .setValue({ target: 'inventory:package-content', quantity: 1, unitSalePrice: 50 });
        fixture.detectChanges();
        expect(fixture.componentInstance.liveMetrics()).toMatchObject({
          costOfGoods: null,
          profit: null,
          margin: null,
        });
        expect(fixture.nativeElement.querySelector('[data-sale-summary]').textContent).toContain(
          'Kosten prüfen',
        );
      });

      it('lässt bei einer fehlenden Lagerkostenbasis auch gemischte Positionssummen offen', async () => {
        const { fixture, items, positions } = await erstelleGerendertenDialog();
        items.set([
          {
            id: 'known',
            workspace_id: 'workspace-1',
            title: 'Bekannt',
            condition: 'used',
            status: 'ready',
            allocated_purchase_cost: 20,
          },
        ]);
        positions.set([
          {
            catalog_product_id: 'product',
            title: 'Produkt',
            available_quantity: 3,
            reserved_quantity: 0,
            on_hand_quantity: 3,
            oldest_available_unit_cost: null,
            is_public_store: false,
          },
        ]);
        const component = fixture.componentInstance;
        component.lines
          .at(0)
          .setValue({ target: 'inventory:known', quantity: 1, unitSalePrice: 50 });
        component.addLine();
        component.lines
          .at(1)
          .setValue({ target: 'catalog:product', quantity: 2, unitSalePrice: 10 });
        fixture.detectChanges();
        expect(component.liveMetrics()).toMatchObject({
          costOfGoods: null,
          profit: null,
          margin: null,
        });
        expect(fixture.nativeElement.querySelector('[data-sale-summary]').textContent).toContain(
          'Kosten prüfen',
        );

        positions.update((entries) =>
          entries.map((entry) => ({ ...entry, oldest_available_unit_cost: 4 })),
        );
        fixture.detectChanges();
        expect(component.liveMetrics()).toMatchObject({ costOfGoods: 28, profit: 42, margin: 60 });
      });

      it('zeigt dauerhaft beschriftete Einnahmen, Kosten, Notiz und verständliche Kennzahlen', async () => {
        TestBed.configureTestingModule({
          imports: [SaleCreateModalComponent],
          providers: [
            {
              provide: SalesService,
              useValue: { recordSale: vi.fn(), recordLegacySale: vi.fn(), updateSale: vi.fn() },
            },
            { provide: InventoryService, useValue: { items: signal([]) } },
            { provide: StockService, useValue: { positions: signal([]) } },
            {
              provide: ProfitEngineService,
              useValue: {
                calculateProfit: () => 0,
                calculateMargin: () => null,
                calculateRoi: () => null,
              },
            },
            { provide: ToastService, useValue: new ToastService() },
            { provide: SyncStatusService, useValue: new SyncStatusService() },
          ],
        });
        await TestBed.compileComponents();
        const fixture = TestBed.createComponent(SaleCreateModalComponent);
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.textContent).toContain('Einnahmen');
        expect(host.textContent).toContain('Verkaufskosten');
        expect(host.textContent).toContain('Zusätzliche Kosten');
        expect(host.textContent).toContain('Notiz');
        expect(host.textContent).toContain('Ergebnis nach direkten Kosten');
        expect(host.textContent).toContain('Marge');
        expect(host.textContent).not.toContain('Kapitalrendite');
        expect(host.textContent).not.toContain('Gewinn ÷ eingesetztes Kapital × 100');
        expect(host.textContent).toContain('–');
        expect(host.querySelector('details')).toBeNull();
        expect(host.querySelector('label[for="shipping-revenue"]')).not.toBeNull();
        expect(host.querySelector('label[for="shipping-cost"]')).not.toBeNull();
        fixture.componentInstance.form.controls.shippingMode.setValue('seller_arranged');
        fixture.detectChanges();
        expect((host.querySelector('#shipping-revenue') as HTMLInputElement).disabled).toBe(false);
        expect((host.querySelector('#shipping-cost') as HTMLInputElement).disabled).toBe(false);
        fixture.componentInstance.form.controls.shippingMode.setValue('pickup');
        fixture.detectChanges();
        expect((host.querySelector('#shipping-revenue') as HTMLInputElement).disabled).toBe(true);
        expect((host.querySelector('#shipping-cost') as HTMLInputElement).disabled).toBe(true);
      });

      it('kennzeichnet die fehlende Beschreibung für sonstige Kosten nach Berührung zugänglich', async () => {
        TestBed.configureTestingModule({
          imports: [SaleCreateModalComponent],
          providers: [
            {
              provide: SalesService,
              useValue: { recordSale: vi.fn(), recordLegacySale: vi.fn(), updateSale: vi.fn() },
            },
            { provide: InventoryService, useValue: { items: signal([]) } },
            { provide: StockService, useValue: { positions: signal([]) } },
            {
              provide: ProfitEngineService,
              useValue: {
                calculateProfit: () => 0,
                calculateMargin: () => null,
                calculateRoi: () => null,
              },
            },
            { provide: ToastService, useValue: new ToastService() },
            { provide: SyncStatusService, useValue: new SyncStatusService() },
          ],
        });
        await TestBed.compileComponents();
        const fixture = TestBed.createComponent(SaleCreateModalComponent);
        fixture.componentInstance.addAdditionalCost();
        const cost = fixture.componentInstance.additionalCosts.at(0);
        cost.controls.category.setValue('other');
        cost.controls.description.markAsTouched();
        fixture.detectChanges();

        const description = fixture.nativeElement.querySelector(
          '#cost-description-0',
        ) as HTMLInputElement;
        expect(description.getAttribute('aria-required')).toBe('true');
        expect(description.getAttribute('aria-invalid')).toBe('true');
        expect(description.getAttribute('aria-describedby')).toContain('cost-description-error-0');
        expect(fixture.nativeElement.textContent).toContain(
          'Bitte beschreiben Sie diese sonstigen Kosten.',
        );
      });

      it('kennzeichnet negative Geldbeträge sichtbar und mit den zugehörigen ARIA-Fehlern', async () => {
        const { fixture } = await erstelleGerendertenDialog();
        const component = fixture.componentInstance;
        component.addAdditionalCost();
        component.form.controls.shippingRevenue.setValue(-1);
        component.form.controls.platformFee.setValue(-2);
        component.form.controls.shippingCost.setValue(-3);
        component.additionalCosts.at(0).controls.amount.setValue(-4);
        component.form.markAllAsTouched();
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const assertions = [
          ['#shipping-revenue', 'shipping-revenue-error'],
          ['#platform-fee', 'platform-fee-error'],
          ['#shipping-cost', 'shipping-cost-error'],
          ['#cost-amount-0', 'cost-amount-error-0'],
        ] as const;
        for (const [selector, errorId] of assertions) {
          const input = host.querySelector(selector) as HTMLInputElement;
          expect(input.getAttribute('aria-invalid')).toBe('true');
          expect(input.getAttribute('aria-describedby')).toContain(errorId);
        }
        expect(host.textContent).toContain('Der Versand-Erlös darf nicht negativ sein.');
        expect(host.textContent).toContain('Die Plattformgebühr darf nicht negativ sein.');
        expect(host.textContent).toContain(
          'Die tatsächlichen Versandkosten dürfen nicht negativ sein.',
        );
        expect(host.textContent).toContain('Der Betrag darf nicht negativ sein.');
      });

      it('lässt invalides Absenden zu, markiert alle Felder und fokussiert das erste fehlerhafte Feld', async () => {
        const { fixture, salesService } = await erstelleGerendertenDialog();
        const component = fixture.componentInstance;
        component.lines.at(0).controls.target.setValue('catalog:test-product');
        component.lines.at(0).controls.unitSalePrice.setValue(1);
        component.form.controls.shippingRevenue.setValue(-1);
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const submitButton = host.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(submitButton.disabled).toBe(false);

        await component.onSubmit();
        fixture.detectChanges();
        await fixture.whenStable();

        const shippingRevenue = host.querySelector('#shipping-revenue') as HTMLInputElement;
        expect(component.form.controls.shippingRevenue.touched).toBe(true);
        expect(shippingRevenue.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(shippingRevenue);
        expect(salesService.recordSale).not.toHaveBeenCalled();
      });
    });
  });
});

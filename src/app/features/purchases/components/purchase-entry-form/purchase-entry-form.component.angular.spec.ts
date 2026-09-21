import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase, PurchaseType, Source } from '../../../../core/models/flipbase.models';
import type { PendingPurchaseDocument } from '../../../../core/models/purchase-document.models';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { InboundTrackingService } from '../../../../core/services/inbound-tracking.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { SourcesService } from '../../../../core/services/sources.service';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { PurchaseCostDraft } from '../purchase-cost-editor/purchase-cost-editor.component';
import { PurchaseCostOverviewValue } from '../purchase-cost-editor/purchase-cost-adjustments';
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
  supplier_id: 'supplier-nord',
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
  const documentService = {
    upload: vi.fn(async (): Promise<{ data: null; error: Error | null }> => ({
      data: null,
      error: null,
    })),
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
    suppliers: signal([
      {
        id: 'supplier-nord',
        workspace_id: 'workspace-1',
        name: 'Großhandel Nord',
        seller_type: 'business' as const,
        street: 'Hafenstraße 1',
        postal_code: '20457',
        city: 'Hamburg',
        country_code: 'DE',
        email: 'einkauf@nord.example',
      },
    ]),
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
    requestId: 'test-request-id',
    purchaseService,
    purchaseCostingService,
    documentService,
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
    pendingDocuments: signal<readonly PendingPurchaseDocument[]>([]),
    packagePriceDialogOpen: signal(false),
    confirmedPackageFingerprint: signal<string | null>(null),
    packagePriceStale: signal(false),
    completed: signal(false),
    sellerDialogOpen: signal(false),
    sellerAddressExpanded: signal(false),
    lineEditor: () => undefined,
    costOverviewDialog: () => undefined,
    sourceDialogOpen: signal(false),
    sourceDialog: () => undefined,
    costDialogOpen: signal(false),
    costDrafts: signal<readonly PurchaseCostDraft[]>([]),
    initialCostDrafts: signal<readonly PurchaseCostDraft[]>([]),
    areAdditionalCostsValid: signal(true),
    purchaseBasePrice: signal<number | null>(50),
    purchaseLines: signal([]),
    hasPackages: () => komponente.purchaseLines().some((line) => line.isPackage),
    baselinePurchaseLines: signal([]),
    baselineCostDrafts: signal([]),
    form: new FormGroup({
      type: new FormControl<PurchaseType>('single', { nonNullable: true }),
      content_status: new FormControl('known', { nonNullable: true }),
      pricing_mode: new FormControl('individual', { nonNullable: true }),
      supplier_reference: new FormControl('', { nonNullable: true }),
      discount_amount: new FormControl(0, { nonNullable: true }),
      title: new FormControl('Konsole', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
      source_id: new FormControl<string | null>(null),
      supplier_id: new FormControl<string | null>('supplier-nord', {
        validators: [Validators.required],
      }),
      purchase_date: new FormControl('2026-08-24', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      purchase_price: new FormControl<number | null>(50, {
        validators: [Validators.min(0)],
      }),
      tracking_number: new FormControl('', { nonNullable: true }),
      tracking_carrier: new FormControl<'dhl' | null>(null),
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
    documentService,
    sourcesService,
    suppliersService,
  };
}

function pendingDocument(name: string): PendingPurchaseDocument {
  return {
    id: `pending-${name}`,
    file: new File(['pdf'], name, { type: 'application/pdf' }),
    documentType: 'invoice',
    status: 'pending',
    error: null,
  };
}

describe('PurchaseEntryFormComponent – zentrale Aktionsmeldungen', () => {
  it('zeigt die Belegkachel in der rechten Spalte nach ergänzenden Detailkarten', () => {
    const template = readFileSync(
      'src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.html',
      'utf8',
    );
    const sidebar = template.indexOf('data-testid="purchase-entry-sidebar"');
    const extras = template.indexOf('data-testid="purchase-entry-sidebar-extra"', sidebar);
    const documents = template.indexOf('<app-purchase-documents-card', sidebar);

    expect(extras).toBeGreaterThan(sidebar);
    expect(documents).toBeGreaterThan(extras);
    expect(template).toContain('[(pendingDocuments)]="pendingDocuments"');
  });

  it('lädt vorgemerkte Belege erst nach erfolgreicher Einkaufserstellung hoch', async () => {
    const { komponente, purchaseService, documentService } = erstelleKomponente();
    komponente.pendingDocuments.set([pendingDocument('rechnung.pdf')]);

    await komponente.onSubmit();

    expect(purchaseService.createPurchase).toHaveBeenCalledBefore(documentService.upload);
    expect(documentService.upload).toHaveBeenCalledWith(
      einkauf.id,
      expect.objectContaining({ name: 'rechnung.pdf' }),
      'invoice',
    );
    expect(komponente.pendingDocuments()).toEqual([]);
  });

  it('behält nur fehlgeschlagene Belege für einen erneuten Versuch', async () => {
    const { komponente, documentService, created, closed } = erstelleKomponente();
    documentService.upload
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('Upload fehlgeschlagen') });
    komponente.pendingDocuments.set([
      pendingDocument('rechnung.pdf'),
      pendingDocument('quittung.pdf'),
    ]);

    await komponente.onSubmit();

    expect(komponente.pendingDocuments()).toEqual([
      expect.objectContaining({
        file: expect.objectContaining({ name: 'quittung.pdf' }),
        status: 'error',
        error: 'Upload fehlgeschlagen',
      }),
    ]);
    expect(komponente.persistedDraft()?.id).toBe(einkauf.id);
    expect(created.emit).not.toHaveBeenCalled();
    expect(closed.emit).not.toHaveBeenCalled();
  });

  it('setzt nach dem Speichern dieselbe Maske zurück und erkennt neue Änderungen', async () => {
    const { komponente } = erstelleKomponente(einkauf);
    const resetToLines = vi.fn();
    Object.assign(komponente, {
      lineEditor: () => ({
        lineRows: { invalid: false },
        resetToLines,
        isSavingProduct: () => false,
        hasUnsavedChanges: () => false,
      }),
    });
    await komponente.onSubmit();
    komponente.form.controls.title.setValue('Verworfene Änderung');
    komponente.form.markAsDirty();
    komponente.errorMessage.set('Alter Fehler');

    komponente.resetToPurchase({ ...einkauf, title: 'Gespeicherter Einkauf', purchase_price: 80 });

    expect(komponente.form.controls.title.value).toBe('Gespeicherter Einkauf');
    expect(komponente.form.controls.purchase_price.value).toBe(80);
    expect(komponente.form.pristine).toBe(true);
    expect(komponente.errorMessage()).toBeNull();
    expect(resetToLines).toHaveBeenCalledWith([]);
    expect(komponente.hasUnsavedChanges()).toBe(false);
    komponente.form.controls.title.setValue('Neue Änderung');
    komponente.form.markAsDirty();
    expect(komponente.hasUnsavedChanges()).toBe(true);
  });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('zeigt den einfachen Einkaufskopf ohne Verkäuferdetails und Mystery-Aktionen', () => {
    const template = readFileSync(
      'src/app/features/purchases/components/purchase-entry-form/purchase-entry-form.component.html',
      'utf8',
    );

    expect(template).not.toContain('Plattform / Bezugsquelle');
    expect(template).not.toContain('Noch nicht vollständig bekannt');
    expect(template).not.toContain('Beleg / Angebotslink');
    expect(template.indexOf('formControlName="supplier_id"')).toBeLessThan(
      template.indexOf('formControlName="source_id"'),
    );
    expect(template).toContain('formControlName="source_id"');
    expect(template).not.toContain('formControlName="title"');
    expect(template).not.toContain('formControlName="seller_marketplace_username"');
    expect(template).not.toContain('formControlName="seller_type"');
    expect(template).not.toContain('formControlName="seller_name"');
    expect(template).not.toContain('data-seller-address');
    expect(template).not.toContain('formControlName="external_order_id"');
    expect(template).not.toContain('formControlName="original_url"');
    expect(template).not.toContain('Interne Notiz');
    expect(template).not.toContain('Referenz des Verkäufers');
    expect(template).toContain('actionLabel="Verkäufer erstellen"');
    expect(template).not.toContain('Paketpreis verteilen');
    expect(template).not.toContain('(optional)');
    expect(template).toContain('formControlName="notes"');
    expect(template.indexOf('title="Einkaufsdetails"')).toBeLessThan(
      template.indexOf('formControlName="purchase_date"'),
    );
    expect(template.indexOf('formControlName="purchase_date"')).toBeLessThan(
      template.indexOf('formControlName="supplier_reference"'),
    );
  });

  it('aktualisiert den Warenwert unmittelbar aus den Positionen', () => {
    const { komponente } = erstelleKomponente();
    komponente.purchaseBasePrice.set(null);

    komponente.onPurchaseLinesChanged([
      {
        catalogProductId: 'product-1',
        titleSnapshot: 'Schuhe',
        lineKind: 'quantity',
        orderedQuantity: 2,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 12.5,
        lineTotal: 25,
        estimatedMarketValue: null,
      },
    ]);

    expect(komponente.purchaseBasePrice()).toBe(25);
    expect(komponente.form.controls.purchase_price.value).toBe(25);
  });

  it('laesst eine leere Beschreibung auch im Speicherpayload leer', async () => {
    const { komponente, purchaseService } = erstelleKomponente();
    komponente.form.controls.notes.setValue('');

    await komponente.onSubmit();

    expect(purchaseService.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ title: '', notes: null }),
    );
  });

  it('oeffnet den gemeinsamen Kosteneditor mit dem aktuellen Entwurf', () => {
    const { komponente } = erstelleKomponente();
    const kosten: readonly PurchaseCostDraft[] = [
      {
        type: 'shipping',
        amount: 7.5,
        description: '',
        allocationMethod: 'by_value',
        targetPurchaseLineId: null,
      },
    ];
    komponente.costDrafts.set(kosten);

    komponente.openCostEditor();

    expect(komponente.initialCostDrafts()).toEqual(kosten);
    expect(komponente.costDialogOpen()).toBe(true);
    expect(komponente.form.dirty).toBe(false);
  });

  it('uebernimmt Kosten erst aus dem gespeicherten Dialogentwurf', () => {
    const { komponente } = erstelleKomponente();
    komponente.openCostEditor();
    const wert: PurchaseCostOverviewValue = {
      discountAmount: 12,
      costs: [
        {
          type: 'customs',
          amount: 4,
          description: 'Zollgebühren',
          allocationMethod: 'by_value',
          targetPurchaseLineId: null,
        },
      ],
    };

    komponente.onCostOverviewSaved(wert);

    expect(komponente.form.controls.discount_amount.value).toBe(12);
    expect(komponente.costDrafts()).toEqual(wert.costs);
    expect(komponente.costDialogOpen()).toBe(false);
    expect(komponente.form.dirty).toBe(true);
  });

  it('behandelt geladene Positionen und Kosten erst nach einer echten Aenderung als dirty', () => {
    const { komponente } = erstelleKomponente(einkauf);
    const linien = [
      {
        draftId: 'line-1',
        catalogProductId: null,
        titleSnapshot: 'Konsole',
        lineKind: 'individual' as const,
        orderedQuantity: 1,
        condition: 'used' as const,
        priceMode: 'priced' as const,
        unitPurchasePrice: 50,
        lineTotal: 50,
        estimatedMarketValue: null,
      },
    ];
    const kosten: readonly PurchaseCostDraft[] = [
      {
        type: 'shipping',
        amount: 5,
        description: 'Versandkosten',
        allocationMethod: 'by_value',
        targetPurchaseLineId: null,
      },
    ];
    Object.assign(komponente, {
      baselinePurchaseLines: signal(linien),
      baselineCostDrafts: signal(kosten),
    });
    komponente.purchaseLines.set(linien);
    komponente.costDrafts.set(kosten);
    komponente.form.markAsPristine();

    expect(komponente.hasUnsavedChanges()).toBe(false);

    komponente.openCostEditor();
    komponente.costDialogOpen.set(false);
    expect(komponente.hasUnsavedChanges()).toBe(false);

    komponente.onCostsChanged([{ ...kosten[0], amount: 6 }]);
    expect(komponente.hasUnsavedChanges()).toBe(true);

    komponente.onCostsChanged(kosten);
    komponente.onPurchaseLinesChanged([{ ...linien[0], orderedQuantity: 2 }]);
    expect(komponente.hasUnsavedChanges()).toBe(true);
  });

  it('speichert ohne Verkäufer keinen Entwurf', async () => {
    const { komponente, purchaseService, purchaseCostingService } = erstelleKomponente();
    komponente.form.patchValue({
      title: '',
      supplier_id: null,
    });
    await komponente.onSubmit();
    expect(purchaseService.createPurchase).not.toHaveBeenCalled();
    expect(purchaseCostingService.finalizePurchase).not.toHaveBeenCalled();
  });

  it('speichert Beschreibung, Quelle und den Snapshot des gewählten Verkäufers', async () => {
    const { komponente, purchaseService } = erstelleKomponente();
    komponente.form.patchValue({
      notes: 'Vinted-Jacke',
      source_id: 'source-vinted',
      supplier_id: 'supplier-nord',
    });

    await komponente.onSubmit();

    expect(purchaseService.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '',
        notes: 'Vinted-Jacke',
        source_id: 'source-vinted',
        supplier_id: 'supplier-nord',
        seller_type: 'business',
        seller_name: 'Großhandel Nord',
        seller_city: 'Hamburg',
        seller_country_code: 'DE',
      }),
    );
  });

  it('bewahrt technische Bestands- und Versandwerte beim Bearbeiten', async () => {
    const vorhandener: Purchase = {
      ...einkauf,
      type: 'pallet',
      shipment_status: 'arrived',
      tracking_status: 'delivered',
      cost_allocation_mode: 'value_weighted',
    };
    const { komponente, purchaseService } = erstelleKomponente(vorhandener);
    komponente.form.controls.type.setValue('pallet');

    await komponente.onSubmit();

    expect(purchaseService.updatePurchaseDraft).toHaveBeenCalledWith(
      vorhandener.id,
      expect.objectContaining({
        type: 'pallet',
        shipment_status: 'arrived',
        tracking_status: 'delivered',
        cost_allocation_mode: 'value_weighted',
      }),
    );
  });

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
      expect.objectContaining({
        purchaseId: einkauf.id,
        entryStatus: 'finalized',
        totalPurchaseCost: 50,
      }),
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

  it('zeigt einen zentral gemeldeten Speicherfehler ohne Erfolg, Schließen oder doppelten Toast', async () => {
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
      new Error('Der Einkauf konnte nicht gespeichert werden.'),
    );
    purchaseCostingService.finalizePurchase.mockResolvedValue({
      data: null,
      error: centralError,
      reportedBySyncStatus: true,
    });

    await komponente.onFinalize();

    expect(komponente.errorMessage()).toContain('Der Einkauf konnte nicht gespeichert werden.');
    expect(toast.toasts()).toEqual([]);
    expect(created.emit).not.toHaveBeenCalled();
    expect(closed.emit).not.toHaveBeenCalled();
  });

  it('lädt die Kostenherkunft und speichert auch eine alleinige Änderung der Zuordnung', async () => {
    const existing: Purchase = {
      ...einkauf,
      entry_status: 'draft',
      costs: [
        { id: 'cost-unknown', type: 'shipping', amount: 5, tax_treatment: null },
        { id: 'cost-expense', type: 'transport', amount: 7, tax_treatment: 'expense' },
      ],
    };
    const { komponente, purchaseService } = erstelleKomponente(existing);
    komponente.resetToPurchase(existing);
    expect(komponente.costDrafts().map((cost) => cost.taxTreatment)).toEqual([null, 'expense']);
    expect(komponente.hasUnsavedChanges()).toBe(false);
    komponente.onCostsChanged(
      komponente
        .costDrafts()
        .map((cost, index) => (index === 0 ? { ...cost, taxTreatment: 'purchase_price' } : cost)),
    );
    expect(komponente.hasUnsavedChanges()).toBe(true);
    await komponente.onSubmit();
    expect(purchaseService.updatePurchaseDraft).toHaveBeenCalledWith(
      einkauf.id,
      expect.objectContaining({
        initial_costs: [
          expect.objectContaining({ taxTreatment: 'purchase_price' }),
          expect.objectContaining({ taxTreatment: 'expense' }),
        ],
      }),
    );
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
    komponente.form.controls.notes.setValue('Konsole mit Zubehör');
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
        title: '',
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
    komponente.form.controls.notes.setValue('Konsole als gespeicherter Draft');
    await komponente.onSubmit();

    expect(purchaseService.createPurchase).toHaveBeenCalledOnce();
    expect(purchaseService.updatePurchaseDraft).toHaveBeenCalledOnce();
    expect(purchaseService.updatePurchaseDraft).toHaveBeenCalledWith(
      einkauf.id,
      expect.objectContaining({ title: '', notes: 'Konsole als gespeicherter Draft' }),
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
    Object.assign(komponente, {
      purchase: () => ({
        ...einkauf,
        purchase_lines: [
          {
            id: 'line-old',
            workspace_id: 'workspace-1',
            purchase_id: einkauf.id,
            catalog_product_id: null,
            line_kind: 'individual',
            ordered_quantity: 1,
            title_snapshot: 'Alte Position',
            condition_snapshot: 'used',
            price_mode: 'priced',
            unit_purchase_price: 10,
            line_total: 10,
            created_at: '2026-08-24T10:00:00.000Z',
          },
        ],
      }),
    });

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

    komponente.onCostsChanged([
      {
        type: 'shipping',
        amount: 5,
        description: '',
        allocationMethod: 'direct',
        targetPurchaseLineId: 'draft-camera',
      },
    ]);

    komponente.onPurchaseLinesChanged([]);

    expect(komponente.purchaseLineOptions()).toEqual([]);
    expect(komponente.areAdditionalCostsValid()).toBe(false);
    expect(komponente.canSaveDraft()).toBe(false);
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
    komponente.form.controls.pricing_mode.setValue('total');
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
    komponente.form.controls.pricing_mode.setValue('total');
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
    komponente.form.controls.pricing_mode.setValue('total');
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

  it('berücksichtigt unfertige Positionen und blockiert paralleles Einkaufsspeichern', async () => {
    const { komponente, purchaseService } = erstelleKomponente();
    Object.assign(komponente, {
      lineEditor: () => ({
        lineRows: { invalid: false },
        hasUnsavedChanges: () => true,
      }),
    });

    expect(komponente.hasUnsavedChanges()).toBe(true);
    komponente.isSubmitting.set(true);
    expect(komponente.isSaving()).toBe(true);
    await komponente.onSubmit();
    expect(purchaseService.createPurchase).not.toHaveBeenCalled();
  });

  it('beruecksichtigt einen unfertigen Kostenentwurf beim Verlassen', () => {
    const { komponente } = erstelleKomponente();
    Object.assign(komponente, {
      costOverviewDialog: () => ({ hasUnsavedChanges: () => true }),
    });

    expect(komponente.hasUnsavedChanges()).toBe(true);
  });

  it('berücksichtigt einen ungespeicherten Bezugsquellendialog', () => {
    const { komponente } = erstelleKomponente();
    Object.assign(komponente, {
      sourceDialog: () => ({ hasUnsavedChanges: () => true }),
    });

    expect(komponente.hasUnsavedChanges()).toBe(true);
  });

  it('speichert eine nach dem Bepreisen wieder geleerte Position als offenen Entwurf', async () => {
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

    expect(purchaseService.createPurchase).toHaveBeenCalledOnce();
    expect(komponente.errorMessage()).toBeNull();
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

  it('übernimmt die gespeicherte Bezugsquelle und markiert den Einkauf als geändert', () => {
    const { komponente } = erstelleKomponente();
    komponente.form.markAsPristine();
    komponente.sourceDialogOpen.set(true);
    const source: Source = {
      id: 'source-1',
      workspace_id: 'workspace-1',
      name: 'Flohmarkt',
    };

    komponente.onSourceCreated(source);

    expect(komponente.form.controls.source_id.value).toBe('source-1');
    expect(komponente.sourceDialogOpen()).toBe(false);
    expect(komponente.form.dirty).toBe(true);
  });
});

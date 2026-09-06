import '@angular/compiler';
import {
  ɵresolveComponentResources,
  ɵɵqueryAdvance,
  ɵɵviewQuerySignal,
  computed,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormArray } from '@angular/forms';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CatalogProduct, PurchaseType, Workspace } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { PurchaseLineEditorComponent } from './purchase-line-editor.component';

interface AngularBindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
  viewQuery: ((renderFlags: number, context: unknown) => void) | null;
}

let selectMetadataSnapshot: AngularBindingMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const resourceUrl = String(url);
    for (const component of ['barcode-scanner']) {
      if (resourceUrl.includes(component + '.component.'))
        return readFile(
          'src/app/shared/components/' + component + '/' + resourceUrl.split('/').at(-1),
          'utf8',
        );
    }
    if (resourceUrl.includes('purchase-product-picker.component.'))
      return readFile(
        'src/app/features/purchases/components/purchase-product-picker/' +
          resourceUrl.split('/').at(-1),
        'utf8',
      );
    if (!url || resourceUrl === 'undefined' || resourceUrl.endsWith('/undefined')) return '';
    if (resourceUrl.includes('custom-select.component.')) {
      const fileName = resourceUrl.split('/').at(-1);
      return readFile(`src/app/shared/components/custom-select/${fileName}`, 'utf8');
    }
    try {
      return await readFile(new URL(resourceUrl, import.meta.url), 'utf8');
    } catch {
      return readFile(
        new URL(`../../../../shared/components/custom-select/${resourceUrl}`, import.meta.url),
        'utf8',
      );
    }
  });
  const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp;
  selectMetadataSnapshot = {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
    viewQuery: metadata.viewQuery,
  };
  metadata.inputs = {
    ...metadata.inputs,
    options: ['options', 1, null],
    value: ['value', 1, null],
    placeholder: ['placeholder', 1, null],
    variant: ['variant', 1, null],
    size: ['size', 1, null],
    disabled: ['disabled', 1, null],
    widthClass: ['widthClass', 1, null],
    openDirection: ['openDirection', 1, null],
    ariaLabel: ['ariaLabel', 1, null],
    triggerId: ['triggerId', 1, null],
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    options: 'options',
    value: 'value',
    placeholder: 'placeholder',
    variant: 'variant',
    size: 'size',
    disabled: 'disabled',
    widthClass: 'widthClass',
    openDirection: 'openDirection',
    ariaLabel: 'ariaLabel',
    triggerId: 'triggerId',
  };
  metadata.outputs = { ...metadata.outputs, valueChange: 'value' };
  metadata.viewQuery = (renderFlags, context) => {
    const component = context as { trigger: Parameters<typeof ɵɵviewQuerySignal>[0] };
    if (renderFlags & 1) ɵɵviewQuerySignal(component.trigger, ['trigger'], 5);
    if (renderFlags & 2) ɵɵqueryAdvance();
  };
});

afterAll(() => {
  if (!selectMetadataSnapshot) return;
  const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp;
  metadata.inputs = selectMetadataSnapshot.inputs;
  metadata.declaredInputs = selectMetadataSnapshot.declaredInputs;
  metadata.outputs = selectMetadataSnapshot.outputs;
  metadata.viewQuery = selectMetadataSnapshot.viewQuery;
});

const workspaceOne: Workspace = {
  id: 'workspace-1',
  name: 'Workspace 1',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
};
const workspaceTwo: Workspace = { ...workspaceOne, id: 'workspace-2', name: 'Workspace 2' };
const ledProduct: CatalogProduct = {
  id: 'catalog-led',
  workspace_id: workspaceOne.id,
  title: 'LED-Lampe',
  tracking_mode: 'quantity',
  is_public_store: false,
};

function erstelleEditor(purchaseType: PurchaseType = 'single') {
  const linesChanged = { emit: vi.fn() };
  const editor = Object.create(
    PurchaseLineEditorComponent.prototype,
  ) as PurchaseLineEditorComponent;
  Object.assign(editor, {
    lineRows: new FormArray([]),
    lineCount: signal(0),
    linesChanged,
    purchaseType: signal(purchaseType),
    isMysteryPurchase: computed(() => purchaseType === 'mystery_pack'),
  });
  return { editor, linesChanged };
}

describe('PurchaseLineEditorComponent', () => {
  it('verarbeitet einen Scan nur einmal und erfindet keinen Nullpreis', () => {
    const { editor } = erstelleEditor();
    Object.assign(editor, {
      cameraOpen: signal(false),
      pickerOpen: signal(false),
      scannerMessage: signal(null),
      catalogSelectionDisabled: () => false,
      availableProducts: () => [{ ...ledProduct, ean: '4006381333931' }],
      scanControl: { value: '', setValue: vi.fn() },
      lastScan: { value: '', at: 0 },
    });
    editor.scanBarcode('4006381333931');
    editor.scanBarcode('4006381333931');
    expect(editor.getDrafts()).toHaveLength(1);
    expect(editor.getDrafts()[0]).toMatchObject({
      catalogProductId: ledProduct.id,
      unitPurchasePrice: null,
      lineTotal: null,
      priceMode: 'unpriced_mystery',
    });
  });

  it('rendert den Artikelstamm als barrierefreien CustomSelect und übernimmt die Auswahl', async () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [PurchaseLineEditorComponent, CustomSelectComponent],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            products: signal<CatalogProduct[]>([ledProduct]),
            isLoading: signal(false),
            loadError: signal<Error | null>(null),
            loadedWorkspaceId: signal<string | null>(workspaceOne.id),
            loadProducts: vi.fn(async () => undefined),
            createProduct: vi.fn(),
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal<Workspace | null>(workspaceOne) },
        },
      ],
    }).createComponent(PurchaseLineEditorComponent);
    Object.assign(fixture.componentInstance, { purchaseType: signal<PurchaseType>('single') });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.addQuantityLine();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(host.querySelector('select')).toBeNull();
    const trigger = host.querySelector<HTMLButtonElement>(
      'app-custom-select button[aria-label="Artikelstamm für Position 1"]',
    );
    expect(trigger).not.toBeNull();

    trigger?.click();
    fixture.detectChanges();
    const option = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
      (candidate) => candidate.textContent?.includes('LED-Lampe'),
    );
    option?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.lineRows.at(0).getRawValue()).toMatchObject({
      catalogProductId: ledProduct.id,
      titleSnapshot: ledProduct.title,
    });

    trigger?.click();
    fixture.detectChanges();
    const clearOption = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ).find((candidate) => candidate.textContent?.includes('Artikel wählen'));
    expect(clearOption).toBeDefined();
    clearOption?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.lineRows.at(0).getRawValue()).toMatchObject({
      catalogProductId: null,
      titleSnapshot: ledProduct.title,
    });
  });

  it('lädt nach verspätetem Workspace und bei Wechsel jeden aktuellen Artikelstamm genau einmal', async () => {
    TestBed.resetTestingModule();
    const products = signal<CatalogProduct[]>([]);
    const isLoading = signal(false);
    const loadError = signal<Error | null>(null);
    const loadedWorkspaceId = signal<string | null>(null);
    const currentWorkspace = signal<Workspace | null>(null);
    const loadProducts = vi.fn(async (workspaceId: string) => {
      isLoading.set(true);
      products.set(
        workspaceId === workspaceOne.id
          ? [ledProduct]
          : [{ ...ledProduct, id: 'catalog-chair', workspace_id: workspaceTwo.id, title: 'Stuhl' }],
      );
      loadedWorkspaceId.set(workspaceId);
      isLoading.set(false);
    });
    const fixture = TestBed.configureTestingModule({
      imports: [PurchaseLineEditorComponent],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            products,
            isLoading,
            loadError,
            loadedWorkspaceId,
            loadProducts,
            createProduct: vi.fn(),
          },
        },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
      ],
    }).createComponent(PurchaseLineEditorComponent);
    Object.assign(fixture.componentInstance, { purchaseType: signal<PurchaseType>('single') });
    fixture.detectChanges();
    expect(loadProducts).not.toHaveBeenCalled();

    currentWorkspace.set(workspaceOne);
    fixture.detectChanges();
    await vi.waitFor(() => expect(loadProducts).toHaveBeenCalledWith(workspaceOne.id));
    expect(fixture.componentInstance.quantityProducts()).toEqual([ledProduct]);

    currentWorkspace.set(workspaceTwo);
    fixture.detectChanges();
    await vi.waitFor(() => expect(loadProducts).toHaveBeenCalledWith(workspaceTwo.id));
    expect(loadProducts.mock.calls.map(([workspaceId]) => workspaceId)).toEqual([
      workspaceOne.id,
      workspaceTwo.id,
    ]);
    expect(fixture.componentInstance.quantityProducts().map((product) => product.title)).toEqual([
      'Stuhl',
    ]);
  });

  it('sperrt nach fehlgeschlagenem Laden fremde gecachte Workspace-Produkte', async () => {
    TestBed.resetTestingModule();
    const products = signal<CatalogProduct[]>([
      { ...ledProduct, workspace_id: workspaceTwo.id, title: 'Fremde LED-Lampe' },
    ]);
    const loadError = signal<Error | null>(null);
    const fixture = TestBed.configureTestingModule({
      imports: [PurchaseLineEditorComponent],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            products,
            isLoading: signal(false),
            loadError,
            loadedWorkspaceId: signal<string | null>(workspaceTwo.id),
            loadProducts: vi.fn(async () => loadError.set(new Error('Katalog nicht erreichbar'))),
            createProduct: vi.fn(),
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal<Workspace | null>(workspaceOne) },
        },
      ],
    }).createComponent(PurchaseLineEditorComponent);
    Object.assign(fixture.componentInstance, { purchaseType: signal<PurchaseType>('single') });
    fixture.detectChanges();
    await vi.waitFor(() => expect(loadError()).not.toBeNull());
    expect(fixture.componentInstance.catalogSelectionDisabled()).toBe(true);
    expect(fixture.componentInstance.quantityProducts()).toEqual([]);
    expect(fixture.componentInstance.catalogLoadError()).toContain('Katalog nicht erreichbar');
  });

  it('wiederholt einen fehlgeschlagenen Katalogabruf erst nach explizitem Retry', async () => {
    TestBed.resetTestingModule();
    const isLoading = signal(false);
    const loadError = signal<Error | null>(null);
    const loadProducts = vi.fn(async () => {
      // Der echte Dienst kann seinen Ladezustand synchron prüfen. Dieser Read
      // darf nicht versehentlich zur Abhängigkeit des Komponenten-Effects werden.
      void isLoading();
      if (loadProducts.mock.calls.length > 3) return;
      isLoading.set(true);
      await Promise.resolve();
      loadError.set(new Error('Katalog nicht erreichbar'));
      isLoading.set(false);
    });
    const fixture = TestBed.configureTestingModule({
      imports: [PurchaseLineEditorComponent],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            products: signal<CatalogProduct[]>([]),
            isLoading,
            loadError,
            loadedWorkspaceId: signal<string | null>(null),
            loadProducts,
            createProduct: vi.fn(),
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal<Workspace | null>(workspaceOne) },
        },
      ],
    }).createComponent(PurchaseLineEditorComponent);
    Object.assign(fixture.componentInstance, { purchaseType: signal<PurchaseType>('single') });

    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.catalogLoadError()).not.toBeNull());
    await Promise.resolve();
    fixture.detectChanges();
    expect(loadProducts).toHaveBeenCalledTimes(1);

    await fixture.componentInstance.loadCatalogProducts(true);
    expect(loadProducts).toHaveBeenCalledTimes(2);
  });

  it('berechnet die Positionssumme einer Mengenposition aus Menge und EK je Stück', () => {
    const { editor } = erstelleEditor();
    editor.addQuantityLine();

    const row = editor.lineRows.at(0);
    expect(row.controls.orderedQuantity.value).toBe(1);
    row.patchValue({ orderedQuantity: 5, unitPurchasePrice: 4.99 });
    editor.recalculate(0, 'unitPurchasePrice');

    expect(row.controls.lineTotal.value).toBe(24.95);
  });

  it('unterscheidet einen neuen unbekannten Positionspreis von einer ausdrücklich kostenlosen Position', () => {
    const { editor } = erstelleEditor();
    editor.addQuantityLine();

    const row = editor.lineRows.at(0);
    expect(row.controls.unitPurchasePrice.value).toBeNull();
    expect(row.controls.lineTotal.value).toBeNull();

    row.controls.unitPurchasePrice.setValue(0);
    editor.recalculate(0, 'unitPurchasePrice');

    expect(row.controls.unitPurchasePrice.value).toBe(0);
    expect(row.controls.lineTotal.value).toBe(0);
  });

  it('meldet nach dem Leeren des Stückpreises beide Preisfelder als unbekannt an den Parent', () => {
    const { editor, linesChanged } = erstelleEditor();
    editor.addQuantityLine();
    const row = editor.lineRows.at(0);
    row.patchValue({ orderedQuantity: 2, unitPurchasePrice: 4.99 });
    editor.recalculate(0, 'unitPurchasePrice');
    linesChanged.emit.mockClear();

    row.controls.unitPurchasePrice.setValue(null);
    editor.recalculate(0, 'unitPurchasePrice');

    expect(row.controls.lineTotal.value).toBeNull();
    expect(linesChanged.emit).toHaveBeenCalledWith([
      expect.objectContaining({ unitPurchasePrice: null, lineTotal: null }),
    ]);
  });

  it('meldet nach dem Leeren der Positionssumme beide Preisfelder als unbekannt an den Parent', () => {
    const { editor, linesChanged } = erstelleEditor();
    editor.addQuantityLine();
    const row = editor.lineRows.at(0);
    row.patchValue({ orderedQuantity: 2, lineTotal: 9.98 });
    editor.recalculate(0, 'lineTotal');
    linesChanged.emit.mockClear();

    row.controls.lineTotal.setValue(null);
    editor.recalculate(0, 'lineTotal');

    expect(row.controls.unitPurchasePrice.value).toBeNull();
    expect(linesChanged.emit).toHaveBeenCalledWith([
      expect.objectContaining({ unitPurchasePrice: null, lineTotal: null }),
    ]);
  });

  it('berechnet EK je Stück aus der Positionssumme ohne mehr als zwei Nachkommastellen', () => {
    const { editor } = erstelleEditor();
    editor.addQuantityLine();

    const row = editor.lineRows.at(0);
    row.patchValue({ orderedQuantity: 5, lineTotal: 29.95 });
    editor.recalculate(0, 'lineTotal');

    expect(row.controls.unitPurchasePrice.value).toBe(5.99);
  });

  it('erzeugt für Einzelstücke eine individuelle Position mit Menge eins', () => {
    const { editor } = erstelleEditor();

    editor.addIndividualLine();

    expect(editor.lineRows.at(0).getRawValue()).toMatchObject({
      lineKind: 'individual',
      orderedQuantity: 1,
    });
  });

  it('gibt jeder neuen Position eine stabile Draft-ID für Zuordnungen im Erfassungsdialog', () => {
    const { editor } = erstelleEditor();
    editor.addIndividualLine();

    expect(editor.getDrafts()).toEqual([
      expect.objectContaining({ draftId: expect.stringMatching(/^draft-/) }),
    ]);
  });

  it('meldet eine geänderte Einzelpositionsbezeichnung an das Elternformular', () => {
    const { editor, linesChanged } = erstelleEditor();
    editor.addIndividualLine();
    linesChanged.emit.mockClear();

    editor.updateTitleSnapshot(0, 'Mystery-Fundstück');

    expect(linesChanged.emit).toHaveBeenCalledWith([
      expect.objectContaining({ titleSnapshot: 'Mystery-Fundstück' }),
    ]);
  });

  it('erfasst normale Positionen mit Zustand und einem preisgebundenen Gesamtbetrag', () => {
    const { editor } = erstelleEditor('single');
    editor.addIndividualLine();

    const row = editor.lineRows.at(0);
    row.patchValue({
      titleSnapshot: 'Vintage-Kamera',
      orderedQuantity: 2,
      condition: 'very_good',
      unitPurchasePrice: 12.5,
    });
    editor.recalculate(0, 'unitPurchasePrice');

    expect(editor.getDrafts()).toEqual([
      expect.objectContaining({
        draftId: expect.stringMatching(/^draft-/),
        catalogProductId: null,
        titleSnapshot: 'Vintage-Kamera',
        lineKind: 'individual',
        orderedQuantity: 2,
        condition: 'very_good',
        priceMode: 'priced',
        unitPurchasePrice: 12.5,
        lineTotal: 25,
        estimatedMarketValue: null,
      }),
    ]);
  });

  it('erfasst Mystery-Inhalte ohne künstlichen Einkaufspreis und mit optionalem Marktwert', () => {
    const { editor, linesChanged } = erstelleEditor('mystery_pack');
    editor.addIndividualLine();

    const row = editor.lineRows.at(0);
    row.patchValue({ titleSnapshot: 'Überraschungsfigur', estimatedMarketValue: 18.5 });
    editor.recalculate(0, 'unitPurchasePrice');

    expect(row.controls.orderedQuantity.value).toBe(1);
    expect(row.controls.unitPurchasePrice.value).toBeNull();
    expect(row.controls.lineTotal.value).toBeNull();
    expect(linesChanged.emit).toHaveBeenLastCalledWith([
      expect.objectContaining({
        titleSnapshot: 'Überraschungsfigur',
        priceMode: 'unpriced_mystery',
        unitPurchasePrice: null,
        lineTotal: null,
        estimatedMarketValue: 18.5,
      }),
    ]);
  });

  it('verwirft beim Wechsel von Mystery zu normal den geschätzten Marktwert', () => {
    const { editor } = erstelleEditor('mystery_pack');
    editor.addIndividualLine();
    editor.lineRows.at(0).controls.estimatedMarketValue.setValue(35);

    (
      editor as unknown as { configurePriceMode: (purchaseType: PurchaseType) => void }
    ).configurePriceMode('single');

    expect(editor.getDrafts()).toEqual([
      expect.objectContaining({
        priceMode: 'unpriced_mystery',
        unitPurchasePrice: null,
        lineTotal: null,
        estimatedMarketValue: null,
      }),
    ]);
  });
});

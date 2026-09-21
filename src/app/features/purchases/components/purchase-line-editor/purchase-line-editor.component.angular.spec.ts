import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import {
  ɵresolveComponentResources,
  ɵɵqueryAdvance,
  ɵɵviewQuerySignal,
  computed,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CatalogProduct, PurchaseType, Workspace } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { PurchaseLineEditorComponent } from './purchase-line-editor.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';

interface AngularBindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
  viewQuery: ((renderFlags: number, context: unknown) => void) | null;
}

let selectMetadataSnapshot: AngularBindingMetadata | null = null;
const sharedMetadataSnapshots: {
  metadata: AngularBindingMetadata;
  snapshot: AngularBindingMetadata;
}[] = [];

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources(async (url) => {
    const resourceUrl = String(url);
    for (const component of [
      'barcode-scanner',
      'button',
      'number-input',
      'text-field',
      'modal-shell',
      'product-thumbnail',
      'custom-checkbox',
    ]) {
      if (resourceUrl.includes(component + '.component.'))
        return readFile(
          'src/app/shared/components/' + component + '/' + resourceUrl.split('/').at(-1),
          'utf8',
        );
    }
    if (resourceUrl.includes('product-dialog.component.'))
      return readFile(
        'src/app/features/catalog/components/product-dialog/' + resourceUrl.split('/').at(-1),
        'utf8',
      );
    if (resourceUrl.includes('purchase-product-picker.component.'))
      return readFile(
        'src/app/features/purchases/components/purchase-product-picker/' +
          resourceUrl.split('/').at(-1),
        'utf8',
      );
    if (!url || resourceUrl === 'undefined' || resourceUrl.endsWith('/undefined')) return '';
    const fileName = resourceUrl.split('/').at(-1);
    if (!fileName) return '';
    const matches = (await readdir(resolve('src/app'), { recursive: true })).filter((file) =>
      file.endsWith(fileName),
    );
    if (matches.length !== 1) throw new Error(`Unbekannte Test-Ressource: ${resourceUrl}`);
    return readFile(resolve('src/app', matches[0]), 'utf8');
  });
  for (const [component, inputs, outputs] of [
    [
      ButtonComponent,
      [
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
        'link',
        'queryParams',
        'ariaLabel',
        'title',
        'ariaExpanded',
        'ariaPressed',
        'ariaControls',
        'ariaHaspopup',
      ],
      { clicked: 'clicked' },
    ],
    [
      NumberInputComponent,
      [
        'value',
        'placeholder',
        'step',
        'min',
        'max',
        'unit',
        'id',
        'ariaLabel',
        'asCurrency',
        'disabled',
        'showStepper',
      ],
      { valueChange: 'value' },
    ],
    [ProductThumbnailComponent, ['src', 'alt', 'size'], {}],
  ] as const) {
    const metadata = (component as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp;
    sharedMetadataSnapshots.push({ metadata, snapshot: { ...metadata } });
    metadata.inputs = {
      ...metadata.inputs,
      ...Object.fromEntries(inputs.map((name) => [name, [name, 1, null]])),
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      ...Object.fromEntries(inputs.map((name) => [name, name])),
    };
    metadata.outputs = { ...metadata.outputs, ...outputs };
  }
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
  for (const { metadata, snapshot } of sharedMetadataSnapshots) {
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    metadata.outputs = snapshot.outputs;
  }
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
    activeWorkspaceId: signal(workspaceOne.id),
    pickerOpen: signal(false),
    cameraOpen: signal(false),
    scannerOpen: signal(false),
    pickerSearch: signal(''),
    scanControl: new FormControl('', { nonNullable: true }),
    scannerMessage: signal(null),
    isCreatingProduct: signal(false),
    importError: signal(null),
    detailId: signal(null),
    importPreview: signal([]),
    linesChanged,
    purchaseType: signal(purchaseType),
    isMysteryPurchase: computed(() => purchaseType === 'mystery_pack'),
  });
  return { editor, linesChanged };
}

function addLegacyLine(editor: PurchaseLineEditorComponent): void {
  editor.resetToLines([
    ...editor.getDrafts(),
    {
      catalogProductId: null,
      titleSnapshot: 'Legacy-Artikel',
      lineKind: 'individual',
      orderedQuantity: 1,
      condition: 'used',
      priceMode: 'unpriced_mystery',
      unitPurchasePrice: null,
      lineTotal: null,
      estimatedMarketValue: null,
    },
  ]);
}

describe('PurchaseLineEditorComponent', () => {
  it('übernimmt weder Auswahl noch verspätete Anlage aus einem fremden Workspace', () => {
    const { editor } = erstelleEditor();
    const foreign = { ...ledProduct, workspace_id: workspaceTwo.id };
    editor.addProducts([foreign]);
    editor.productCreated(foreign);
    expect(editor.getDrafts()).toEqual([]);
  });
  it('akzeptiert einen einstelligen Produktnamen', () => {
    const { editor } = erstelleEditor();
    editor.addProducts([{ ...ledProduct, title: 'X' }]);
    expect(editor.lineRows.valid).toBe(true);
  });
  it('ordnet historische Einzelstückzeilen nicht unbemerkt einem Mengenprodukt zu', () => {
    const { editor } = erstelleEditor();
    Object.assign(editor, { availableProducts: () => [ledProduct] });
    addLegacyLine(editor);
    const original = editor.getDrafts();
    editor.selectCatalogProduct(0, ledProduct.id);
    expect(editor.getDrafts()).toEqual(original);
  });
  it('blockiert einen übergroßen Positionsbetrag statt ihn als offenen Preis speicherbar zu machen', () => {
    const { editor } = erstelleEditor();
    editor.addProducts([ledProduct]);
    const row = editor.lineRows.at(0);
    row.patchValue({
      catalogProductId: ledProduct.id,
      titleSnapshot: ledProduct.title,
      orderedQuantity: 100000,
      unitPurchasePrice: 9999999999.99,
    });
    editor.recalculate(0, 'unitPurchasePrice');
    expect(row.controls.lineTotal.invalid).toBe(true);
  });
  it('verwirft Positionsänderungen und offene Eingaben ohne erneutes Erstellen des Editors', () => {
    const { editor } = erstelleEditor();
    Object.assign(editor, {
      pickerOpen: signal(true),
      cameraOpen: signal(true),
      scannerOpen: signal(true),
      scannerMessage: signal('Scan'),
      pickerSearch: signal('Suche'),
      scanControl: new FormControl('123', { nonNullable: true }),
      isCreatingProduct: signal(true),
      productError: signal('Fehler'),
      importError: signal('Fehler'),
      productForm: new FormGroup({ title: new FormControl('Neu', { nonNullable: true }) }),
    });
    addLegacyLine(editor);
    editor.lineRows.at(0).controls.titleSnapshot.setValue('Original');
    const original = editor.getDrafts();
    editor.lineRows.at(0).controls.titleSnapshot.setValue('Geändert');
    addLegacyLine(editor);

    editor.resetToLines(original);

    expect(editor.getDrafts()).toEqual(original);
    expect(editor.lineCount()).toBe(1);
    expect(editor.hasUnsavedChanges()).toBe(false);
    expect(editor.cameraOpen()).toBe(false);
    editor.resetToLines([]);
    expect(editor.getDrafts()).toEqual([]);
    expect(editor.lineCount()).toBe(0);
  });

  it('sperrt die Menge und das Entfernen nach bereits gebuchtem Wareneingang', () => {
    const { editor } = erstelleEditor();
    editor.resetToLines([
      {
        draftId: 'persisted-line',
        catalogProductId: ledProduct.id,
        titleSnapshot: ledProduct.title,
        lineKind: 'quantity',
        orderedQuantity: 2,
        condition: 'used',
        priceMode: 'priced',
        unitPurchasePrice: 4.99,
        lineTotal: 9.98,
        estimatedMarketValue: null,
        structuralLocked: true,
      },
    ]);

    expect(editor.lineRows.at(0).controls.orderedQuantity.disabled).toBe(true);
    editor.removeLine(0);
    expect(editor.getDrafts()).toEqual([
      expect.objectContaining({ draftId: 'persisted-line', orderedQuantity: 2 }),
    ]);
  });

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
      priceMode: 'open',
    });
  });

  it('rendert eine kompakte Tabelle und berechnet Eingaben unmittelbar vor Blur', async () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [PurchaseLineEditorComponent],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            imageUrls: () => ({}),
            products: signal([ledProduct]),
            isLoading: signal(false),
            loadError: signal(null),
            loadedWorkspaceId: signal(workspaceOne.id),
            loadProducts: vi.fn(),
          },
        },
        { provide: WorkspaceService, useValue: { currentWorkspace: signal(workspaceOne) } },
      ],
    }).createComponent(PurchaseLineEditorComponent);
    Object.assign(fixture.componentInstance, { purchaseType: signal<PurchaseType>('single') });
    fixture.detectChanges();
    fixture.componentInstance.addProducts([ledProduct]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('table caption')?.textContent).toContain('Einkaufspositionen');
    expect(host.textContent).not.toMatch(/Mengenartikel|Einzelstück|Position löschen/);
    const quantity = host.querySelector<HTMLInputElement>(
      'input[aria-label="Menge für LED-Lampe"]',
    );
    const price = host.querySelector<HTMLInputElement>(
      'input[aria-label="Stückpreis für LED-Lampe"]',
    );
    expect(quantity).not.toBeNull();
    expect(price).not.toBeNull();
    if (!quantity || !price) throw new Error('Zahlenfelder fehlen');
    expect(price.placeholder).toBe('');
    expect(host.textContent).toContain('0,00');
    expect(host.textContent).not.toContain('Offen');
    const productName = host.querySelector<HTMLElement>('span.text-left');
    expect(productName?.classList).toContain('w-full');
    expect(productName?.classList).toContain('text-left');
    const productButton = host.querySelector<HTMLButtonElement>(
      '[data-purchase-line-title] button',
    );
    expect(productButton?.classList).toContain('justify-start');
    expect(productButton?.classList).toContain('text-left');
    const addProducts = host.querySelector<HTMLElement>('[data-add-products]');
    expect(addProducts?.classList).toContain('w-full');
    expect(addProducts?.querySelector('button')?.classList).toContain('w-full');
    quantity.value = '3';
    quantity.dispatchEvent(new Event('input', { bubbles: true }));
    price.value = '12';
    price.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.getDrafts()[0].lineTotal).toBe(36);
    price.value = '0.12';
    price.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.getDrafts()[0].lineTotal).toBe(0.36);
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
            imageUrls: () => ({}),
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
    expect(fixture.componentInstance.availableProducts()).toEqual([ledProduct]);

    currentWorkspace.set(workspaceTwo);
    fixture.detectChanges();
    await vi.waitFor(() => expect(loadProducts).toHaveBeenCalledWith(workspaceTwo.id));
    expect(loadProducts.mock.calls.map(([workspaceId]) => workspaceId)).toEqual([
      workspaceOne.id,
      workspaceTwo.id,
    ]);
    expect(fixture.componentInstance.availableProducts().map((product) => product.title)).toEqual([
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
            imageUrls: () => ({}),
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
    expect(fixture.componentInstance.availableProducts()).toEqual([]);
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
            imageUrls: () => ({}),
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
    editor.addProducts([ledProduct]);

    const row = editor.lineRows.at(0);
    expect(row.controls.orderedQuantity.value).toBe(1);
    row.patchValue({ orderedQuantity: 5, unitPurchasePrice: 4.99 });
    editor.recalculate(0, 'unitPurchasePrice');

    expect(row.controls.lineTotal.value).toBe(24.95);
  });

  it('unterscheidet einen neuen unbekannten Positionspreis von einer ausdrücklich kostenlosen Position', () => {
    const { editor } = erstelleEditor();
    editor.addProducts([ledProduct]);

    const row = editor.lineRows.at(0);
    expect(row.controls.unitPurchasePrice.value).toBeNull();
    expect(row.controls.lineTotal.value).toBeNull();
    expect(editor.getDrafts()[0]?.priceMode).toBe('open');

    row.controls.unitPurchasePrice.setValue(0);
    editor.recalculate(0, 'unitPurchasePrice');

    expect(row.controls.unitPurchasePrice.value).toBe(0);
    expect(row.controls.lineTotal.value).toBe(0);
    expect(editor.getDrafts()[0]?.priceMode).toBe('priced');
  });

  it('meldet nach dem Leeren des Stückpreises beide Preisfelder als unbekannt an den Parent', () => {
    const { editor, linesChanged } = erstelleEditor();
    editor.addProducts([ledProduct]);
    const row = editor.lineRows.at(0);
    row.patchValue({ orderedQuantity: 2, unitPurchasePrice: 4.99 });
    editor.recalculate(0, 'unitPurchasePrice');
    linesChanged.emit.mockClear();

    row.controls.unitPurchasePrice.setValue(null);
    editor.recalculate(0, 'unitPurchasePrice');

    expect(row.controls.lineTotal.value).toBeNull();
    expect(linesChanged.emit).toHaveBeenCalledWith([
      expect.objectContaining({ priceMode: 'open', unitPurchasePrice: null, lineTotal: null }),
    ]);
  });

  it('meldet nach dem Leeren der Positionssumme beide Preisfelder als unbekannt an den Parent', () => {
    const { editor, linesChanged } = erstelleEditor();
    editor.addProducts([ledProduct]);
    const row = editor.lineRows.at(0);
    row.patchValue({ orderedQuantity: 2, lineTotal: 9.98 });
    editor.recalculate(0, 'lineTotal');
    linesChanged.emit.mockClear();

    row.controls.lineTotal.setValue(null);
    editor.recalculate(0, 'lineTotal');

    expect(row.controls.unitPurchasePrice.value).toBeNull();
    expect(linesChanged.emit).toHaveBeenCalledWith([
      expect.objectContaining({ priceMode: 'open', unitPurchasePrice: null, lineTotal: null }),
    ]);
  });

  it('berechnet EK je Stück aus der Positionssumme ohne mehr als zwei Nachkommastellen', () => {
    const { editor } = erstelleEditor();
    editor.addProducts([ledProduct]);

    const row = editor.lineRows.at(0);
    row.patchValue({ orderedQuantity: 5, lineTotal: 29.95 });
    editor.recalculate(0, 'lineTotal');

    expect(row.controls.unitPurchasePrice.value).toBe(5.99);
  });

  it('erhält historische Einzelstückzeilen mit Menge eins', () => {
    const { editor } = erstelleEditor();

    addLegacyLine(editor);

    expect(editor.lineRows.at(0).getRawValue()).toMatchObject({
      lineKind: 'individual',
      orderedQuantity: 1,
    });
  });

  it('gibt jeder neuen Position eine stabile Draft-ID für Zuordnungen im Erfassungsdialog', () => {
    const { editor } = erstelleEditor();
    addLegacyLine(editor);

    expect(editor.getDrafts()).toEqual([
      expect.objectContaining({ draftId: expect.stringMatching(/^draft-/) }),
    ]);
  });

  it('meldet eine geänderte Einzelpositionsbezeichnung an das Elternformular', () => {
    const { editor, linesChanged } = erstelleEditor();
    addLegacyLine(editor);
    linesChanged.emit.mockClear();

    editor.updateTitleSnapshot(0, 'Mystery-Fundstück');

    expect(linesChanged.emit).toHaveBeenCalledWith([
      expect.objectContaining({ titleSnapshot: 'Mystery-Fundstück' }),
    ]);
  });

  it('erfasst normale Positionen mit Zustand und einem preisgebundenen Gesamtbetrag', () => {
    const { editor } = erstelleEditor('single');
    addLegacyLine(editor);

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
    addLegacyLine(editor);

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
    addLegacyLine(editor);
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

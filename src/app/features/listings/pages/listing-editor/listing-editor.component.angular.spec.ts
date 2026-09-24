import '@angular/compiler';
import { signal } from '@angular/core';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '../../../../core/models/flipbase.models';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { ListingExtensionHelpComponent } from '../../components/listing-extension-help/listing-extension-help.component';
import { ListingImageEditorComponent } from '../../components/listing-image-editor/listing-image-editor.component';
import { ListingImagesService } from '../../services/listing-images.service';
import type {
  ListingActionResult,
  ListingContent,
  ListingEditorItem,
  ListingRow,
  KleinanzeigenGenerationOptions,
} from '../../models/listing.models';
import { ListingExtensionService } from '../../services/listing-extension.service';
import { ListingService } from '../../services/listing.service';
import { ListingTemplateService } from '../../services/listing-template.service';
import { ListingEditorComponent } from './listing-editor.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(ButtonComponent, [
    'variant',
    'size',
    'loading',
    'disabled',
    'icon',
    'iconPosition',
    'iconOnly',
    'fullWidth',
    'type',
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
  registerSignalInputs(CustomSelectComponent, [
    'options',
    'value',
    'placeholder',
    'variant',
    'size',
    'disabled',
    'widthClass',
    'openDirection',
    'ariaLabel',
    'triggerId',
  ]);
  registerSignalInputs(EntryPageLayoutComponent, ['title', 'subtitle', 'backLabel']);
  registerSignalInputs(CustomSearchInputComponent, ['value', 'placeholder', 'ariaLabel']);
  registerSignalInputs(ListingImageEditorComponent, ['images', 'disabled']);
  registerSignalInputs(ListingExtensionHelpComponent, [
    'open',
    'checking',
    'available',
    'attempted',
  ]);
  registerSignalInputs(ModalShellComponent, ['title', 'subtitle', 'size']);
  registerSignalInputs(TwoColumnLayoutComponent, ['ratio']);
  registerSignalInputs(TextFieldComponent, [
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
    'autocomplete',
    'required',
    'maxLength',
    'value',
  ]);
  registerSignalInputs(NumberInputComponent, [
    'value',
    'placeholder',
    'step',
    'min',
    'max',
    'unit',
    'id',
    'ariaLabel',
    'ariaDescribedby',
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
  ]);
  registerSignalInputs(CustomCheckboxComponent, [
    'checked',
    'indeterminate',
    'label',
    'disabled',
    'size',
    'color',
    'ariaLabel',
    'id',
  ]);
});

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});

describe('ListingEditorComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function createEditor(options: { readonly extensionAvailable?: boolean } = {}) {
    const items = signal<ListingEditorItem[]>([
      {
        id: 'item-expected-value',
        workspaceId: 'workspace-a',
        title: 'Kamera',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'ready' as const,
        archivedAt: null,
        expectedValue: 79,
        allocatedPurchaseCost: 34,
        media: [],
      },
      {
        id: 'item-cost-only',
        workspaceId: 'workspace-a',
        title: 'Kopfhörer',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'ready' as const,
        archivedAt: null,
        expectedValue: null,
        allocatedPurchaseCost: 22,
        media: [],
      },
      {
        id: 'item-without-value',
        workspaceId: 'workspace-a',
        title: 'Kabel',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'ready' as const,
        archivedAt: null,
        expectedValue: null,
        allocatedPurchaseCost: null,
        media: [],
      },
      {
        id: 'item-reserved',
        workspaceId: 'workspace-a',
        title: 'Reservierter Artikel',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'reserved' as const,
        archivedAt: null,
        expectedValue: null,
        allocatedPurchaseCost: null,
        media: [],
      },
      {
        id: 'item-sold',
        workspaceId: 'workspace-a',
        title: 'Verkaufter Artikel',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'sold' as const,
        archivedAt: null,
        expectedValue: null,
        allocatedPurchaseCost: null,
        media: [],
      },
      {
        id: 'item-archived',
        workspaceId: 'workspace-a',
        title: 'Archivierter Artikel',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'ready' as const,
        archivedAt: '2026-09-20T10:00:00.000Z',
        expectedValue: null,
        allocatedPurchaseCost: null,
        media: [],
      },
      {
        id: 'product-in-stock',
        workspaceId: 'workspace-a',
        targetKind: 'catalog_product',
        availableQuantity: 4,
        title: 'USB-C Hub',
        brand: 'Anker',
        category: 'Elektronik',
        condition: 'new' as const,
        conditionNotes: null,
        description: '7-in-1 Hub',
        status: 'ready' as const,
        archivedAt: null,
        expectedValue: 39,
        allocatedPurchaseCost: 15,
        media: [],
      },
      {
        id: 'product-out-of-stock',
        workspaceId: 'workspace-a',
        targetKind: 'catalog_product',
        availableQuantity: 0,
        title: 'HDMI Kabel',
        brand: 'Anker',
        category: 'Elektronik',
        condition: 'new' as const,
        conditionNotes: null,
        description: '2m',
        status: 'sold' as const,
        archivedAt: null,
        expectedValue: 12,
        allocatedPurchaseCost: 5,
        media: [],
      },
    ]);
    const rows = signal<readonly ListingRow[]>([]);
    const load = vi.fn(async () => undefined);
    const prepare = vi.fn(
      async (
        _itemId: string,
        _content: ListingContent,
        _targetKind?: 'inventory_item' | 'catalog_product',
      ): Promise<ListingActionResult> => ({
        data: null,
        error: null,
      }),
    );
    const getById = vi.fn((): ListingRow | null => null);
    const buildExtensionPayload = vi.fn(async () => ({
      payload: {
        itemId: 'item-expected-value',
        title: 'Inserat',
        description: '',
        price: 79,
        priceType: 'FIXED' as const,
        shippingType: 'pickup' as const,
        images: [],
      },
      missingImages: [] as string[],
    }));
    const confirmOverwrite = vi.fn(async () => false);
    const generateKleinanzeigenListing = vi.fn(
      (_item: InventoryItem, _price: number, _options: KleinanzeigenGenerationOptions) => ({
        title: 'Erzeugter Titel',
        description: 'Erzeugte Beschreibung',
      }),
    );
    const publish = vi.fn(async () => ({ success: true }));
    const warning = vi.fn();

    TestBed.configureTestingModule({
      imports: [ListingEditorComponent],
      providers: [
        provideRouter([{ path: 'listings', component: ListingEditorComponent }]),
        {
          provide: ListingService,
          useValue: {
            items,
            rows,
            loading: signal(false),
            error: signal<string | null>(null),
            loadedWorkspaceId: signal<string | null>(null),
            load,
            clear: vi.fn(),
            getById,
            prepare,
            buildExtensionPayload,
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: 'workspace-a' }) },
        },
        {
          provide: ListingExtensionService,
          useValue: {
            start: vi.fn(),
            available: vi.fn(() => options.extensionAvailable ?? false),
            checking: signal(false),
            checkNow: vi.fn(),
            publish,
          },
        },
        { provide: ListingTemplateService, useValue: { generateKleinanzeigenListing } },
        {
          provide: ListingImagesService,
          useValue: {
            defaults: vi.fn(async () => []),
            load: vi.fn(async () => []),
            save: vi.fn(
              async (_id: string, _workspaceId: string, images: readonly unknown[]) => images,
            ),
          },
        },
        { provide: ConfirmDialogService, useValue: { frage: confirmOverwrite } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn(), warning } },
      ],
    });

    return {
      editor: TestBed.runInInjectionContext(() => new ListingEditorComponent()),
      buildExtensionPayload,
      confirmOverwrite,
      generateKleinanzeigenListing,
      getById,
      items,
      load,
      prepare,
      publish,
      rows,
      warning,
    };
  }

  it('loads listing data for a directly opened editor route', () => {
    const { load } = createEditor();

    TestBed.flushEffects();

    expect(load).toHaveBeenCalledWith('workspace-a');
  });

  it('does not report an untouched create form as unsaved', () => {
    const { editor } = createEditor();

    expect(editor.hasUnsavedChanges()).toBe(false);
  });

  it('rejects whitespace titles and monetary values with more than two decimals', () => {
    const { editor } = createEditor();

    editor.form.controls.title.setValue('   ');
    editor.form.controls.price.setValue(12.345);
    editor.form.controls.shippingPrice.setValue(4.999);

    expect(editor.form.controls.title.invalid).toBe(true);
    expect(editor.form.controls.price.invalid).toBe(true);
    expect(editor.form.controls.shippingPrice.invalid).toBe(true);
  });

  it('prefills the expected value or available cost and preserves a manual price', () => {
    const { editor } = createEditor();

    editor.form.controls.inventoryItemId.setValue('item-expected-value');
    expect(editor.selectedItem()?.title).toBe('Kamera');
    expect(editor.form.controls.price.value).toBe(79);

    editor.form.controls.inventoryItemId.setValue('item-cost-only');
    expect(editor.form.controls.price.value).toBe(22);

    editor.form.controls.inventoryItemId.setValue('item-without-value');
    expect(editor.form.controls.price.value).toBe(0);

    editor.form.controls.price.setValue(65);
    editor.form.controls.price.markAsDirty();
    editor.form.controls.inventoryItemId.setValue('item-cost-only');

    expect(editor.form.controls.price.value).toBe(65);
  });

  it('hides sold and archived items and explains why a reserved item is unavailable', () => {
    const { editor } = createEditor();

    expect(editor.itemOptions().map((option) => option.value)).not.toContain('item-sold');
    expect(editor.itemOptions().map((option) => option.value)).not.toContain('item-archived');
    expect(
      editor.itemOptions().find((option) => option.value === 'item-reserved')?.description,
    ).toBe('Der Artikel ist reserviert.');
  });

  it('does not prepare an item that already has an open listing', async () => {
    const { editor, items, prepare, rows } = createEditor();
    const selectedItem = items()[0]!;
    rows.set([
      {
        listing: {
          id: 'listing-open',
          workspaceId: 'workspace-a',
          inventoryItemId: selectedItem.id,
          platform: 'kleinanzeigen',
          status: 'online',
          endReason: null,
          content: {
            title: 'Bestehendes Inserat',
            description: '',
            price: 79,
            priceType: 'FIXED',
            shippingType: 'pickup',
            shippingPrice: null,
            postalCode: null,
          },
          listedCount: 1,
          lastListedAt: '2026-09-20T10:00:00.000Z',
          onlineSince: '2026-09-20T10:01:00.000Z',
          endedAt: null,
          createdAt: '2026-09-20T10:00:00.000Z',
          updatedAt: '2026-09-20T10:01:00.000Z',
        },
        item: selectedItem,
        primaryImagePath: null,
      },
    ]);
    editor.form.patchValue({
      inventoryItemId: selectedItem.id,
      title: 'Neues Inserat',
      price: 79,
    });

    await editor.save();

    expect(prepare).not.toHaveBeenCalled();
    expect(editor.selectedOpenListing()?.listing.id).toBe('listing-open');
  });

  it('keeps manually edited text when template replacement is cancelled', async () => {
    const { confirmOverwrite, editor } = createEditor();
    editor.form.patchValue({ inventoryItemId: 'item-expected-value', price: 79 });
    editor.form.controls.title.setValue('Manueller Titel');
    editor.form.controls.title.markAsDirty();

    await editor.generate();

    expect(confirmOverwrite).toHaveBeenCalledOnce();
    expect(editor.form.controls.title.value).toBe('Manueller Titel');
  });

  it('maps the selected editor item to the inventory model used by the text generator', async () => {
    const { editor, generateKleinanzeigenListing } = createEditor();
    editor.form.controls.inventoryItemId.setValue('item-expected-value');

    await editor.generate();

    expect(generateKleinanzeigenListing).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'item-expected-value',
        workspace_id: 'workspace-a',
        title: 'Kamera',
        allocated_purchase_cost: 34,
        expected_value: 79,
      }),
      79,
      expect.any(Object),
    );
    expect(generateKleinanzeigenListing.mock.calls[0]?.[0]).not.toHaveProperty('workspaceId');
  });

  it('warns about unresolved images while publishing the remaining payload', async () => {
    const { buildExtensionPayload, editor, getById, items, prepare, publish, warning } =
      createEditor({ extensionAvailable: true });
    const selectedItem = items()[0]!;
    const row: ListingRow = {
      listing: {
        id: 'listing-new',
        workspaceId: 'workspace-a',
        inventoryItemId: selectedItem.id,
        platform: 'kleinanzeigen',
        status: 'prepared',
        endReason: null,
        content: {
          title: 'Neues Inserat',
          description: '',
          price: 79,
          priceType: 'FIXED',
          shippingType: 'pickup',
          shippingPrice: null,
          postalCode: null,
        },
        listedCount: 1,
        lastListedAt: '2026-09-20T10:00:00.000Z',
        onlineSince: null,
        endedAt: null,
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-09-20T10:00:00.000Z',
      },
      item: selectedItem,
      primaryImagePath: null,
    };
    prepare.mockResolvedValueOnce({ data: row.listing, error: null });
    getById.mockReturnValue(row);
    buildExtensionPayload.mockResolvedValueOnce({
      payload: {
        itemId: selectedItem.id,
        title: 'Neues Inserat',
        description: '',
        price: 79,
        priceType: 'FIXED',
        shippingType: 'pickup',
        images: [],
      },
      missingImages: ['defekt.jpg'],
    });
    editor.form.patchValue({
      inventoryItemId: selectedItem.id,
      title: 'Neues Inserat',
      price: 79,
    });

    await editor.save();

    expect(publish).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith('1 Bild konnte nicht übertragen werden.');
  });

  it('has accessible labels for the editor controls', async () => {
    createEditor();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ListingEditorComponent);
    fixture.detectChanges();

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });

  it('explains the fixed text templates, offers a return path and renders the copy action', async () => {
    createEditor();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ListingEditorComponent);
    fixture.componentInstance.form.patchValue({
      title: 'Kamera',
      description: 'Sehr guter Zustand',
    });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const writeText = vi.fn(async () => undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      expect(host.textContent).toContain('Textvorlage');
      expect(host.textContent).toContain(
        'Verwendet feste Formulierungen mit den Artikeldaten. Es wird keine KI eingesetzt.',
      );
      expect(host.textContent).not.toContain('Textstil');
      expect(fixture.componentInstance.styleToneOptions[0]?.label).toBe('Neutral');
      const pageLayout = fixture.debugElement.query(By.directive(EntryPageLayoutComponent));
      expect(pageLayout.componentInstance.backLabel()).toBe('Zurück zu Inseraten');
      expect(host.textContent).toContain('Nichtraucherhinweis');
      expect(host.textContent).toContain('Rechtlichen Hinweis einfügen');
      const copyButton = Array.from(host.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Texte kopieren',
      );
      expect(copyButton).toBeDefined();
      await fixture.componentInstance.copyTexts();
      expect(writeText).toHaveBeenCalledWith('Kamera\n\nSehr guter Zustand');
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    }
  });

  it('shows understandable validation messages for invalid price and shipping fields', async () => {
    createEditor();
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ListingEditorComponent);
    fixture.componentInstance.form.patchValue({
      price: -1,
      shippingType: 'shipping',
      shippingPrice: -2,
      postalCode: '12',
    });
    fixture.componentInstance.form.markAllAsTouched();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Der Preis muss zwischen 0 und 99.999.999 € liegen.');
    expect(text).toContain('Versandkosten dürfen nicht negativ sein.');
    expect(text).toContain('Die Postleitzahl muss aus fünf Ziffern bestehen.');
  });

  it('includes catalog products with stock and excludes products without stock in itemOptions', () => {
    const { editor } = createEditor();

    const options = editor.itemOptions();
    const productOption = options.find((option) => option.value === 'product-in-stock');
    expect(productOption).toBeDefined();
    expect(productOption?.label).toBe('USB-C Hub · Mengenbestand: 4');

    const outOfStockOption = options.find((option) => option.value === 'product-out-of-stock');
    expect(outOfStockOption).toBeUndefined();
  });

  it('prepares a catalog product passing its targetKind upon save', async () => {
    const { editor, prepare } = createEditor();

    editor.form.controls.inventoryItemId.setValue('product-in-stock');
    editor.form.controls.title.setValue('Anker USB-C Hub 7-in-1');

    await editor.save();

    expect(prepare).toHaveBeenCalledWith(
      'product-in-stock',
      expect.objectContaining({
        title: 'Anker USB-C Hub 7-in-1',
        price: 39,
      }),
      'catalog_product',
    );
  });
});

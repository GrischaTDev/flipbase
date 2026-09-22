import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { InventoryItem } from '../../../../core/models/flipbase.models';
import { InventoryService } from '../../../../core/services/inventory.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { MediaService } from '../../../../core/services/media.service';
import { AiAssistantService } from '../../../../core/services/ai-assistant.service';
import { BarcodeLookupService } from '../../../../core/services/barcode-lookup.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { ProductCategoryService } from '../../../../core/services/product-category.service';
import { BrandService } from '../../../../core/services/brand.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { BrandPickerComponent } from '../../../../shared/components/brand-picker/brand-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ItemCreateModalComponent } from './item-create-modal.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs?: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
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
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${url.replace(/^\.\//, '')}`)) matches.push(match);
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
  const buttonMetadata = (ButtonComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  buttonMetadata.outputs = { ...buttonMetadata.outputs, clicked: 'clicked' };

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
  ]);

  registerSignalInputs(ModalShellComponent, [
    'title',
    'subtitle',
    'icon',
    'iconTone',
    'size',
    'closeOnBackdrop',
    'hasFooter',
  ]);
  const modalMetadata = (ModalShellComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  modalMetadata.outputs = { ...modalMetadata.outputs, closed: 'closed' };

  registerSignalInputs(CustomSelectComponent, ['options', 'ariaLabel', 'triggerId', 'size']);
  registerSignalInputs(CategoryPickerComponent, [
    'label',
    'labelHidden',
    'placeholder',
    'suggestion',
    'helpText',
    'id',
  ]);
  registerSignalInputs(BrandPickerComponent, [
    'label',
    'labelHidden',
    'placeholder',
    'suggestion',
    'helpText',
    'id',
  ]);
});
afterEach(() => TestBed.resetTestingModule());
afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    if (snapshot.outputs) {
      metadata.outputs = snapshot.outputs;
    }
  }
});

describe('Gemeinsame Artikelbearbeitung für Paketinhalt', () => {
  it.each([null, 0, 12])('lädt und speichert Kosten %s über das echte Formular', async (cost) => {
    const item: InventoryItem = {
      id: 'content',
      workspace_id: 'ws',
      purchase_id: 'purchase',
      source_package_line_id: 'package',
      title: 'Ein Paar Schuhe',
      category_id: 'el-6-6',
      brand_id: 'brand-1',
      condition: 'used',
      status: 'ready',
      allocated_purchase_cost: cost,
    };
    const updateItem = vi.fn(async () => ({ error: null }));
    TestBed.configureTestingModule({
      imports: [ItemCreateModalComponent],
      providers: [
        { provide: InventoryService, useValue: { updateItem } },
        {
          provide: PurchaseService,
          useValue: {
            purchases: signal([{ id: 'purchase', title: 'Paket', purchase_date: '2026-09-13' }]),
          },
        },
        { provide: MediaService, useValue: {} },
        { provide: AiAssistantService, useValue: {} },
        { provide: BarcodeLookupService, useValue: {} },
        { provide: CatalogService, useValue: {} },
        {
          provide: ProductCategoryService,
          useValue: {
            loadChildren: vi.fn(async () => []),
            search: vi.fn(async () => ({ categories: [], hasMore: false })),
            getById: vi.fn(async () => null),
          },
        },
        {
          provide: BrandService,
          useValue: {
            brands: signal([]),
            loading: signal(false),
            loadError: signal(null),
            ensureLoaded: vi.fn(async () => undefined),
            reload: vi.fn(async () => undefined),
            search: () => [],
            findByName: () => null,
            findById: () => null,
            create: vi.fn(),
          },
        },
        { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'ws' }) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: SyncStatusService, useValue: { istZentralGemeldet: () => false } },
      ],
    });
    const fixture = TestBed.createComponent(ItemCreateModalComponent);
    Object.assign(fixture.componentInstance, { item: signal(item), presentation: signal('page') });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const costInput = host.querySelector<HTMLInputElement>('#itemCost')!;
    expect(costInput.value).toBe(cost === null ? '' : String(cost));
    expect(fixture.componentInstance.form.getRawValue()).toMatchObject({
      category_id: 'el-6-6',
      brand_id: 'brand-1',
    });
    expect(fixture.componentInstance.form.controls.purchase_id.disabled).toBe(true);
    expect(host.textContent).toContain('Die Herkunft bleibt unverändert');
    const title = host.querySelector<HTMLInputElement>('#itemTitle')!;
    title.value = 'Schuhe mit neuer Beschreibung';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.componentInstance.form.patchValue({ category_id: null, brand_id: null });
    await fixture.componentInstance.onSubmit();
    expect(updateItem).toHaveBeenCalledWith(
      'content',
      expect.objectContaining({
        title: title.value,
        allocated_purchase_cost: cost,
        purchase_id: 'purchase',
        categoryId: null,
        brandId: null,
      }),
    );
  });
});

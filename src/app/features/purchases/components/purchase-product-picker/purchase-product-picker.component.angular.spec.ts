import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { PurchaseProductPickerComponent } from './purchase-product-picker.component';

interface AngularBindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const metadataSnapshots = new Map<unknown, AngularBindingMetadata>();

function bridgeBindings(
  component: unknown,
  inputs: readonly string[],
  outputs: readonly string[] = [],
): void {
  const type = component as {
    ɵcmp?: AngularBindingMetadata;
    ɵdir?: AngularBindingMetadata;
  };
  const metadata = type.ɵcmp ?? type.ɵdir;
  if (!metadata) throw new Error('Angular-Metadaten fehlen');
  metadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputs.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputs.map((name) => [name, name])),
  };
  metadata.outputs = {
    ...metadata.outputs,
    ...Object.fromEntries(outputs.map((name) => [name, name])),
  };
}

const product: CatalogProduct = {
  id: 'product-1',
  workspace_id: 'workspace-1',
  title: 'Nike Air Max',
  brand: 'Nike',
  category: 'Schuhe > Sneaker',
  tracking_mode: 'quantity',
  is_public_store: false,
};

describe('PurchaseProductPickerComponent', () => {
  beforeAll(async () => {
    const resources: Readonly<Record<string, string>> = {
      './purchase-product-picker.component.html':
        'src/app/features/purchases/components/purchase-product-picker/purchase-product-picker.component.html',
      './modal-shell.component.html':
        'src/app/shared/components/modal-shell/modal-shell.component.html',
      './modal-shell.component.scss':
        'src/app/shared/components/modal-shell/modal-shell.component.scss',
      './text-field.component.html':
        'src/app/shared/components/text-field/text-field.component.html',
      './text-field.component.scss':
        'src/app/shared/components/text-field/text-field.component.scss',
      './custom-checkbox.component.html':
        'src/app/shared/components/custom-checkbox/custom-checkbox.component.html',
      './custom-checkbox.component.scss':
        'src/app/shared/components/custom-checkbox/custom-checkbox.component.scss',
      './custom-select.component.html':
        'src/app/shared/components/custom-select/custom-select.component.html',
      './custom-select.component.scss':
        'src/app/shared/components/custom-select/custom-select.component.scss',
      './button.component.html': 'src/app/shared/components/button/button.component.html',
      './button.component.scss': 'src/app/shared/components/button/button.component.scss',
      './product-thumbnail.component.html':
        'src/app/shared/components/product-thumbnail/product-thumbnail.component.html',
    };
    await ɵresolveComponentResources((url) => {
      const resourcePath = resources[url];
      if (!resourcePath) throw new Error(`Unbekannte Komponenten-Ressource: ${url}`);
      return readFile(resolve(resourcePath), 'utf8');
    });

    bridgeBindings(
      PurchaseProductPickerComponent,
      ['products', 'initialSearch', 'imageUrls'],
      ['createRequested', 'imageFailed', 'closed', 'selected'],
    );
    bridgeBindings(ModalShellComponent, ['title', 'size'], ['closed']);
    bridgeBindings(ModalDialogDirective, ['dialogTitel', 'schliesstBeiKlickAussen']);
    bridgeBindings(TextFieldComponent, ['label', 'placeholder']);
    bridgeBindings(CustomSelectComponent, [
      'options',
      'variant',
      'widthClass',
      'ariaLabel',
      'placeholder',
      'value',
    ]);
    (CustomSelectComponent as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp.outputs = {
      ...(CustomSelectComponent as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp.outputs,
      value: 'valueChange',
    };
    bridgeBindings(CustomCheckboxComponent, ['checked', 'ariaLabel']);
    (CustomCheckboxComponent as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp.outputs = {
      ...(CustomCheckboxComponent as unknown as { ɵcmp: AngularBindingMetadata }).ɵcmp.outputs,
      checked: 'checkedChange',
    };
    bridgeBindings(ButtonComponent, ['variant', 'disabled', 'icon'], ['clicked']);
    bridgeBindings(ProductThumbnailComponent, ['src'], ['imageFailed']);
  });

  afterAll(() => {
    for (const [component, snapshot] of metadataSnapshots) {
      const type = component as {
        ɵcmp?: AngularBindingMetadata;
        ɵdir?: AngularBindingMetadata;
      };
      const metadata = type.ɵcmp ?? type.ɵdir;
      if (!metadata) continue;
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
      metadata.outputs = snapshot.outputs;
    }
  });

  afterEach(() => TestBed.resetTestingModule());

  it('bietet archivierte Artikel für neue Einkaufspositionen nicht an', async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseProductPickerComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(PurchaseProductPickerComponent);
    fixture.componentRef.setInput('products', [
      product,
      { ...product, id: 'archived', title: 'Altartikel', archived_at: '2026-09-24' },
    ]);
    fixture.detectChanges();
    expect(fixture.componentInstance.filtered().map((entry) => entry.id)).toEqual(['product-1']);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-product-option="archived"]'),
    ).toBeNull();
  });

  it('waehlt eine Ergebniszeile und einen Checkbox-Klick jeweils genau einmal aus', async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseProductPickerComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(PurchaseProductPickerComponent);
    fixture.componentRef.setInput('products', [product]);
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-product-option="product-1"]',
    );

    expect(row).not.toBeNull();
    expect(row?.tagName).toBe('BUTTON');
    expect(row?.getAttribute('role')).toBeNull();
    expect(row?.getAttribute('aria-pressed')).toBe('false');
    expect(row?.querySelector('button[role="checkbox"]')).toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('app-modal-shell')?.title,
    ).toBe('');
    const createButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      'footer app-button',
    );
    expect(createButton?.textContent).toContain('Produkt erstellen');
    expect(createButton?.querySelector('button svg')).not.toBeNull();
    row?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selection().has(product.id)).toBe(true);
    expect(row?.getAttribute('aria-pressed')).toBe('true');

    fixture.componentInstance.toggle(product.id);
    expect(fixture.componentInstance.selection().has(product.id)).toBe(false);
  });

  it('filtert nach vorhandener Kategorie und Marke und setzt beide Filter zurück', async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseProductPickerComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(PurchaseProductPickerComponent);
    fixture.componentRef.setInput('products', [
      product,
      { ...product, id: 'product-2', title: 'Adidas Campus', brand: 'Adidas' },
      {
        ...product,
        id: 'product-3',
        title: 'Apple iPhone',
        brand: 'Apple',
        category: 'Smartphones',
      },
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.categoryOptions().map((option) => option.label)).toEqual([
      'Alle Kategorien',
      'Smartphones',
      'Sneaker',
    ]);
    expect(fixture.componentInstance.brandOptions().map((option) => option.label)).toEqual([
      'Alle Marken',
      'Adidas',
      'Apple',
      'Nike',
    ]);

    expect(fixture.componentInstance.categoryOptions()[2]?.value).toBe('Schuhe > Sneaker');
    fixture.componentInstance.categoryFilter.set('Schuhe > Sneaker');
    fixture.componentInstance.brandFilter.set('Nike');
    fixture.detectChanges();
    expect(
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-product-option]')].map(
        (row) => row.getAttribute('data-product-option'),
      ),
    ).toEqual(['product-1']);

    fixture.componentInstance.resetFilters();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-product-option]').length,
    ).toBe(3);
  });

  it('besteht den strukturellen AXE-Check mit genau einem Auswahlsteuerelement je Zeile', async () => {
    await TestBed.configureTestingModule({
      imports: [PurchaseProductPickerComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(PurchaseProductPickerComponent);
    fixture.componentRef.setInput('products', [product]);
    fixture.detectChanges();

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});

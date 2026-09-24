import '@angular/compiler';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Brand } from '../../../../core/models/product-category.models';
import { ProductCategory } from '../../../../core/models/product-category.models';
import { BrandService } from '../../../../core/services/brand.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { MediaService } from '../../../../core/services/media.service';
import { ProductCategoryService } from '../../../../core/services/product-category.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BrandPickerComponent } from '../../../../shared/components/brand-picker/brand-picker.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { ProductDialogComponent } from './product-dialog.component';

const brand: Brand = { id: 'brand-1', workspaceId: 'workspace-1', name: 'Sony' };
const category: ProductCategory = {
  id: 'category-1',
  parentId: null,
  name: 'Laptops',
  fullName: 'Elektronik > Computer > Laptops',
  level: 3,
  isLeaf: true,
  isDeprecated: false,
};

const brands = [brand];
const categories = [category];
const activeWorkspace = signal<{ id: string } | null>({ id: 'workspace-1' });
const catalog = {
  createProduct: vi.fn(async (input: { title: string; workspaceId: string }) => ({
    data: {
      id: 'product-1',
      workspace_id: input.workspaceId,
      title: input.title,
      tracking_mode: 'quantity' as const,
      is_public_store: false,
    },
    error: null,
    reportedBySyncStatus: false,
  })),
  loadProducts: vi.fn(async () => undefined),
};
const brandService = {
  brands: signal<readonly Brand[]>(brands),
  loading: signal(false),
  loadError: signal<Error | null>(null),
  ensureLoaded: vi.fn(async () => undefined),
  reload: vi.fn(async () => undefined),
  search: vi.fn((term: string) =>
    brands.filter((entry) => entry.name.toLocaleLowerCase().includes(term.toLocaleLowerCase())),
  ),
  findByName: vi.fn(
    (name: string) =>
      brands.find((entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? null,
  ),
  findById: vi.fn((id: string) => brands.find((entry) => entry.id === id) ?? null),
  create: vi.fn(async () => ({ data: brand, error: null as Error | null })),
};
const categoryService = {
  loadChildren: vi.fn(async () => categories),
  search: vi.fn(async () => ({ categories, hasMore: false })),
  getById: vi.fn(async (id: string) => categories.find((entry) => entry.id === id) ?? null),
};

beforeAll(async () => {
  const resourcePath = (path: string) => resolve(process.cwd(), path);
  const resources = new Map<string, string>([
    [
      './product-dialog.component.html',
      resourcePath(
        'src/app/features/catalog/components/product-dialog/product-dialog.component.html',
      ),
    ],
    [
      './brand-management-dialog.component.html',
      resourcePath(
        'src/app/features/catalog/components/brand-management-dialog/brand-management-dialog.component.html',
      ),
    ],
    [
      './brand-picker.component.html',
      resourcePath('src/app/shared/components/brand-picker/brand-picker.component.html'),
    ],
    [
      './barcode-scanner.component.html',
      resourcePath('src/app/shared/components/barcode-scanner/barcode-scanner.component.html'),
    ],
    [
      './barcode-scanner.component.scss',
      resourcePath('src/app/shared/components/barcode-scanner/barcode-scanner.component.scss'),
    ],
    [
      './brand-picker.component.scss',
      resourcePath('src/app/shared/components/brand-picker/brand-picker.component.scss'),
    ],
    [
      './category-picker.component.html',
      resourcePath('src/app/shared/components/category-picker/category-picker.component.html'),
    ],
    [
      './category-picker.component.scss',
      resourcePath('src/app/shared/components/category-picker/category-picker.component.scss'),
    ],
    [
      './modal-shell.component.html',
      resourcePath('src/app/shared/components/modal-shell/modal-shell.component.html'),
    ],
    [
      './modal-shell.component.scss',
      resourcePath('src/app/shared/components/modal-shell/modal-shell.component.scss'),
    ],
    [
      './text-field.component.html',
      resourcePath('src/app/shared/components/text-field/text-field.component.html'),
    ],
    [
      './text-field.component.scss',
      resourcePath('src/app/shared/components/text-field/text-field.component.scss'),
    ],
    [
      './button.component.html',
      resourcePath('src/app/shared/components/button/button.component.html'),
    ],
    [
      './button.component.scss',
      resourcePath('src/app/shared/components/button/button.component.scss'),
    ],
    [
      './custom-select.component.html',
      resourcePath('src/app/shared/components/custom-select/custom-select.component.html'),
    ],
    [
      './custom-select.component.scss',
      resourcePath('src/app/shared/components/custom-select/custom-select.component.scss'),
    ],
    [
      './custom-checkbox.component.html',
      resourcePath('src/app/shared/components/custom-checkbox/custom-checkbox.component.html'),
    ],
    [
      './custom-checkbox.component.scss',
      resourcePath('src/app/shared/components/custom-checkbox/custom-checkbox.component.scss'),
    ],
    [
      './number-input.component.html',
      resourcePath('src/app/shared/components/number-input/number-input.component.html'),
    ],
    [
      './number-input.component.scss',
      resourcePath('src/app/shared/components/number-input/number-input.component.scss'),
    ],
  ]);
  await ɵresolveComponentResources(async (url) => {
    const resource = resources.get(url);
    if (!resource) throw new Error(`Testressource nicht gefunden: ${url}`);
    return readFile(resource, 'utf8');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductDialogComponent],
    providers: [
      { provide: CatalogService, useValue: catalog },
      { provide: MediaService, useValue: { uploadProductMedia: vi.fn() } },
      { provide: WorkspaceService, useValue: { currentWorkspace: activeWorkspace } },
      { provide: BrandService, useValue: brandService },
      { provide: ProductCategoryService, useValue: categoryService },
    ],
  });
  TestBed.overrideComponent(ProductDialogComponent, {
    set: {
      imports: [ReactiveFormsModule, BrandPickerComponent, CategoryPickerComponent],
      template: `
        <form [formGroup]="form">
          <app-brand-picker formControlName="brandId" [suggestion]="brandSuggestion()" />
          <app-category-picker formControlName="categoryId" [suggestion]="categorySuggestion()" />
        </form>
      `,
    },
  });
});

afterEach(() => TestBed.resetTestingModule());

async function settle(fixture: ComponentFixture<ProductDialogComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('ProductDialogComponent picker integration', () => {
  it('bezeichnet die freie Zustandsangabe schlicht als Notiz', async () => {
    const template = await readFile(
      resolve(
        process.cwd(),
        'src/app/features/catalog/components/product-dialog/product-dialog.component.html',
      ),
      'utf8',
    );

    expect(template).toContain('label="Notiz"');
    expect(template).not.toContain('Mängelnotiz');
  });

  it('bietet direkt aus der Produkterstellung eine Markenverwaltung an', async () => {
    const template = await readFile(
      resolve(
        process.cwd(),
        'src/app/features/catalog/components/product-dialog/product-dialog.component.html',
      ),
      'utf8',
    );

    expect(template).toContain('Marken verwalten');
    expect(template).toContain('<app-brand-management-dialog');
  });

  it('bindet Testauswahlen an die ID-Controls und leert beide Picker als null', async () => {
    const fixture = TestBed.createComponent(ProductDialogComponent);
    await settle(fixture);

    const brandPicker = fixture.debugElement.query(By.directive(BrandPickerComponent))
      .componentInstance as BrandPickerComponent;
    const categoryPicker = fixture.debugElement.query(By.directive(CategoryPickerComponent))
      .componentInstance as CategoryPickerComponent;

    brandPicker.choose(brand);
    categoryPicker.select(category);
    expect(fixture.componentInstance.form.get('brandId')?.value).toBe('brand-1');
    expect(fixture.componentInstance.form.get('categoryId')?.value).toBe('category-1');

    brandPicker.clear();
    categoryPicker.clear();
    expect(fixture.componentInstance.form.get('brandId')?.value).toBeNull();
    expect(fixture.componentInstance.form.get('categoryId')?.value).toBeNull();
  });

  it('übernimmt beim Erstellen die gewählten Picker-IDs in die Payload', async () => {
    const fixture = TestBed.createComponent(ProductDialogComponent);
    await settle(fixture);
    const component = fixture.componentInstance;
    component.form.controls.title.setValue('Neue Kamera');
    component.form.get('brandId')?.setValue('brand-1');
    component.form.get('categoryId')?.setValue('category-1');

    await component.save();

    expect(catalog.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        categoryId: 'category-1',
      }),
    );
  });
});

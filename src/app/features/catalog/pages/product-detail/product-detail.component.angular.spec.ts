import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogProduct, CatalogProductMedia } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { BarcodeLookupService } from '../../../../core/services/barcode-lookup.service';
import { MediaService } from '../../../../core/services/media.service';
import { StockService } from '../../../../core/services/stock.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { canLeaveUnsavedEntry } from '../../../../shared/guards/unsaved-entry.guard';
import { ProductDetailComponent } from './product-detail.component';

const original: CatalogProduct = {
  id: 'product-1',
  workspace_id: 'workspace-1',
  title: 'Alter Titel',
  brand: 'Sony',
  brand_id: 'brand-1',
  category: 'Elektronik > Computer > Laptops',
  category_id: 'category-1',
  condition: 'very_good',
  condition_notes: 'Leichte Gebrauchsspuren',
  sku: 'SKU-42',
  size: '42',
  color: 'Schwarz',
  material: 'Leder',
  description: 'Alte Beschreibung',
  tracking_mode: 'quantity',
  is_public_store: false,
};
const image: CatalogProductMedia = {
  id: 'image-1',
  catalog_product_id: original.id,
  workspace_id: original.workspace_id,
  storage_path: 'images/one.webp',
  is_primary: true,
  sort_order: 0,
};

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('ProductDetailComponent', () => {
  const activeWorkspace = signal<{ id: string } | null>({ id: original.workspace_id });
  let component: ProductDetailComponent;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const catalog = {
    products: signal<CatalogProduct[]>([]),
    updateProductPrimaryMedia: vi.fn(),
    loadError: signal<Error | null>(null),
    loadProducts: vi.fn(async () => undefined),
    loadProduct: vi.fn(
      async (
        id: string,
        workspaceId: string,
      ): Promise<{
        data: CatalogProduct | null;
        error: Error | null;
        reportedBySyncStatus: boolean;
      }> => ({
        data:
          catalog
            .products()
            .find((product) => product.id === id && product.workspace_id === workspaceId) ?? null,
        error: catalog.loadError(),
        reportedBySyncStatus: false,
      }),
    ),
    loadProductEntries: vi.fn(async () => ({ data: [], error: null, reportedBySyncStatus: false })),
    createProduct: vi.fn(async (input: { title: string; workspaceId: string }) => ({
      data: {
        ...original,
        id: 'created-product',
        title: input.title,
        workspace_id: input.workspaceId,
      },
      error: null as Error | null,
      reportedBySyncStatus: false,
    })),
    updateProduct: vi.fn(
      async (_id: string, input: { title?: string; description?: string | null }) => ({
        data: {
          ...original,
          title: input.title ?? original.title,
          description: input.description ?? original.description,
        },
        error: null as Error | null,
        reportedBySyncStatus: false,
      }),
    ),
  };
  const media = {
    getMediaUrl: vi.fn((path: string) => path),
    updateProductMediaLayout: vi.fn(
      async (
        _id: string,
        ids: readonly string[],
        _expected: readonly string[],
        _workspace: string,
      ) => ({
        data: ids.map((id, index) => ({
          ...image,
          id,
          sort_order: index,
          is_primary: index === 0,
        })),
        error: null as Error | null,
        reportedBySyncStatus: false,
      }),
    ),
    loadProductMedia: vi.fn(async (): Promise<CatalogProductMedia[]> => []),
    uploadProductMedia: vi.fn(
      async (
        _id: string,
        file: File,
      ): Promise<{ data: CatalogProductMedia | null; error: Error | null }> => ({
        data: { ...image, id: file.name === 'two.webp' ? 'image-2' : image.id },
        error: null,
      }),
    ),
  };
  const stock = {
    loadedWorkspaceId: signal<string | null>(original.workspace_id),
    positions: signal([]),
    lots: signal([]),
    loadError: signal<Error | null>(null),
    loadPositions: vi.fn(async () => undefined),
  };
  const barcodeLookup = {
    lookupInventoryByEan: vi.fn(async () => null),
    lookupExternalByEan: vi.fn(async () => ({
      ean: '4006381333931',
      title: 'Externe Kamera',
      brand: 'Beispielmarke',
      category: 'Elektronik',
    })),
  };

  function queueFiles(files: File[]): void {
    component.imageDrafts.set(
      files.map((file, index) => ({ key: `file-${index}`, file, media: null, previewUrl: '' })),
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    activeWorkspace.set({ id: original.workspace_id });
    catalog.products.set([{ ...original }]);
    catalog.loadError.set(null);
    stock.loadError.set(null);
    params = new BehaviorSubject(convertToParamMap({ id: original.id }));
    query = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            queryParamMap: query,
            snapshot: { paramMap: params.value, queryParamMap: query.value },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn(async () => true) } },
        { provide: WorkspaceService, useValue: { currentWorkspace: activeWorkspace } },
        { provide: CatalogService, useValue: catalog },
        { provide: BarcodeLookupService, useValue: barcodeLookup },
        { provide: StockService, useValue: stock },
        { provide: MediaService, useValue: media },
      ],
    });
    component = TestBed.runInInjectionContext(() => new ProductDetailComponent());
    TestBed.tick();
    await component.reload();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('lädt den bestehenden Artikel, verwendet den id-Parameter und aktiviert Bestand per Query', () => {
    expect(component.product()?.id).toBe(original.id);
    expect(component.form.controls.description.value).toBe('Alte Beschreibung');
    expect(component.form.get('brandId')?.value).toBe('brand-1');
    expect(component.form.get('categoryId')?.value).toBe('category-1');
    expect(component.form.controls.condition.value).toBe('very_good');
    expect(component.form.controls.conditionNotes.value).toBe('Leichte Gebrauchsspuren');
    expect(component.form.controls.sku.value).toBe('SKU-42');
    expect(component.form.controls.size.value).toBe('42');
    expect(component.form.controls.color.value).toBe('Schwarz');
    expect(component.form.controls.material.value).toBe('Leder');
    expect(component.stockView()).toBe(false);
    query.next(convertToParamMap({ view: 'stock' }));
    expect(component.stockView()).toBe(true);
    expect(catalog.loadProductEntries).toHaveBeenCalledWith(original.id, original.workspace_id);
  });

  it('sendet beim Bearbeiten die Picker-IDs und übernimmt das Leeren als null', async () => {
    component.form.get('brandId')?.setValue(null);
    component.form.get('categoryId')?.setValue(null);

    await component.save();

    expect(catalog.updateProduct).toHaveBeenCalledWith(
      original.id,
      expect.objectContaining({ brandId: null, categoryId: null }),
    );
  });

  it('speichert die erweiterten Artikeldaten beim späteren Bearbeiten', async () => {
    component.form.controls.condition.setValue('used');
    component.form.controls.conditionNotes.setValue('Kleine Kerbe');
    component.form.controls.sku.setValue('SKU-43');
    component.form.controls.size.setValue('43');
    component.form.controls.color.setValue('Braun');
    component.form.controls.material.setValue('Wildleder');

    await component.save();

    expect(catalog.updateProduct).toHaveBeenCalledWith(
      original.id,
      expect.objectContaining({
        condition: 'used',
        conditionNotes: 'Kleine Kerbe',
        sku: 'SKU-43',
        size: '43',
        color: 'Braun',
        material: 'Wildleder',
      }),
    );
  });

  it('speichert Änderungen über updateProduct und beendet den Guard-Entwurf erst nach Erfolg', async () => {
    component.form.controls.title.setValue('Neu');
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(canLeaveUnsavedEntry(component, () => false)).toBe(false);
    await component.save();
    expect(catalog.updateProduct).toHaveBeenCalledWith(
      original.id,
      expect.objectContaining({
        title: 'Neu',
        workspaceId: original.workspace_id,
        description: 'Alte Beschreibung',
      }),
    );
    expect(component.hasUnsavedChanges()).toBe(false);
    expect(component.savedMessage()).toBe('Artikel gespeichert.');
  });

  it('überschreibt laufende Eingaben beim erneuten Laden nicht', async () => {
    component.form.controls.title.setValue('Mein Entwurf');
    catalog.products.set([{ ...original, title: 'Serveränderung' }]);
    await component.reload();
    expect(component.form.controls.title.value).toBe('Mein Entwurf');
    expect(component.hasUnsavedChanges()).toBe(true);
    component.discard();
    expect(component.form.controls.title.value).toBe('Serveränderung');
    expect(component.hasUnsavedChanges()).toBe(false);
  });

  it('erhält beim Umbenennen eines internen Artikels den gespeicherten Shoppreis', async () => {
    const internalProduct = { ...original, listing_price: 99 };
    catalog.products.set([internalProduct]);
    await component.reload();
    component.form.controls.title.setValue('Neuer Name');
    catalog.updateProduct.mockResolvedValueOnce({
      data: { ...internalProduct, title: 'Neuer Name', description: original.description },
      error: null,
      reportedBySyncStatus: false,
    });

    await component.save();

    expect(catalog.updateProduct).toHaveBeenCalledExactlyOnceWith(
      original.id,
      expect.objectContaining({ title: 'Neuer Name', isPublicStore: false, listingPrice: 99 }),
    );
    expect(component.form.controls.listingPrice.value).toBe(99);
    expect(component.hasUnsavedChanges()).toBe(false);
  });

  it('behält den Entwurf bei Workspacewechsel und blockiert das Speichern', async () => {
    component.form.controls.title.setValue('Mein Entwurf');
    activeWorkspace.set({ id: 'workspace-2' });
    TestBed.tick();
    await component.save();
    expect(component.form.controls.title.value).toBe('Mein Entwurf');
    expect(component.workspaceChanged()).toBe(true);
    expect(catalog.updateProduct).not.toHaveBeenCalled();
  });

  it('startet nach einem Workspacewechsel während des Updates keinen Bild-Upload', async () => {
    const pending = deferred<Awaited<ReturnType<typeof catalog.updateProduct>>>();
    catalog.updateProduct.mockReturnValueOnce(pending.promise);
    component.form.controls.title.setValue('Neu');
    queueFiles([new File(['a'], 'one.webp', { type: 'image/webp' })]);
    const save = component.save();
    expect(component.isSaving()).toBe(true);
    expect(canLeaveUnsavedEntry(component, () => true)).toBe(false);
    activeWorkspace.set({ id: 'workspace-2' });
    TestBed.tick();
    pending.resolve({
      data: { ...original, title: 'Neu', description: original.description },
      error: null,
      reportedBySyncStatus: false,
    });
    await save;
    expect(media.uploadProductMedia).not.toHaveBeenCalled();
    expect(component.savedMessage()).toBeNull();
    expect(component.isSaving()).toBe(false);
  });

  it('behält nach einem Speicherfehler Eingaben und zeigt die Ursache', async () => {
    catalog.updateProduct.mockResolvedValueOnce({
      data: { ...original, description: original.description },
      error: new Error('Offline'),
      reportedBySyncStatus: false,
    });
    component.form.controls.title.setValue('Neu');
    await component.save();
    expect(component.saveError()).toBe('Offline');
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(component.form.enabled).toBe(true);
  });

  it('quittiert einen erfolgreichen Upload im ursprünglichen Entwurf auch nach Workspacewechsel', async () => {
    const first = new File(['a'], 'one.webp', { type: 'image/webp' });
    const second = new File(['b'], 'two.webp', { type: 'image/webp' });
    const pending = deferred<Awaited<ReturnType<typeof media.uploadProductMedia>>>();
    media.uploadProductMedia.mockReturnValueOnce(pending.promise);
    queueFiles([first, second]);
    const save = component.save();

    activeWorkspace.set({ id: 'workspace-2' });
    TestBed.tick();
    pending.resolve({ data: image, error: null });
    await save;

    expect(component.pendingImages()).toEqual([second]);
    expect(component.images()).toEqual([image]);
    expect(component.savedMessage()).toBeNull();
    activeWorkspace.set({ id: original.workspace_id });
    await component.reload();
    await component.save();
    expect(media.uploadProductMedia.mock.calls.map((call) => call[1])).toEqual([first, second]);
    expect(component.pendingImages()).toEqual([]);
  });

  it('lässt bei verspätetem Upload-Erfolg den Zustand eines anderen Artikels unverändert', async () => {
    const file = new File(['a'], 'one.webp', { type: 'image/webp' });
    const pending = deferred<Awaited<ReturnType<typeof media.uploadProductMedia>>>();
    media.uploadProductMedia.mockReturnValueOnce(pending.promise);
    queueFiles([file]);
    const save = component.save();
    const otherProduct = { ...original, id: 'other-product', workspace_id: 'workspace-2' };
    const otherImage = {
      ...image,
      id: 'other-image',
      catalog_product_id: otherProduct.id,
      workspace_id: otherProduct.workspace_id,
    };
    activeWorkspace.set({ id: otherProduct.workspace_id });
    params.next(convertToParamMap({ id: otherProduct.id }));
    component.product.set(otherProduct);
    queueFiles([file]);
    component.images.set([otherImage]);
    component.savedMessage.set('Meldung des anderen Artikels');

    pending.resolve({ data: image, error: null });
    await save;

    expect(component.pendingImages()).toEqual([file]);
    expect(component.images()).toEqual([otherImage]);
    expect(component.product()).toEqual(otherProduct);
    expect(component.savedMessage()).toBe('Meldung des anderen Artikels');
  });

  it('wiederholt nach einem Bildfehler nur ausstehende Uploads, ohne erneutes Update', async () => {
    const first = new File(['a'], 'one.webp', { type: 'image/webp' });
    const second = new File(['b'], 'two.webp', { type: 'image/webp' });
    component.form.controls.title.setValue('Neu');
    queueFiles([first, second]);
    media.uploadProductMedia
      .mockResolvedValueOnce({ data: image, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('Speicher voll') });
    await component.save();
    expect(component.pendingImages()).toEqual([second]);
    expect(component.images()).toEqual([image]);
    expect(component.saveError()).toContain('Speicher voll');
    expect(component.hasUnsavedChanges()).toBe(true);
    await component.save();
    expect(catalog.updateProduct).toHaveBeenCalledTimes(1);
    expect(media.uploadProductMedia.mock.calls.map((call) => call[1])).toEqual([
      first,
      second,
      second,
    ]);
    expect(component.hasUnsavedChanges()).toBe(false);
  });

  it('zeigt einen Medienladefehler, ohne die Artikeldaten zu verwerfen', async () => {
    media.loadProductMedia.mockRejectedValueOnce(new Error('Bilder offline'));
    await component.loadImages();
    expect(component.mediaError()).toBe('Bilder offline');
    expect(component.product()?.id).toBe(original.id);
    await component.loadImages();
    expect(component.mediaError()).toBeNull();
  });

  it('zeigt unbekannte Artikel und Ladefehler getrennt', async () => {
    catalog.products.set([]);
    await component.reload();
    expect(component.product()).toBeNull();
    expect(component.loadError()).toBeNull();
    catalog.loadError.set(new Error('Keine Verbindung'));
    await component.reload();
    expect(component.loadError()).toBe('Keine Verbindung');
  });

  it('ignoriert verspätete Artikelantworten nach einem Routenwechsel', async () => {
    const pending = deferred<Awaited<ReturnType<typeof catalog.loadProduct>>>();
    catalog.loadProduct.mockReturnValueOnce(pending.promise);
    const load = component.reload();
    params.next(convertToParamMap({ id: 'different-product' }));
    catalog.products.set([{ ...original, id: 'different-product', title: 'Zweiter Artikel' }]);
    await component.reload();
    pending.resolve({ data: original, error: null, reportedBySyncStatus: false });
    await load;
    expect(component.product()?.id).toBe('different-product');
    expect(component.form.controls.title.value).toBe('Zweiter Artikel');
  });
  async function openNew(): Promise<void> {
    params.next(convertToParamMap({}));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            queryParamMap: query,
            snapshot: { paramMap: params.value, queryParamMap: query.value },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn(async () => true) } },
        { provide: WorkspaceService, useValue: { currentWorkspace: activeWorkspace } },
        { provide: CatalogService, useValue: catalog },
        { provide: BarcodeLookupService, useValue: barcodeLookup },
        { provide: StockService, useValue: stock },
        { provide: MediaService, useValue: media },
      ],
    });
    component = TestBed.runInInjectionContext(() => new ProductDetailComponent());
    TestBed.tick();
  }

  it('erstellt einen internen Artikel und verhindert eine leere Anlage', async () => {
    await openNew();
    expect(component.creating()).toBe(true);
    expect(component.hasUnsavedChanges()).toBe(false);
    await component.save();
    expect(catalog.createProduct).not.toHaveBeenCalled();
    component.form.controls.title.setValue('Neue Kamera');
    component.form.get('brandId')?.setValue('brand-1');
    component.form.get('categoryId')?.setValue('category-1');
    expect(component.hasUnsavedChanges()).toBe(true);
    await component.save();
    expect(catalog.createProduct).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: 'Neue Kamera',
        workspaceId: original.workspace_id,
        isPublicStore: false,
        brandId: 'brand-1',
        categoryId: 'category-1',
      }),
    );
    expect(component.product()?.id).toBe('created-product');
    expect(component.hasUnsavedChanges()).toBe(false);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/catalog', 'created-product'], {
      replaceUrl: true,
    });
  });

  it('schlägt externe Produktdaten erst nach erfolgloser lokaler EAN-Suche vor', async () => {
    await openNew();
    catalog.products.set([]);

    await component.searchBarcode('4006381333931');

    expect(barcodeLookup.lookupExternalByEan).toHaveBeenCalledWith('4006381333931');
    expect(component.barcodeSuggestion()?.title).toBe('Externe Kamera');
    expect(component.form.controls.title.value).toBe('');
    component.useBarcodeSuggestion();
    expect(component.form.controls.title.value).toBe('Externe Kamera');
    expect(component.brandSuggestion()).toBe('Beispielmarke');
  });

  it('legt bei einem Bildfehler und erneutem Speichern keinen zweiten Artikel an', async () => {
    await openNew();
    component.form.controls.title.setValue('Neue Kamera');
    queueFiles([new File(['a'], 'one.webp', { type: 'image/webp' })]);
    media.uploadProductMedia.mockResolvedValueOnce({ data: null, error: new Error('Offline') });
    await component.save();
    expect(component.product()?.id).toBe('created-product');
    expect(component.saveError()).toContain('Offline');
    media.uploadProductMedia.mockResolvedValueOnce({
      data: { ...image, catalog_product_id: 'created-product' },
      error: null,
    });
    media.updateProductMediaLayout.mockResolvedValueOnce({
      data: [{ ...image, catalog_product_id: 'created-product' }],
      error: null,
      reportedBySyncStatus: false,
    });
    await component.save();
    expect(catalog.createProduct).toHaveBeenCalledTimes(1);
    expect(component.hasUnsavedChanges()).toBe(false);
  });

  it('quittiert eine Neuanlage nach Workspacewechsel und verwendet sie beim Wiederholen', async () => {
    await openNew();
    component.form.controls.title.setValue('Neue Kamera');
    const pending = deferred<Awaited<ReturnType<typeof catalog.createProduct>>>();
    catalog.createProduct.mockReturnValueOnce(pending.promise);
    const saving = component.save();
    activeWorkspace.set({ id: 'workspace-2' });
    TestBed.tick();
    pending.resolve({
      data: { ...original, id: 'created-product', title: 'Neue Kamera' },
      error: null,
      reportedBySyncStatus: false,
    });
    await saving;
    expect(component.product()?.id).toBe('created-product');
    expect(component.workspaceChanged()).toBe(true);
    activeWorkspace.set({ id: original.workspace_id });
    await component.save();
    expect(catalog.createProduct).toHaveBeenCalledTimes(1);
  });

  it('erhält Reihenfolge und entfernte Bilder bis zur atomaren Galerie-Bestätigung', async () => {
    const second = { ...image, id: 'image-2', is_primary: false, sort_order: 1 };
    media.loadProductMedia.mockResolvedValueOnce([image, second]);
    await component.loadImages();
    component.changeImages([component.imageDrafts()[1]]);
    media.updateProductMediaLayout.mockResolvedValueOnce({
      data: [],
      error: new Error('Zwischenzeitlich geändert'),
      reportedBySyncStatus: false,
    });
    await component.save();
    expect(component.imageDrafts().map((draft) => draft.media?.id)).toEqual(['image-2']);
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(media.updateProductMediaLayout).toHaveBeenCalledWith(
      original.id,
      ['image-2'],
      ['image-1', 'image-2'],
      original.workspace_id,
    );
    await component.save();
    expect(component.hasUnsavedChanges()).toBe(false);
  });

  it('verwirft einen neuen Entwurf vollständig und schützt ihn bei Workspacewechsel', async () => {
    await openNew();
    component.form.controls.title.setValue('Unfertig');
    activeWorkspace.set({ id: 'workspace-2' });
    TestBed.tick();
    await component.save();
    expect(catalog.createProduct).not.toHaveBeenCalled();
    component.discard();
    expect(component.form.controls.title.value).toBe('');
    expect(component.hasUnsavedChanges()).toBe(false);
    expect(component.workspaceChanged()).toBe(false);
  });
  it('hält Eingaben bis zum abgeschlossenen Wechsel auf die gespeicherte Artikelseite gesperrt', async () => {
    await openNew();
    component.form.controls.title.setValue('Neue Kamera');
    const navigation = deferred<boolean>();
    vi.mocked(TestBed.inject(Router).navigate).mockReturnValueOnce(navigation.promise);
    const saving = component.save();
    await Promise.resolve();
    expect(component.form.disabled).toBe(true);
    expect(component.saving()).toBe(true);
    expect(canLeaveUnsavedEntry(component, () => false)).toBe(true);
    navigation.resolve(true);
    await saving;
    expect(component.form.enabled).toBe(true);
    expect(component.saving()).toBe(false);
  });

  it('zeigt später signierte Bildadressen reaktiv, ohne neue Dateien zu verlieren', async () => {
    const url = signal('');
    media.getMediaUrl.mockImplementation(() => url());
    media.loadProductMedia.mockResolvedValueOnce([image]);
    await component.loadImages();
    const file = new File(['a'], 'pending.png', { type: 'image/png' });
    component.changeImages([
      ...component.imageDrafts(),
      { key: 'new-image', file, media: null, previewUrl: 'data:image/png;base64,test' },
    ]);
    expect(component.visibleImageDrafts()[0].previewUrl).toBe('');
    url.set('https://example.invalid/signed-image');
    expect(component.visibleImageDrafts()[0].previewUrl).toBe(
      'https://example.invalid/signed-image',
    );
    expect(component.visibleImageDrafts()[1].file).toBe(file);
    expect(component.hasUnsavedChanges()).toBe(true);
    media.getMediaUrl.mockImplementation((path: string) => path);
  });

  it('aktualisiert nach Galerie-Bestätigung das Hauptbild der Katalogprojektion', async () => {
    media.loadProductMedia.mockResolvedValueOnce([image]);
    await component.loadImages();
    component.changeImages([]);
    await component.save();
    expect(catalog.updateProductPrimaryMedia).toHaveBeenCalledWith(
      original.id,
      original.workspace_id,
      null,
    );
    expect(component.product()?.primary_media_path).toBeNull();
  });
});

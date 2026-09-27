import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { MediaService } from '../../../../core/services/media.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ProductVariantCreateFormComponent } from './product-variant-create-form.component';

describe('Varianten mit eigenen Bildern anlegen', () => {
  const product: CatalogProduct = {
    id: 'product-1',
    workspace_id: 'workspace-1',
    title: 'Schuh',
    tracking_mode: 'quantity',
    is_public_store: false,
  };
  const variant = { ...product, id: 'variant-1', variant_group_id: product.id, color: 'Blau' };
  const createVariant = vi.fn(async () => ({ data: variant, error: null }));
  const updateProductPrimaryMedia = vi.fn();
  const uploadProductMedia = vi.fn();

  afterEach(() => TestBed.resetTestingModule());

  it('speichert Variantenbilder und legt die Variante nach einem Uploadfehler nicht doppelt an', async () => {
    createVariant.mockClear();
    updateProductPrimaryMedia.mockClear();
    uploadProductMedia.mockReset();
    uploadProductMedia
      .mockResolvedValueOnce({ data: null, error: new Error('Upload fehlgeschlagen') })
      .mockResolvedValueOnce({
        data: {
          id: 'media-1',
          catalog_product_id: variant.id,
          workspace_id: product.workspace_id,
          storage_path: 'variant.webp',
          is_primary: true,
        },
        error: null,
      });
    TestBed.configureTestingModule({
      providers: [
        { provide: CatalogService, useValue: { createVariant, updateProductPrimaryMedia } },
        { provide: MediaService, useValue: { uploadProductMedia } },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: () => ({ id: product.workspace_id }) },
        },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new ProductVariantCreateFormComponent());
    Object.assign(component, { product: signal(product) });
    TestBed.tick();
    const image = new File(['Foto'], 'blau.jpg', { type: 'image/jpeg' });
    component.form.controls.color.setValue('Blau');
    component.images.set([{ key: 'draft-1', file: image, media: null, previewUrl: '' }]);
    const created = vi.fn();
    const saved = vi.fn();
    component.created.subscribe(created);
    component.variantSaved.subscribe(saved);

    await component.save();
    expect(component.error()).toContain('Die Variante ist angelegt.');
    expect(created).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledExactlyOnceWith(variant);
    await component.save();

    expect(createVariant).toHaveBeenCalledTimes(1);
    expect(uploadProductMedia).toHaveBeenCalledTimes(2);
    expect(uploadProductMedia).toHaveBeenCalledWith(variant.id, image, undefined, {
      fileName: image.name,
      altText: '',
    });
    expect(updateProductPrimaryMedia).toHaveBeenCalledWith(
      variant.id,
      product.workspace_id,
      'variant.webp',
    );
    expect(created).toHaveBeenCalledExactlyOnceWith(variant);
  });
});

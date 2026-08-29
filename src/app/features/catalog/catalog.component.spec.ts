import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { CatalogComponent } from './catalog.component';

describe('CatalogComponent', () => {
  it('beendet den Speichervorgang und zeigt einen geworfenen Servicefehler an', async () => {
    const createProduct = vi.fn().mockRejectedValue(new Error('Demo-Speicher nicht verfügbar'));
    const component = Object.create(CatalogComponent.prototype) as CatalogComponent;
    Object.assign(component, {
      catalogService: { createProduct },
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      isSaving: signal(false),
      isCreateOpen: signal(true),
      saveError: signal<string | null>(null),
      productForm: new FormGroup({
        title: new FormControl('LED-Lampe', {
          nonNullable: true,
          validators: [Validators.required, Validators.minLength(2)],
        }),
        ean: new FormControl('', { nonNullable: true }),
        trackingMode: new FormControl('quantity', { nonNullable: true }),
        isPublicStore: new FormControl(false, { nonNullable: true }),
        listingPrice: new FormControl<number | null>(null),
      }),
    });

    await component.createProduct();

    expect(component.isSaving()).toBe(false);
    expect(component.saveError()).toBe('Demo-Speicher nicht verfügbar');
    expect(component.isCreateOpen()).toBe(true);
  });

  it('verlangt für einen öffentlichen Artikel einen positiven Shoppreis', () => {
    const component = Object.create(CatalogComponent.prototype) as CatalogComponent;
    Object.assign(component, {
      productForm: new FormGroup(
        {
          title: new FormControl('LED-Lampe', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(2)],
          }),
          ean: new FormControl('', { nonNullable: true }),
          trackingMode: new FormControl('quantity', { nonNullable: true }),
          isPublicStore: new FormControl(true, { nonNullable: true }),
          listingPrice: new FormControl<number | null>(null),
        },
        { validators: CatalogComponent.publicListingPriceValidator },
      ),
    });

    expect(component.productForm.invalid).toBe(true);
    component.productForm.controls.listingPrice.setValue(0);
    expect(component.productForm.invalid).toBe(true);
    component.productForm.controls.listingPrice.setValue(12.5);
    expect(component.productForm.valid).toBe(true);
  });

  it('persistiert den validierten Shoppreis beim Anlegen', async () => {
    const createProduct = vi.fn().mockResolvedValue({ data: { id: 'product-1' }, error: null });
    const component = Object.create(CatalogComponent.prototype) as CatalogComponent;
    Object.assign(component, {
      catalogService: { createProduct },
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      isSaving: signal(false),
      isCreateOpen: signal(true),
      saveError: signal<string | null>(null),
      productForm: new FormGroup(
        {
          title: new FormControl('LED-Lampe', { nonNullable: true }),
          ean: new FormControl('', { nonNullable: true }),
          trackingMode: new FormControl('quantity', { nonNullable: true }),
          isPublicStore: new FormControl(true, { nonNullable: true }),
          listingPrice: new FormControl<number | null>(12.5),
        },
        { validators: CatalogComponent.publicListingPriceValidator },
      ),
    });

    await component.createProduct();

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ isPublicStore: true, listingPrice: 12.5 }),
    );
  });
});

import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { ProductDialogComponent } from './product-dialog.component';

describe('ProductDialogComponent', () => {
  it('sendet nach Workspacewechsel während des Listenladens kein fremdes Produkt an den Einkauf', async () => {
    const workspace = signal({ id: 'workspace-1' });
    const created = { emit: vi.fn() };
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      catalog: {
        createProduct: vi
          .fn()
          .mockResolvedValue({ data: { id: 'p', workspace_id: 'workspace-1' }, error: null }),
        loadProducts: vi.fn(async () => workspace.set({ id: 'workspace-2' })),
      },
      workspace: { currentWorkspace: workspace },
      workspaceChanged: () => false,
      savedProduct: signal(null),
      image: signal(null),
      saving: signal(false),
      error: signal(null),
      created,
      form: new FormGroup({
        title: new FormControl('X'),
        ean: new FormControl(''),
        condition: new FormControl(''),
      }),
    });
    await component.save();
    expect(created.emit).not.toHaveBeenCalled();
  });
  it('behält beim Bildfehler Stamm und Formwerte und legt beim Wiederholen kein zweites Produkt an', async () => {
    const product = { id: 'product-1', workspace_id: 'workspace-1', title: 'Schuh' };
    const createProduct = vi.fn().mockResolvedValue({ data: product, error: null });
    const uploadProductMedia = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error('Upload gesperrt') })
      .mockResolvedValueOnce({ data: { id: 'image-1' }, error: null });
    const created = { emit: vi.fn() };
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      catalog: { createProduct, loadProducts: vi.fn() },
      media: { uploadProductMedia },
      savedProduct: signal(null),
      image: signal(new File(['bild'], 'bild.png', { type: 'image/png' })),
      workspaceChanged: () => false,
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      created,
      saving: signal(false),
      error: signal(null),
      form: new FormGroup({
        title: new FormControl('Schuh'),
        ean: new FormControl(''),
        condition: new FormControl('defective'),
        conditionNotes: new FormControl('Naht beschädigt'),
        isPublicStore: new FormControl(false),
        listingPrice: new FormControl(null),
      }),
    });
    await component.save();
    expect(component.error()).toContain(
      'Produkt gespeichert. Bild konnte nicht gespeichert werden',
    );
    expect(component.savedProduct()).toEqual(product);
    expect(component.form.getRawValue()).toMatchObject({
      title: 'Schuh',
      conditionNotes: 'Naht beschädigt',
    });
    expect(created.emit).not.toHaveBeenCalled();
    await component.save();
    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(uploadProductMedia).toHaveBeenCalledTimes(2);
    expect(created.emit).toHaveBeenCalledExactlyOnceWith(product);
  });
  it('beendet den Speichervorgang und zeigt einen geworfenen Servicefehler an', async () => {
    const createProduct = vi.fn().mockRejectedValue(new Error('Demo-Speicher nicht verfügbar'));
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      catalog: { createProduct, loadProducts: vi.fn() },
      savedProduct: signal(null),
      image: signal(null),
      workspaceChanged: () => false,
      created: { emit: vi.fn() },
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      saving: signal(false),
      closed: { emit: vi.fn() },
      error: signal<string | null>(null),
      form: new FormGroup({
        title: new FormControl('LED-Lampe', {
          nonNullable: true,
          validators: [Validators.required, Validators.minLength(2)],
        }),
        ean: new FormControl('', { nonNullable: true }),
        condition: new FormControl('', { nonNullable: true }),
        isPublicStore: new FormControl(false, { nonNullable: true }),
        listingPrice: new FormControl<number | null>(null),
      }),
    });

    await component.save();

    expect(component.saving()).toBe(false);
    expect(component.error()).toBe('Demo-Speicher nicht verfügbar');
    expect(component.savedProduct()).toBeNull();
  });

  it('verlangt für einen öffentlichen Artikel einen positiven Shoppreis', () => {
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      form: new FormGroup(
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
        { validators: ProductDialogComponent.publicListingPriceValidator },
      ),
    });

    expect(component.form.invalid).toBe(true);
    component.form.controls.listingPrice.setValue(0);
    expect(component.form.invalid).toBe(true);
    component.form.controls.listingPrice.setValue(12.5);
    expect(component.form.valid).toBe(true);
  });

  it('persistiert den validierten Shoppreis beim Anlegen', async () => {
    const createProduct = vi
      .fn()
      .mockResolvedValue({ data: { id: 'product-1', workspace_id: 'workspace-1' }, error: null });
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      catalog: { createProduct, loadProducts: vi.fn() },
      savedProduct: signal(null),
      image: signal(null),
      workspaceChanged: () => false,
      created: { emit: vi.fn() },
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      saving: signal(false),
      closed: { emit: vi.fn() },
      error: signal<string | null>(null),
      form: new FormGroup(
        {
          title: new FormControl('LED-Lampe', { nonNullable: true }),
          ean: new FormControl('', { nonNullable: true }),
          trackingMode: new FormControl('quantity', { nonNullable: true }),
          isPublicStore: new FormControl(true, { nonNullable: true }),
          listingPrice: new FormControl<number | null>(12.5),
        },
        { validators: ProductDialogComponent.publicListingPriceValidator },
      ),
    });

    await component.save();

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ isPublicStore: true, listingPrice: 12.5 }),
    );
  });
});

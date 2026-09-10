import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogProduct, Workspace } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CatalogProductDialogComponent } from './catalog-product-dialog.component';

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Workspace',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
};

const product: CatalogProduct = {
  id: 'product-1',
  workspace_id: workspace.id,
  title: 'Konsole',
  ean: '4006381333931',
  tracking_mode: 'quantity',
  is_public_store: false,
};

afterEach(() => TestBed.resetTestingModule());

function render() {
  const catalogService = {
    createProduct: vi.fn().mockResolvedValue({
      data: product,
      error: null,
      reportedBySyncStatus: false,
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogService, useValue: catalogService },
      { provide: WorkspaceService, useValue: { currentWorkspace: () => workspace } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new CatalogProductDialogComponent());
  return { component, catalogService };
}

describe('CatalogProductDialogComponent', () => {
  it('speichert Titel, EAN, Nachverfolgung und ein gültiges Produktbild', async () => {
    const { component, catalogService } = render();
    const saved = vi.fn();
    component.saved.subscribe(saved);
    const image = new File(['image'], 'konsole.webp', { type: 'image/webp' });
    component.form.patchValue({
      title: 'Konsole',
      ean: '4006381333931',
      trackingMode: 'quantity',
    });
    component.selectImage(image);

    await component.save();

    expect(catalogService.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspace.id,
        title: 'Konsole',
        ean: '4006381333931',
        trackingMode: 'quantity',
        imageFile: image,
      }),
    );
    expect(saved).toHaveBeenCalledWith(product);
  });

  it.each([
    [new File(['text'], 'produkt.txt', { type: 'text/plain' }), 'Bilddatei'],
    [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'gross.webp', { type: 'image/webp' }), '5 MB'],
  ])('weist ein ungültiges Bild verständlich zurück', (image, message) => {
    const { component } = render();

    component.selectImage(image);

    expect(component.selectedImage()).toBeNull();
    expect(component.imageError()).toContain(message);
  });
});

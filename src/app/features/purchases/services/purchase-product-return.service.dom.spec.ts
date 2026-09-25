import { afterEach, describe, expect, it } from 'vitest';
import { PurchaseProductReturnService } from './purchase-product-return.service';

describe('PurchaseProductReturnService', () => {
  afterEach(() => sessionStorage.removeItem('flipbase:purchase-product-return'));

  it('sichert den Einkaufsentwurf und gibt ihn nach der Rückkehr genau einmal zurück', () => {
    const service = new PurchaseProductReturnService();
    const draft = { form: { notes: 'Karton mit Schuhen' }, lines: [{ titleSnapshot: 'Alt' }] };
    const token = service.begin('/purchases/new', 'workspace-1', draft);

    expect(service.isCatalogHandoff(`/catalog/new?purchaseReturn=${token}`)).toBe(true);
    expect(service.isCatalogHandoff('/catalog/new?purchaseReturn=falsch')).toBe(false);
    expect(service.forCatalog(token, 'workspace-2')).toBeNull();
    service.setCreatedProduct(token, 'product-1');
    expect(service.consume('/purchases/new', 'workspace-1')).toMatchObject({
      draft,
      createdProductId: 'product-1',
    });
    expect(service.consume('/purchases/new', 'workspace-1')).toBeNull();
  });

  it('bewahrt den Entwurf bei einer Rückkehr ohne Speichern', () => {
    const service = new PurchaseProductReturnService();
    const token = service.begin('/purchases/purchase-1/edit', 'workspace-1', {
      form: { notes: 'Entwurf' },
    });
    expect(service.forCatalog(token, 'workspace-1')?.returnUrl).toBe('/purchases/purchase-1/edit');
    expect(
      service.consume('/purchases/purchase-1/edit', 'workspace-1')?.createdProductId,
    ).toBeNull();
  });
});

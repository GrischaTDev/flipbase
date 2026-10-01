import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EbayArticleMappingStore } from './ebay-article-mapping.store';
import { EbayOrderImportApiService } from './ebay-order-import-api.service';

const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
const mapping = {
  id: 'id-a',
  listingId: '123',
  variationId: '456',
  target: { catalogProductId: 'product-a' },
};
describe('Persönliche eBay-Artikelzuordnung', () => {
  let store: EbayArticleMappingStore;
  let api: {
    loadMappings: ReturnType<typeof vi.fn>;
    saveMapping: ReturnType<typeof vi.fn>;
    removeMapping: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    api = {
      loadMappings: vi.fn(async () => [mapping]),
      saveMapping: vi.fn(async () => mapping),
      removeMapping: vi.fn(async () => true),
    };
    TestBed.configureTestingModule({
      providers: [EbayArticleMappingStore, { provide: EbayOrderImportApiService, useValue: api }],
    });
    store = TestBed.inject(EbayArticleMappingStore);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('verwirft einen verspäteten Abruf nach Konto-/Workspacewechsel', async () => {
    let finish: (value: (typeof mapping)[]) => void = () => undefined;
    api.loadMappings.mockImplementationOnce(
      () =>
        new Promise<(typeof mapping)[]>((resolve) => {
          finish = resolve;
        }),
    );
    const old = store.load(scope);
    await store.load({ ...scope, connectionId: 'connection-b' });
    finish([{ ...mapping, id: 'old' }]);
    await old;
    expect(store.mappings().map((item) => item.id)).toEqual(['id-a']);
    expect(store.loading()).toBe(false);
  });
  it('hält Varianten desselben Inserats getrennt', async () => {
    await store.load(scope);
    const second = {
      ...mapping,
      id: 'id-b',
      variationId: '789',
      target: { catalogProductId: 'product-b' },
    };
    api.saveMapping.mockResolvedValueOnce(second);
    await store.save(scope, '123', '789', second.target);
    expect(store.mappings()).toEqual([mapping, second]);
  });
  it('verwirft eine verspätete Speicherantwort und meldet Fehler im aktuellen Kontext', async () => {
    await store.load(scope);
    let finish: (value: typeof mapping) => void = () => undefined;
    api.saveMapping.mockImplementationOnce(
      () =>
        new Promise<typeof mapping>((resolve) => {
          finish = resolve;
        }),
    );
    const old = store.save(scope, '123', '456', mapping.target);
    store.clear();
    finish(mapping);
    await old;
    expect(store.mappings()).toEqual([]);
    expect(store.loading()).toBe(false);
    api.loadMappings.mockRejectedValueOnce(new Error('Abruf fehlgeschlagen'));
    await store.load(scope);
    expect(store.error()).toBe('Abruf fehlgeschlagen');
  });
  it('verhindert Schreiben mit fremdem oder ungeprüftem Kontext', async () => {
    await store.save(scope, '123', null, mapping.target);
    expect(api.saveMapping).not.toHaveBeenCalled();
    await store.load(scope);
    await store.remove({ ...scope, workspaceId: 'other' }, mapping.id);
    expect(api.removeMapping).not.toHaveBeenCalled();
    await store.remove(scope, mapping.id);
    expect(store.mappings()).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { PurchaseLineDraft } from '../components/purchase-line-editor/purchase-line-editor.component';
import { purchaseLineStructureFingerprint } from './purchase-line-structure';

const baseLine: PurchaseLineDraft = {
  draftId: 'draft-1',
  catalogProductId: 'product-1',
  titleSnapshot: 'Konsole',
  lineKind: 'quantity',
  orderedQuantity: 2,
  condition: 'used',
  priceMode: 'priced',
  unitPurchasePrice: 10,
  lineTotal: 20,
  estimatedMarketValue: null,
};

describe('purchaseLineStructureFingerprint', () => {
  it('ändert sich bei Produkt-, Positions- oder Mengenänderungen', () => {
    const fingerprint = purchaseLineStructureFingerprint([baseLine]);

    expect(purchaseLineStructureFingerprint([{ ...baseLine, orderedQuantity: 3 }])).not.toBe(
      fingerprint,
    );
    expect(
      purchaseLineStructureFingerprint([{ ...baseLine, catalogProductId: 'product-2' }]),
    ).not.toBe(fingerprint);
    expect(purchaseLineStructureFingerprint([{ ...baseLine, draftId: 'draft-2' }])).not.toBe(
      fingerprint,
    );
  });

  it('bleibt bei Preis-, Zustands- und sonstigen Metadatenänderungen stabil', () => {
    const fingerprint = purchaseLineStructureFingerprint([baseLine]);

    expect(
      purchaseLineStructureFingerprint([
        {
          ...baseLine,
          condition: 'new',
          unitPurchasePrice: 12,
          lineTotal: 24,
          estimatedMarketValue: 40,
        },
      ]),
    ).toBe(fingerprint);
  });
});

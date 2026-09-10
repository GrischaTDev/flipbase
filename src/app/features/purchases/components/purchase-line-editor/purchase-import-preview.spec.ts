import { describe, expect, it } from 'vitest';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { previewPurchaseImport } from './purchase-import-preview';

const product: CatalogProduct = {
  id: 'product-1',
  workspace_id: 'workspace-1',
  title: 'Schuh',
  ean: '4006381333931',
  tracking_mode: 'quantity',
  is_public_store: false,
};

describe('previewPurchaseImport', () => {
  it('akzeptiert historische Produktidentitäten und kanonisch gleiche GTINs', () => {
    const [row] = previewPurchaseImport(
      'title,ean\nSchuh,04006381333931',
      [{ ...product, tracking_mode: 'individual' }],
      'workspace-1',
    );
    expect(row?.productId).toBe(product.id);
  });

  it.each([null, 'used'] as const)(
    'verlangt Zuordnung bei angegebenem abweichendem oder fehlendem Produktzustand %s',
    (condition) => {
      const [row] = previewPurchaseImport(
        'title,condition\nSchuh,defective',
        [{ ...product, condition }],
        'workspace-1',
      );
      expect(row?.productId).toBeNull();
      expect(row?.candidateIds).toEqual([product.id]);
    },
  );

  it('ordnet nur bei passendem Zustand automatisch zu', () => {
    const [row] = previewPurchaseImport(
      'title,condition\nSchuh,defective',
      [{ ...product, condition: 'defective' }],
      'workspace-1',
    );
    expect(row?.productId).toBe(product.id);
  });
  it('ordnet ein eindeutiges Produkt zu und berechnet 3 × 0,12 centgenau', () => {
    const [row] = previewPurchaseImport(
      'title;quantity;unit_purchase_price\nSchuh;3;0,12',
      [product],
      'workspace-1',
    );
    expect(row).toMatchObject({
      productId: 'product-1',
      quantity: 3,
      unitPrice: 0.12,
      total: 0.36,
      errors: [],
    });
  });

  it('erfindet aus unbekannten Produkten keine Einzelstücke', () => {
    const [row] = previewPurchaseImport('title,quantity\nUnbekannt,12', [product], 'workspace-1');
    expect(row).toMatchObject({ productId: null, quantity: 12, unitPrice: null, total: null });
    expect(row?.errors).toContain('Produkt zuordnen.');
  });

  it('verlangt bei identischen Barcodes eine bewusste Zuordnung', () => {
    const rows = previewPurchaseImport(
      'title,ean,quantity\nSchuh,4006381333931,1',
      [product, { ...product, id: 'product-2' }],
      'workspace-1',
    );
    expect(rows[0]?.productId).toBeNull();
    expect(rows[0]?.candidateIds).toEqual(['product-1', 'product-2']);
    expect(rows[0]?.errors).toContain('Mehrere Produkte passen. Bitte zuordnen.');
  });

  it('verwendet keine Produkte eines anderen Workspaces', () => {
    const rows = previewPurchaseImport('title,quantity\nSchuh,1', [product], 'workspace-2');
    expect(rows[0]?.productId).toBeNull();
    expect(rows[0]?.candidateIds).toEqual([]);
  });

  it.each(['0', '-1', '1.5', '100001', 'Infinity'])(
    'weist ungültige Menge %s in der Vorschau zurück',
    (quantity) => {
      const [row] = previewPurchaseImport(
        `title,quantity\nSchuh,${quantity}`,
        [product],
        'workspace-1',
      );
      expect(row?.errors).toContain('Menge muss eine ganze Zahl zwischen 1 und 100.000 sein.');
    },
  );

  it.each(['-1', '0.001', 'NaN', '1e3'])(
    'weist ungültigen Stückpreis %s zurück statt still zu runden',
    (price) => {
      const [row] = previewPurchaseImport(
        `title,quantity,unit_purchase_price\nSchuh,1,${price}`,
        [product],
        'workspace-1',
      );
      expect(row?.errors).toContain(
        'Stückpreis muss ein nichtnegativer Betrag mit höchstens zwei Nachkommastellen sein.',
      );
    },
  );

  it('unterscheidet kostenlosen Preis von fehlenden Kosten und behält doppelte Zeilen getrennt', () => {
    const rows = previewPurchaseImport(
      'title,quantity,unit_purchase_price\nSchuh,1,0\nSchuh,2,',
      [product],
      'workspace-1',
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.map(({ rowNumber, unitPrice, total }) => ({ rowNumber, unitPrice, total })),
    ).toEqual([
      { rowNumber: 2, unitPrice: 0, total: 0 },
      { rowNumber: 3, unitPrice: null, total: null },
    ]);
  });

  it('liefert bei ungültiger Menge keine darstellungsfeindlichen NaN- oder Infinity-Beträge', () => {
    const [row] = previewPurchaseImport(
      'title,quantity,unit_purchase_price\nSchuh,Infinity,12',
      [product],
      'workspace-1',
    );
    expect(row).toMatchObject({ quantity: null, total: null });
  });

  it('behält Zustandsangaben für die ausdrückliche Produktzuordnung und weist fremde Zustände ab', () => {
    const rows = previewPurchaseImport(
      'title,condition\nSchuh,defective\nSchuh,invalid',
      [product],
      'workspace-1',
    );
    expect(rows[0]?.condition).toBe('defective');
    expect(rows[1]?.errors).toContain('Zustand ist ungültig.');
  });
});

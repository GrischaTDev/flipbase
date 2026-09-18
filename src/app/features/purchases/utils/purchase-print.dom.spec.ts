import { describe, expect, it } from 'vitest';
import { Purchase, PurchaseLine } from '../../../core/models/flipbase.models';
import { PurchaseDocument } from '../../../core/models/purchase-document.models';
import { buildPurchasePrintModel } from './purchase-print';

const purchase: Purchase = {
  id: 'purchase-1',
  workspace_id: 'workspace-1',
  record_number: 'EK-0042',
  type: 'lot',
  title: 'Vinted-Paket',
  purchase_date: '2026-09-18',
  purchase_price: 50,
  discount_amount: 5,
  cost_allocation_mode: 'even',
  source: { id: 'source-1', workspace_id: 'workspace-1', name: 'Vinted' },
  seller_name: 'Lea Mustermann',
  seller_marketplace_username: 'vintage_lea92',
  seller_city: 'Köln',
  external_order_id: '84739392',
  supplier_reference: 'REF-7',
  original_url: 'https://www.vinted.de/items/1',
  costs: [
    {
      id: 'cost-1',
      purchase_id: 'purchase-1',
      workspace_id: 'workspace-1',
      type: 'shipping',
      amount: 4.5,
    },
    {
      id: 'cost-2',
      purchase_id: 'purchase-1',
      workspace_id: 'workspace-1',
      type: 'other',
      amount: 1,
      description: 'Käuferschutz',
    },
  ],
};

const lines = [
  {
    id: 'line-1',
    workspace_id: 'workspace-1',
    purchase_id: 'purchase-1',
    title_snapshot: 'Jacke',
    ordered_quantity: 2,
    unit_purchase_price: 20,
    line_total: 40,
  },
  {
    id: 'line-2',
    workspace_id: 'workspace-1',
    purchase_id: 'purchase-1',
    title_snapshot: 'Mütze',
    ordered_quantity: 1,
    unit_purchase_price: null,
    line_total: null,
  },
] as unknown as PurchaseLine[];

const documents: PurchaseDocument[] = [
  {
    id: 'document-1',
    workspace_id: 'workspace-1',
    purchase_id: 'purchase-1',
    document_type: 'invoice',
    original_file_name: 'Rechnung.pdf',
    storage_path: 'purchase-documents/workspace-1/purchase-1/document-1.pdf',
    mime_type: 'application/pdf',
    file_size: 1000,
    created_at: '2026-09-18T10:00:00.000Z',
    created_by: 'user-1',
  },
];

describe('buildPurchasePrintModel', () => {
  it('fasst Kopf, Verkäufer, Positionen, Kosten, Gesamtbetrag und Belege zusammen', () => {
    const model = buildPurchasePrintModel(purchase, lines, documents);

    expect(model.heading).toBe('EK-0042');
    expect(model.title).toBe('Vinted-Paket');
    expect(model.purchaseDate).toBe('2026-09-18');
    expect(model.sellerLabel).toBe('Lea Mustermann');
    expect(model.sellerRows).toEqual(
      expect.arrayContaining([
        { label: 'Quelle', value: 'Vinted' },
        { label: 'Plattform-Benutzername', value: 'vintage_lea92' },
        { label: 'Bestellnummer der Plattform', value: '84739392' },
        { label: 'Referenznummer', value: 'REF-7' },
      ]),
    );
    expect(model.offerUrl).toBe('https://www.vinted.de/items/1');
    expect(model.lines).toEqual([
      { title: 'Jacke', quantity: 2, unitPrice: 20, lineTotal: 40 },
      { title: 'Mütze', quantity: 1, unitPrice: null, lineTotal: null },
    ]);
    expect(model.costRows).toEqual([
      { label: 'Warenwert', amount: 50, subtract: false },
      { label: 'Rabatt', amount: 5, subtract: true },
      { label: 'Versandkosten', amount: 4.5, subtract: false },
      { label: 'Käuferschutz', amount: 1, subtract: false },
    ]);
    expect(model.total).toBe(50.5);
    expect(model.documents).toEqual([
      {
        typeLabel: 'Rechnung / Quittung',
        fileName: 'Rechnung.pdf',
        createdAt: '2026-09-18T10:00:00.000Z',
      },
    ]);
  });

  it('bevorzugt die gespeicherte Gesamtsumme und zeigt ohne Preis keinen erfundenen Betrag', () => {
    expect(buildPurchasePrintModel({ ...purchase, total_purchase_cost: 60 }, [], []).total).toBe(
      60,
    );
    const withoutPrice = buildPurchasePrintModel({ ...purchase, purchase_price: null }, [], []);
    expect(withoutPrice.total).toBeNull();
    expect(withoutPrice.costRows[0]).toEqual({ label: 'Warenwert', amount: null, subtract: false });
  });

  it('fällt ohne Einkaufsnummer auf die Bezeichnung zurück', () => {
    const model = buildPurchasePrintModel({ ...purchase, record_number: null }, [], []);

    expect(model.heading).toBe('Vinted-Paket');
  });
});

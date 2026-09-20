import { describe, expect, it } from 'vitest';
import { Purchase, Supplier } from '../../../core/models/flipbase.models';
import {
  normalizePurchaseSellerDetails,
  PurchaseSellerDetails,
  sellerDetailsFromPurchase,
} from '../../../core/models/purchase-seller.models';
import {
  hasPurchaseSellerSnapshot,
  purchaseSellerDetailRows,
  purchaseSellerLabel,
  sellerSnapshotFromSupplier,
} from './purchase-seller';

const supplier: Supplier = {
  id: 'supplier-1',
  workspace_id: 'workspace-1',
  name: 'Großhandel Nord',
  seller_type: 'business',
  contact_person: 'Frau Nord',
  street: 'Hafenstraße 1',
  address_extra: null,
  postal_code: '20457',
  city: 'Hamburg',
  country_code: 'DE',
  email: 'einkauf@nord.example',
  phone: '+4940123456',
};

describe('purchaseSellerLabel', () => {
  it.each([
    [{ seller_name: 'Lea Mustermann', supplier }, 'Lea Mustermann'],
    [{ seller_name: null, supplier }, 'Großhandel Nord'],
    [{ seller_name: null, supplier: undefined }, 'Nicht angegeben'],
  ] as const)('zeigt für %j den Verkäufer %s', (purchase, expected) => {
    expect(purchaseSellerLabel(purchase)).toBe(expected);
  });
});

describe('sellerSnapshotFromSupplier', () => {
  it('kopiert nur Art, Name und Anschrift, keine Kontaktdaten', () => {
    expect(sellerSnapshotFromSupplier(supplier)).toEqual({
      seller_type: 'business',
      seller_name: 'Großhandel Nord',
      seller_street: 'Hafenstraße 1',
      seller_address_extra: null,
      seller_postal_code: '20457',
      seller_city: 'Hamburg',
      seller_country_code: 'DE',
    });
  });

  it('erfindet für fehlende Angaben keine Werte', () => {
    expect(sellerSnapshotFromSupplier({ id: 's', workspace_id: 'w', name: 'Nur Name' })).toEqual({
      seller_type: null,
      seller_name: 'Nur Name',
      seller_street: null,
      seller_address_extra: null,
      seller_postal_code: null,
      seller_city: null,
      seller_country_code: null,
    });
  });
});

describe('normalizePurchaseSellerDetails', () => {
  it('trimmt Text, macht leere Angaben leer und schreibt den Ländercode groß', () => {
    const details: PurchaseSellerDetails = {
      source_id: '',
      supplier_id: null,
      seller_type: null,
      seller_name: '  Lea  ',
      seller_street: '   ',
      seller_address_extra: null,
      seller_postal_code: ' 50667',
      seller_city: 'Köln ',
      seller_country_code: 'de',
      supplier_reference: '',
    };

    expect(normalizePurchaseSellerDetails(details)).toEqual({
      source_id: null,
      supplier_id: null,
      seller_type: null,
      seller_name: 'Lea',
      seller_street: null,
      seller_address_extra: null,
      seller_postal_code: '50667',
      seller_city: 'Köln',
      seller_country_code: 'DE',
      supplier_reference: null,
    });
  });
});

describe('sellerDetailsFromPurchase und hasPurchaseSellerSnapshot', () => {
  const legacyPurchase = {
    id: 'purchase-1',
    workspace_id: 'workspace-1',
    type: 'single',
    title: 'Alt',
    purchase_date: '2026-01-01',
    purchase_price: 5,
    cost_allocation_mode: 'even',
    supplier_id: 'supplier-1',
    supplier,
  } as Purchase;

  it('liest einen alten Einkauf ohne Snapshot als leere Angaben mit Stammdatenverweis', () => {
    expect(sellerDetailsFromPurchase(legacyPurchase)).toMatchObject({
      supplier_id: 'supplier-1',
      seller_name: null,
      seller_city: null,
    });
    expect(hasPurchaseSellerSnapshot(legacyPurchase)).toBe(false);
  });

  it('erkennt einen gespeicherten Snapshot schon an einem einzelnen Feld', () => {
    expect(
      hasPurchaseSellerSnapshot({
        ...legacyPurchase,
        seller_city: 'Köln',
      }),
    ).toBe(true);
  });
});

describe('purchaseSellerDetailRows', () => {
  const base = {
    id: 'purchase-2',
    workspace_id: 'workspace-1',
    type: 'single',
    title: 'Jacke',
    purchase_date: '2026-09-17',
    purchase_price: 10,
    cost_allocation_mode: 'even',
  } as Purchase;

  it('zeigt nur Quelle und Referenznummer des Einkaufs', () => {
    const rows = purchaseSellerDetailRows({
      ...base,
      source: { id: 'source-vinted', workspace_id: 'workspace-1', name: 'Vinted' },
      seller_type: 'private',
      seller_street: 'Musterweg 5',
      seller_postal_code: '50667',
      seller_city: 'Köln',
      seller_country_code: 'DE',
      supplier_reference: 'REF-7',
    });

    expect(rows).toEqual([
      { label: 'Quelle', value: 'Vinted' },
      { label: 'Referenznummer', value: 'REF-7' },
    ]);
  });

  it('zeigt bei einem alten Einkauf ohne Snapshot keine erfundenen Zeilen', () => {
    expect(purchaseSellerDetailRows({ ...base, supplier_id: supplier.id, supplier })).toEqual([]);
  });
});

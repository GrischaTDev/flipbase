import { describe, expect, it } from 'vitest';
import type { Purchase } from '../../../core/models/flipbase.models';
import { getPurchaseStatusPresentation } from './purchase-status-presentation';

const purchase: Purchase = {
  id: 'purchase-1',
  workspace_id: 'workspace-1',
  type: 'single',
  title: 'Konsole',
  purchase_date: '2026-09-10',
  purchase_price: 50,
  shipping_cost: 0,
  source_id: null,
  supplier_id: null,
  cost_allocation_mode: 'even',
};

describe('getPurchaseStatusPresentation', () => {
  it.each([
    [{ receiving_status: 'draft' }, { label: 'Entwurf', tone: 'info' }],
    [{ receiving_status: 'ordered' }, { label: 'Bestellt', tone: 'caution' }],
    [{ receiving_status: 'partially_received' }, { label: 'Teillieferung', tone: 'caution' }],
    [{ receiving_status: 'received' }, { label: 'Angekommen', tone: 'brand' }],
    [
      { entry_status: 'finalized', receiving_status: 'received', shipment_status: 'arrived' },
      { label: 'Abgeschlossen', tone: 'success' },
    ],
    [
      { entry_status: 'finalized', receiving_status: 'archived' },
      { label: 'Archiviert', tone: 'neutral' },
    ],
  ] as const)('ordnet Statuspriorität und Farbe zu', (fields, expected) => {
    expect(getPurchaseStatusPresentation({ ...purchase, ...fields })).toEqual(expected);
  });

  it.each(['cancelled', 'canceled'])('stellt den historischen Stornostatus %s dar', (status) => {
    // Historische Daten können Werte enthalten, die der heutige Schreibtyp ausschließt.
    const legacyPurchase = { ...purchase, receiving_status: status } as unknown as Purchase;

    expect(getPurchaseStatusPresentation(legacyPurchase)).toEqual({
      label: 'Storniert',
      tone: 'critical',
    });
  });

  it('macht einen technischen Unterwegs-Status nicht zum Hauptstatus', () => {
    expect(
      getPurchaseStatusPresentation({
        ...purchase,
        receiving_status: 'ordered',
        shipment_status: 'in_transit',
      }),
    ).toEqual({ label: 'Bestellt', tone: 'caution' });
  });
});

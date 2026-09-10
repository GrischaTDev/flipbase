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
    [{ receiving_status: 'draft' }, { label: 'Entwurf', tone: 'caution' }],
    [{ receiving_status: 'ordered' }, { label: 'Bestellt', tone: 'info' }],
    [{ receiving_status: 'partially_received' }, { label: 'Teillieferung', tone: 'caution' }],
    [{ receiving_status: 'received' }, { label: 'Angekommen', tone: 'success' }],
    [{ receiving_status: 'archived' }, { label: 'Archiviert', tone: 'neutral' }],
  ] as const)('ordnet jedem Einkaufsstatus Text und Farbe zu', (fields, expected) => {
    expect(getPurchaseStatusPresentation({ ...purchase, ...fields })).toEqual(expected);
  });

  it('macht einen technischen Unterwegs-Status nicht zum Hauptstatus', () => {
    expect(
      getPurchaseStatusPresentation({
        ...purchase,
        receiving_status: 'ordered',
        shipment_status: 'in_transit',
      }),
    ).toEqual({ label: 'Bestellt', tone: 'info' });
  });
});

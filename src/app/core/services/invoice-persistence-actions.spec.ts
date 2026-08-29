import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Sale } from '../models/flipbase.models';
import { InvoiceService } from './invoice.service';
import { SyncStatusService } from './sync-status.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111', name: 'Flipbase' };
const sale: Sale = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: workspace.id,
  inventory_item_id: '33333333-3333-4333-8333-333333333333',
  sale_price: 50,
  sale_date: '2026-08-24',
  platform: 'ebay',
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
};

function erstelleDienst(rpc: ReturnType<typeof vi.fn>) {
  const syncStatus = new SyncStatusService();
  const dienst = Object.create(InvoiceService.prototype) as InvoiceService;
  Object.assign(dienst, {
    workspaceService: { currentWorkspace: () => workspace },
    mockStore: { isDemoMode: () => false },
    syncStatus,
    invoices: signal([]),
    supabase: { client: { rpc } },
  });
  return { dienst, syncStatus };
}

describe('InvoiceService – bestätigte Rechnungserstellung', () => {
  it('übernimmt Rechnung und Positionen erst nach bestätigter atomarer RPC-Antwort', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('offline') }));
    const { dienst } = erstelleDienst(rpc);

    const result = await dienst.generateInvoiceForSale(sale);

    expect(result.data).toBeNull();
    expect(result.reportedBySyncStatus).toBe(true);
    expect(dienst.invoices()).toEqual([]);
    expect(rpc).toHaveBeenCalledWith(
      'create_or_get_invoice',
      expect.objectContaining({ p_sale_id: sale.id, p_store_order_id: null }),
    );
  });

  it('weist eine Nullantwort zurück, statt einen lokalen Beleg zu öffnen', async () => {
    const { dienst } = erstelleDienst(vi.fn(async () => ({ data: null, error: null })));

    const result = await dienst.generateInvoiceForSale(sale);

    expect(result.error).toBeInstanceOf(Error);
    expect(result.data).toBeNull();
    expect(dienst.invoices()).toEqual([]);
  });

  it('übergibt aufgeteilte Mengenpositionen im Nicht-Demo-Modus unverändert an das Rechnungs-RPC', async () => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const invoice = args['p_invoice'] as Record<string, unknown>;
      const items = args['p_items'];
      return {
        data: {
          invoice: {
            id: '44444444-4444-4444-8444-444444444444',
            sale_id: args['p_sale_id'],
            ...invoice,
          },
          items,
          created: true,
        },
        error: null,
      };
    });
    const { dienst } = erstelleDienst(rpc);
    const quantitySale = {
      ...sale,
      sale_price: 24.33,
      shipping_cost: 5,
      lines: [
        {
          id: 'line-1',
          sale_id: sale.id,
          title_snapshot: 'LED-Lampe',
          quantity: 2,
          unit_sale_price: 9.665,
          line_total: 19.33,
          cost_of_goods_sold: 8,
          tax_mode: 'diff_25a',
        },
      ],
    } satisfies Sale;

    const result = await dienst.generateInvoiceForSale(quantitySale);

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith(
      'create_or_get_invoice',
      expect.objectContaining({
        p_items: [
          expect.objectContaining({
            title: 'LED-Lampe (Preisgruppe 1)',
            quantity: 1,
            unit_price: 9.66,
            total_price: 9.66,
          }),
          expect.objectContaining({
            title: 'LED-Lampe (Preisgruppe 2)',
            quantity: 1,
            unit_price: 9.67,
            total_price: 9.67,
          }),
        ],
      }),
    );
  });

  it('vertraut im persistenten Modus keinem nur lokal zwischengespeicherten Beleg', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('offline') }));
    const { dienst } = erstelleDienst(rpc);
    dienst.invoices.set([
      {
        id: 'local-only',
        invoiceNumber: 'RE-LOCAL',
        orderNumber: 'LOCAL',
        invoiceDate: '2026-08-25',
        deliveryDate: '2026-08-25',
        seller: { name: 'Flipbase', street: '', postalCode: '', city: '', country: 'DE' },
        buyer: { name: 'Ada', street: '', postalCode: '', city: '', country: 'DE' },
        items: [{ title: 'Lokal', quantity: 1, unitPrice: 50, totalPrice: 50 }],
        subtotal: 50,
        shippingCost: 0,
        total: 50,
        taxMode: 'diff_25a',
        taxClause: '',
        paymentMethod: 'test',
        paymentStatus: 'paid',
        sourceType: 'sale',
        sourceId: sale.id,
      },
    ]);

    const result = await dienst.generateInvoiceForSale(sale);

    expect(rpc).toHaveBeenCalledOnce();
    expect(result.data).toBeNull();
  });
});

import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { ReturnService } from './return.service';
import { InventoryItem, Sale } from '../models/flipbase.models';
import { ReturnRecord } from '../models/return.models';

describe('ReturnService & Credit Note Engine (Chapter 25)', () => {
  let service: ReturnService;

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new ReturnService());
    Object.assign(service, {
      salesService: {
        recordReturn: vi.fn(async (input: { refundAmount: number }) => ({
          data: {
            sale: {
              ...sampleSale,
              returned_at: '2026-08-27T10:00:00.000Z',
              refund_amount: input.refundAmount,
            },
            restockedQuantity: 1,
            saleReturnedAt: '2026-08-27T10:00:00.000Z',
          },
          error: null,
          reportedBySyncStatus: false,
        })),
      },
    });
  });

  const sampleSale: Sale = {
    packaging_cost: 0,
    other_costs: 0,
    id: 'sale-99',
    workspace_id: 'ws-1',
    inventory_item_id: 'item-99',
    platform: 'ebay',
    sale_price: 150.0,
    sale_date: '2026-08-10',
    platform_fee: 15.0,
    shipping_cost: 5.0,
    net_profit: 50.0,
    roi: 50.0,
  };

  const sampleItem: InventoryItem = {
    condition: 'used',
    id: 'item-99',
    workspace_id: 'ws-1',
    title: 'Nintendo Switch OLED',
    status: 'sold',
    allocated_purchase_cost: 80.0,
  };

  const sampleReturn: ReturnRecord = {
    id: 'return-1',
    workspace_id: 'ws-1',
    sale_id: sampleSale.id,
    inventory_item_id: sampleItem.id,
    credit_note_number: 'GS-2026-0001',
    return_date: '2026-09-19',
    reason: 'other',
    refund_amount: 10,
    is_full_refund: true,
    restock_action: 'keep_with_buyer',
    created_at: '2026-09-19T10:00:00.000Z',
  };

  it('startet ohne gespeicherte Retouren leer', () => {
    expect(service.returns()).toEqual([]);
  });

  it('entfernt veraltete lokale Retouren, wenn der Workspace keine Datensätze enthält', async () => {
    service.returns.set([
      {
        id: 'old-return',
        workspace_id: 'old-workspace',
        sale_id: 'old-sale',
        inventory_item_id: null,
        credit_note_number: 'GS-2025-0001',
        return_date: '2025-01-01',
        reason: 'other',
        refund_amount: 10,
        is_full_refund: true,
        restock_action: 'keep_with_buyer',
        created_at: '2025-01-01T00:00:00.000Z',
      },
    ]);
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data: [], error: null }),
    };
    Object.assign(service, {
      supabase: { client: { from: () => query } },
      syncStatus: { melde: vi.fn() },
    });

    await service.loadReturns('workspace-1');

    expect(service.returns()).toEqual([]);
  });

  it('verwirft eine verspätete Antwort des vorherigen Workspaces', async () => {
    const pending = new Map<string, (result: { data: unknown[]; error: null }) => void>();
    let currentWorkspaceId = 'workspace-a';
    const query = {
      select: () => query,
      eq: (_column: string, workspaceId: string) => ({
        order: () =>
          new Promise<{ data: unknown[]; error: null }>((resolve) => {
            pending.set(workspaceId, resolve);
          }),
      }),
    };
    Object.assign(service, {
      supabase: { client: { from: () => query } },
      workspaceService: { currentWorkspace: () => ({ id: currentWorkspaceId }) },
      syncStatus: { melde: vi.fn() },
    });

    const firstLoad = service.loadReturns('workspace-a');
    currentWorkspaceId = 'workspace-b';
    const secondLoad = service.loadReturns('workspace-b');
    pending.get('workspace-b')!({
      data: [{ ...sampleReturn, id: 'return-b', workspace_id: 'workspace-b' }],
      error: null,
    });
    await secondLoad;
    pending.get('workspace-a')!({
      data: [{ ...sampleReturn, id: 'return-a', workspace_id: 'workspace-a' }],
      error: null,
    });
    await firstLoad;

    expect(service.returns().map((entry) => entry.id)).toEqual(['return-b']);
  });

  it('leert Retouren bei Abmeldung ohne Datenbankabfrage', async () => {
    const from = vi.fn();
    service.returns.set([{ ...sampleReturn, id: 'old-return' }]);
    Object.assign(service, { supabase: { client: { from } } });

    await service.loadReturns('');

    expect(service.returns()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('übernimmt eine verspätete Retourenbuchung nicht in den neuen Workspace', async () => {
    let currentWorkspaceId = 'ws-1';
    let resolveBooking!: (value: {
      data: {
        sale: Sale;
        restockedQuantity: number;
        saleReturnedAt: string;
      };
      error: null;
      reportedBySyncStatus: false;
    }) => void;
    const response = new Promise<Parameters<typeof resolveBooking>[0]>((resolve) => {
      resolveBooking = resolve;
    });
    Object.assign(service, {
      workspaceService: { currentWorkspace: () => ({ id: currentWorkspaceId }) },
      salesService: { recordReturn: vi.fn(() => response) },
    });

    const operation = service.processReturn({
      sale: sampleSale,
      item: sampleItem,
      reason: 'other',
      refundAmount: 10,
      isFullRefund: false,
      restockAction: 'keep_with_buyer',
    });
    currentWorkspaceId = 'ws-2';
    service.returns.set([{ ...sampleReturn, id: 'return-ws-2', workspace_id: 'ws-2' }]);
    resolveBooking({
      data: {
        sale: { ...sampleSale, returned_at: '2026-09-19T10:00:00.000Z' },
        restockedQuantity: 0,
        saleReturnedAt: '2026-09-19T10:00:00.000Z',
      },
      error: null,
      reportedBySyncStatus: false,
    });
    const result = await operation;

    expect(result.status).toBe('error');
    expect(result.error?.message).toContain('Workspace');
    expect(service.returns().map((entry) => entry.id)).toEqual(['return-ws-2']);
  });

  it('should process full return, restock ready item and generate credit note invoice', async () => {
    const initialCount = service.returns().length;

    const result = await service.processReturn({
      sale: sampleSale,
      item: sampleItem,
      reason: 'buyer_remorse',
      refundAmount: 150.0,
      isFullRefund: true,
      restockAction: 'restock_ready',
      buyerName: 'Lisa Schmidt',
      notes: 'OVP noch versiegelt.',
    });

    expect(result.status).toBe('success');
    const returnRec = result.data;
    expect(returnRec).not.toBeNull();
    expect(returnRec?.credit_note_number).toContain('GS-2026');
    expect(returnRec?.refund_amount).toBe(150.0);
    expect(returnRec?.is_full_refund).toBe(true);
    expect(service.returns().length).toBe(initialCount + 1);

    // Verify credit note invoice
    expect(returnRec?.creditNoteInvoice).toBeDefined();
    expect(returnRec?.creditNoteInvoice?.invoiceNumber).toBe(returnRec?.credit_note_number);
    expect(returnRec?.creditNoteInvoice?.total).toBe(-150.0);
    expect(returnRec?.creditNoteInvoice?.taxClause).toContain('§ 25a UStG');
  });

  it('should process partial refund / discount agreement', async () => {
    const result = await service.processReturn({
      sale: sampleSale,
      item: sampleItem,
      reason: 'not_as_described',
      refundAmount: 20.0,
      isFullRefund: false,
      restockAction: 'keep_with_buyer',
      buyerName: 'Thomas Becker',
      notes: 'Einigung auf 20 € Nachlass wegen kleinem Kratzer.',
    });

    expect(result.status).toBe('success');
    expect(result.data?.refund_amount).toBe(20.0);
    expect(result.data?.is_full_refund).toBe(false);
    expect(result.data?.restock_action).toBe('keep_with_buyer');
    expect(result.data?.creditNoteInvoice?.total).toBe(-20.0);
  });

  it('materializes a confirmed atomic return once with its credit note', () => {
    const initialCount = service.returns().length;

    const first = service.materializeConfirmedReturn({
      sale: sampleSale,
      reason: 'buyer_remorse',
      refundAmount: 150,
      isFullRefund: true,
      restockAction: 'restock_ready',
    });
    const duplicate = service.materializeConfirmedReturn({
      sale: sampleSale,
      reason: 'buyer_remorse',
      refundAmount: 150,
      isFullRefund: true,
      restockAction: 'restock_ready',
    });

    expect(first.creditNoteInvoice?.total).toBe(-150);
    expect(duplicate.id).toBe(first.id);
    expect(service.returns()).toHaveLength(initialCount + 1);
  });

  it('lädt atomar persistierte Retouren mit Gutschriftmetadaten nach einem Reload', async () => {
    const reloaded = Object.create(ReturnService.prototype) as ReturnService;
    const data = [
      {
        id: 'return-reload',
        workspace_id: 'ws-1',
        sale_id: 'sale-99',
        inventory_item_id: null,
        credit_note_number: 'GS-2026-RELOAD',
        return_date: '2026-08-27',
        reason: 'buyer_remorse',
        refund_amount: 150,
        is_full_refund: true,
        restock_action: 'restock_ready',
        buyer_name: 'Lisa',
        notes: 'OVP',
        created_at: '2026-08-27T10:00:00.000Z',
      },
    ];
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => ({ data, error: null }),
    };
    Object.assign(reloaded, {
      supabase: { client: { from: () => query } },
      syncStatus: { melde: vi.fn() },
      returns: signal([]),
      isLoading: signal(false),
    });

    await reloaded.loadReturns('ws-1');

    expect(reloaded.returns()[0]).toMatchObject({
      credit_note_number: 'GS-2026-RELOAD',
      notes: 'OVP',
      inventory_item_id: null,
    });
  });
});

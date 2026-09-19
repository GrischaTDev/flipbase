import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { FulfillmentService } from './fulfillment.service';
import { ShippingOrder } from '../models/fulfillment.models';
import { SyncStatusService } from './sync-status.service';

describe('Fulfillment & Smart Bundling Engine (Chapter 27)', () => {
  let service: FulfillmentService;

  const testOrders: ShippingOrder[] = [
    {
      id: 'ship-1',
      workspace_id: 'ws-1',
      sale_id: 'sale-1',
      order_number: 'ORD-1001',
      order_date: '2026-09-19T10:00:00.000Z',
      platform: 'ebay',
      item_title: 'Konsole',
      sale_price: 360,
      customer: {
        name: 'Maximilian Weber',
        street: 'Hauptstraße',
        house_number: '42b',
        postal_code: '80331',
        city: 'München',
        country: 'Deutschland',
        email: 'max@example.com',
      },
      carrier: 'dhl',
      package_type: 'DHL Paket bis 2 kg',
      status: 'ready_to_pack',
      created_at: '2026-09-19T10:00:00.000Z',
    },
    {
      id: 'ship-2',
      workspace_id: 'ws-1',
      sale_id: 'sale-2',
      order_number: 'ORD-1002',
      order_date: '2026-09-19T10:00:00.000Z',
      platform: 'ebay',
      item_title: 'Controller',
      sale_price: 55,
      customer: {
        name: 'Maximilian Weber',
        street: 'Hauptstraße',
        house_number: '42b',
        postal_code: '80331',
        city: 'München',
        country: 'Deutschland',
        email: 'max@example.com',
      },
      carrier: 'dhl',
      package_type: 'DHL Warenpost',
      status: 'ready_to_pack',
      created_at: '2026-09-19T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new FulfillmentService());
    service.orders.set(testOrders);
  });

  it('should automatically detect bundle candidates for same customer', () => {
    const candidates = service.bundleCandidates();
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].customerName).toBe('Maximilian Weber');
    expect(candidates[0].itemsCount).toBeGreaterThanOrEqual(2);
    expect(candidates[0].potentialSavings).toBeGreaterThanOrEqual(0);
  });

  it('should bundle multiple orders into single combined order', async () => {
    const candidate = service.bundleCandidates()[0];
    const initialOrdersCount = service.orders().length;
    const ergebnis = await service.bundleOrders(candidate);
    const bundled = ergebnis.data;

    expect(ergebnis.error).toBeNull();
    if (!bundled) throw new Error('Das Sammelpaket fehlt.');
    expect(bundled.is_bundled).toBe(true);
    expect(bundled.item_title).toContain('SAMMELPAKET');
    expect(bundled.bundled_item_titles?.length).toBe(candidate.itemsCount);
    expect(service.orders().length).toBe(initialOrdersCount - candidate.itemsCount + 1);
  });

  it('should unbundle a bundled order back to individual shipments', async () => {
    const candidate = service.bundleCandidates()[0];
    const ergebnis = await service.bundleOrders(candidate);
    const bundled = ergebnis.data;

    if (!bundled) throw new Error('Das Sammelpaket fehlt.');
    const unbundleErgebnis = await service.unbundleOrder(bundled.id);
    expect(unbundleErgebnis.error).toBeNull();
    expect(service.orders().some((o) => o.id === bundled.id)).toBe(false);
  });

  it('erfindet keine Sendungsnummer, wenn kein Zusteller angebunden ist', async () => {
    // Dieser Test stand frueher andersherum: Er verlangte eine Nummer, die mit
    // "00340434" beginnt - dem echten DHL-Format. Damit war die Erfindung
    // festgeschrieben. Es wurde nie eine Marke gekauft, aber die Nummer landete
    // auf dem Etikett und damit beim Kaeufer.
    expect(service.zustellerAngebunden).toBe(false);
    await expect(service.purchaseShippingLabel()).rejects.toThrow();
  });

  it('uebernimmt eine selbst eingetragene Sendungsnummer', async () => {
    // Der ehrliche Weg: Marke beim Zusteller kaufen, echte Nummer eintragen.
    const order = service.orders()[0];

    const ergebnis = await service.markAsShipped(order.id, '00340434161094015902', 'dhl');

    expect(ergebnis.error).toBeNull();
    const aktualisiert = service.orders().find((o) => o.id === order.id);
    expect(aktualisiert?.tracking_number).toBe('00340434161094015902');
  });

  it('übernimmt den Zustellstatus erst nach bestätigter Datenbankänderung', async () => {
    const order = { ...service.orders()[0], status: 'shipped' as const };
    service.orders.set([order]);
    let bestaetigeDatenbank!: (value: { error: null; count: number }) => void;
    const datenbankAntwort = new Promise<{ error: null; count: number }>((resolve) => {
      bestaetigeDatenbank = resolve;
    });
    const workspaceEq = vi.fn(() => datenbankAntwort);
    const idEq = vi.fn(() => ({ eq: workspaceEq }));
    const update = vi.fn(() => ({ eq: idEq }));
    Object.assign(service, {
      supabase: { client: { from: () => ({ update }) } },
      workspaceService: { currentWorkspace: () => ({ id: order.workspace_id }) },
    });

    const vorgang = service.markAsDelivered(order.id);

    expect(service.orders()[0].status).toBe('shipped');
    bestaetigeDatenbank({ error: null, count: 1 });
    const ergebnis = await vorgang;

    expect(ergebnis).toMatchObject({ error: null, reportedBySyncStatus: false });
    expect(service.orders()[0].status).toBe('delivered');
  });

  it('meldet einen Zustell-Nulltreffer zentral und lässt den lokalen Status unverändert', async () => {
    const order = { ...service.orders()[0], status: 'shipped' as const };
    const syncStatus = new SyncStatusService();
    service.orders.set([order]);
    const update = vi.fn(() => ({
      eq: () => ({
        eq: async () => ({ error: null, count: 0 }),
      }),
    }));
    Object.assign(service, {
      supabase: { client: { from: () => ({ update }) } },
      workspaceService: { currentWorkspace: () => ({ id: order.workspace_id }) },
      syncStatus,
    });

    const ergebnis = await service.markAsDelivered(order.id);

    expect(ergebnis).toMatchObject({ data: null, reportedBySyncStatus: true });
    expect(service.orders()[0].status).toBe('shipped');
    expect(syncStatus.fehler()[0].vorgang).toBe('Markieren der Sendung als zugestellt');
  });

  it('übernimmt beim Bündeln ausschließlich die von der RPC zurückgegebene UUID', async () => {
    const candidate = service.bundleCandidates()[0];
    const echteId = '7f7d9ca8-f1e6-4c4f-b5d6-4d0dc32a3cd9';
    const datenbankBündel: ShippingOrder = {
      ...candidate.orders[0],
      id: echteId,
      order_number: 'BUNDLE-2x-ORD-1001',
      item_title: 'SAMMELPAKET (2 Artikel)',
      is_bundled: true,
      bundled_order_ids: candidate.orders.map((order) => order.id),
      bundled_item_titles: candidate.orders.map((order) => order.item_title),
    };
    const rpc = vi.fn(async () => ({ data: datenbankBündel, error: null }));
    Object.assign(service, {
      supabase: { client: { rpc } },
      workspaceService: { currentWorkspace: () => ({ id: candidate.orders[0].workspace_id }) },
    });

    const ergebnis = await service.bundleOrders(candidate);

    expect(ergebnis).toEqual({ data: datenbankBündel, error: null });
    expect(service.orders().map((order) => order.id)).toContain(echteId);
    expect(service.orders().map((order) => order.id)).not.toContain(candidate.orders[0].id);
    expect(rpc).toHaveBeenCalledWith(
      'bundle_shipping_orders',
      expect.objectContaining({
        p_workspace_id: candidate.orders[0].workspace_id,
        p_order_ids: candidate.orders.map((order) => order.id),
      }),
    );
  });

  it('belässt den lokalen Bestand beim fehlgeschlagenen atomaren Bündeln unverändert', async () => {
    const candidate = service.bundleCandidates()[0];
    const vorher = service.orders();
    Object.assign(service, {
      supabase: {
        client: { rpc: vi.fn(async () => ({ data: null, error: new Error('offline') })) },
      },
      workspaceService: { currentWorkspace: () => ({ id: candidate.orders[0].workspace_id }) },
    });

    const ergebnis = await service.bundleOrders(candidate);

    expect(ergebnis.data).toBeNull();
    expect(ergebnis.error).not.toBeNull();
    expect(service.orders()).toEqual(vorher);
  });

  it('stellt beim Auflösen die ausschließlich von der RPC zurückgegebenen Originalaufträge wieder her', async () => {
    const original = service.orders()[0];
    const bündel: ShippingOrder = {
      ...original,
      id: '7f7d9ca8-f1e6-4c4f-b5d6-4d0dc32a3cd9',
      is_bundled: true,
      bundled_order_ids: [original.id],
      bundled_item_titles: [original.item_title],
    };
    const wiederhergestellt: ShippingOrder = {
      ...original,
      id: '52eeea31-b6e3-4ee7-bf98-20552fd3302d',
    };
    service.orders.set([bündel]);
    const rpc = vi.fn(async () => ({ data: [wiederhergestellt], error: null }));
    Object.assign(service, {
      supabase: { client: { rpc } },
      workspaceService: { currentWorkspace: () => ({ id: bündel.workspace_id }) },
    });

    const ergebnis = await service.unbundleOrder(bündel.id);

    expect(ergebnis).toEqual({ data: [wiederhergestellt], error: null });
    expect(service.orders()).toEqual([wiederhergestellt]);
    expect(rpc).toHaveBeenCalledWith('unbundle_shipping_order', {
      p_workspace_id: bündel.workspace_id,
      p_bundled_order_id: bündel.id,
    });
  });

  it('behält beim Bündeln die gemeinsame sale_id eines Sammelpakets', async () => {
    const ausgang = service.bundleCandidates()[0];
    const candidate = {
      ...ausgang,
      orders: ausgang.orders.map((order) => ({ ...order, sale_id: 'sale-gleich' })),
    };

    const ergebnis = await service.bundleOrders(candidate);

    expect(ergebnis.data?.sale_id).toBe('sale-gleich');
  });

  it('setzt die sale_id bei gemischten Quellverkäufen bewusst zurück', async () => {
    const ausgang = service.bundleCandidates()[0];
    const candidate = {
      ...ausgang,
      orders: ausgang.orders.map((order, index) => ({
        ...order,
        sale_id: index === 0 ? 'sale-a' : 'sale-b',
      })),
    };

    const ergebnis = await service.bundleOrders(candidate);

    expect(ergebnis.data?.sale_id).toBeNull();
  });

  it('bewahrt eine leere sale_id beim Reload als null', async () => {
    const datenbankZeile = {
      ...service.orders()[0],
      sale_id: null,
      customer: service.orders()[0].customer,
    };
    const from = vi.fn((table: string) => {
      if (table === 'shipping_orders') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [datenbankZeile], error: null }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    });
    Object.assign(service, {
      supabase: { client: { from } },
    });

    await service.loadFromSupabase('ws-1');

    expect(service.orders()[0].sale_id).toBeNull();
  });
});

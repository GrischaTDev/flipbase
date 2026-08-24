import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem } from '../models/flipbase.models';
import { CheckoutCustomerInfo } from '../models/store.models';
import { MockDataStoreService } from './mock-data-store.service';
import { StoreService } from './store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const artikel: InventoryItem = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  title: 'Testartikel',
  condition: 'used',
  status: 'ready',
  allocated_purchase_cost: 50,
  expected_value: 100,
  created_at: '2026-08-24T10:00:00.000Z',
};

const kunde: CheckoutCustomerInfo = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  street: 'Testweg',
  houseNumber: '1',
  zip: '12345',
  city: 'Berlin',
  country: 'Deutschland',
  shippingMethod: 'dhl_standard',
  paymentMethod: 'bank_transfer',
};

const dbBestellung = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  order_number: 'RF-100001',
  customer: kunde,
  subtotal: 100,
  shipping_cost: 0,
  total: 100,
  payment_method: 'bank_transfer',
  payment_status: 'pending',
  payment_id: 'REF-TEST',
  status: 'pending',
  created_at: '2026-08-24T10:00:00.000Z',
};

interface RpcAntwort {
  readonly data: typeof dbBestellung | null;
  readonly error: Error | null;
}

function erstelleService(rpcAntwort: RpcAntwort) {
  const rpc = vi.fn(async () => rpcAntwort);
  const client = {
    rpc,
    from: vi.fn((tabelle: string) => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () =>
            tabelle === 'store_orders' ? rpcAntwort : { data: null, error: null },
          ),
        })),
        then: (ok: (wert: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
      })),
    })),
  };
  const syncStatus = new SyncStatusService();
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client } },
      { provide: SyncStatusService, useValue: syncStatus },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: () => ({ id: dbBestellung.workspace_id }) },
      },
      { provide: MockDataStoreService, useValue: { isDemoMode: () => false } },
    ],
  });
  const service = runInInjectionContext(injector, () => new StoreService());
  service.cart.set([{ item: artikel, quantity: 1 }]);

  return { rpc, service, syncStatus };
}

describe('StoreService – bestätigte Bestellpersistenz', () => {
  it('übernimmt und leert erst nach dem atomar bestätigten Datenbankergebnis', async () => {
    const { service } = erstelleService({ data: dbBestellung, error: null });

    const ergebnis = await service.placeOrder(kunde);

    expect(ergebnis).toMatchObject({ status: 'success', order: { id: dbBestellung.id } });
    expect(service.orders()).toHaveLength(1);
    expect(service.cart()).toEqual([]);
  });

  it('behält Warenkorb und lokalen Bestellbestand bei einem direkten Parentfehler', async () => {
    const { service } = erstelleService({ data: null, error: new Error('RLS verweigert') });

    const ergebnis = await service.placeOrder(kunde);

    expect(ergebnis).toMatchObject({ status: 'failed', order: null });
    expect(service.orders()).toEqual([]);
    expect(service.cart()).toEqual([{ item: artikel, quantity: 1 }]);
  });

  it('behandelt eine leere RPC-Rückgabe wie einen fehlgeschlagenen Parent', async () => {
    const { service, syncStatus } = erstelleService({ data: null, error: null });

    const ergebnis = await service.placeOrder(kunde);

    expect(ergebnis).toMatchObject({ status: 'failed', order: null });
    expect(syncStatus.fehler()).toHaveLength(1);
    expect(service.cart()).toHaveLength(1);
  });
});

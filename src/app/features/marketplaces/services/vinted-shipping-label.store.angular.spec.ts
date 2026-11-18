import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { VintedShippingLabelStore } from './vinted-shipping-label.store';

const scope = {
  workspaceId: '46800000-0000-4000-8000-000000000011',
  connectionId: '46800000-0000-4000-8000-000000000021',
};
const row = {
  id: 7,
  ...{ workspace_id: scope.workspaceId, connection_id: scope.connectionId },
  external_transaction_id: '24052549356',
  external_shipment_id: '51458635363',
  external_conversation_id: '500969788562',
  title: 'Carhartt WIP Teddy-Fleecejacke',
  carrier_name: 'DPD Shop2Shop',
  label_type: 'printable',
  storage_path: `${scope.workspaceId}/${scope.connectionId}/24052549356.pdf`,
  mime_type: 'application/pdf',
  requested_by_flipbase: true,
  fetched_at: '2026-11-13T10:00:00+00:00',
};
const sale = {
  ...scope,
  id: '46800000-0000-4000-8000-000000000031',
  shipmentId: '51458635363',
  saleState: 'sold',
} as MarketplaceEntry;

describe('Vinted-Versandscheine', () => {
  let rows: unknown[];
  let requestShippingLabel: ReturnType<typeof vi.fn>;
  let createSignedUrl: ReturnType<typeof vi.fn>;
  let toast: ToastService;
  let store: VintedShippingLabelStore;

  beforeEach(() => {
    rows = [row];
    requestShippingLabel = vi.fn().mockResolvedValue({ outcome: 'ready', requested: true });
    createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.test/x' } });
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({ data: rows, error: null }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: () => query,
              storage: { from: () => ({ createSignedUrl }) },
            },
          },
        },
        { provide: AuthService, useValue: { session: signal({ access_token: 'token' }) } },
        { provide: MarketplaceBrowserTestApiService, useValue: { requestShippingLabel } },
      ],
    });
    store = TestBed.inject(VintedShippingLabelStore);
    toast = TestBed.inject(ToastService);
  });
  afterEach(() => {
    toast.toasts().forEach(({ id }) => toast.dismiss(id));
    vi.useRealTimers();
  });

  it('lädt die Versandscheine des Kontos und ordnet sie dem Verkauf zu', async () => {
    rows = [row, { ...row, id: 8, mime_type: 'text/html' }];
    await store.load(scope);
    expect(store.labels()).toHaveLength(1);
    expect(store.findForSale(sale)?.carrierName).toBe('DPD Shop2Shop');
    expect(store.findForSale({ ...sale, connectionId: 'anderes-konto' })).toBeNull();
    expect(store.findForSale({ ...sale, externalId: '999' })).toBeNull();
    expect(store.findForSale({ ...sale, externalId: '24052549356', shipmentId: '999' })).toBeNull();
    expect(store.findForSale({ ...sale, externalId: '24052549356', shipmentId: null })?.id).toBe(
      '7',
    );
  });

  it('verknüpft keine Datei, wenn dieselbe Versandnummer mehrere Verkäufe trifft', async () => {
    rows = [row, { ...row, id: 8, external_transaction_id: '24052549357' }];
    await store.load(scope);
    expect(store.findForSale(sale)).toBeNull();
  });

  it('beobachtet einen gespeicherten Versandscheinauftrag und lädt erst nach Abschluss neu', async () => {
    vi.useFakeTimers();
    rows = [];
    await store.load(scope);
    expect(store.findForSale(sale)).toBeNull();
    let complete: (result: { outcome: 'ready'; requested: boolean }) => void = () => undefined;
    requestShippingLabel.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const request = store.request(sale);
    expect(store.requesting().has(sale.id)).toBe(true);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(requestShippingLabel).toHaveBeenCalledOnce();
    expect(store.requesting().has(sale.id)).toBe(true);
    rows = [row];
    complete({ outcome: 'ready', requested: true });
    await request;
    expect(requestShippingLabel).toHaveBeenCalledOnce();
    expect(requestShippingLabel).toHaveBeenLastCalledWith(scope, sale.id, 'token');
    expect(store.requesting().has(sale.id)).toBe(false);
    expect(store.findForSale(sale)?.id).toBe('7');
    expect(toast.toasts()).toEqual([]);
  });

  it('zeigt Ablehnungen von Vinted als verständliche Meldung', async () => {
    requestShippingLabel.mockResolvedValue({
      outcome: 'failed',
      requested: false,
      errorCode: 'label_choice_required',
    });
    await store.request(sale);
    expect(toast.toasts().at(-1)?.title).toContain(
      'Bestätige die Versandangaben im Vinted-Verkaufschat',
    );
    requestShippingLabel.mockResolvedValue({ outcome: 'pending', requested: true });
    await store.request(sale);
    expect(toast.toasts().at(-1)?.title).toContain('erstellt den Versandschein noch');
  });

  it('lädt den Versandschein mit sprechendem Dateinamen aus einem kurz gültigen Link', async () => {
    await store.load(scope);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await store.download(store.labels()[0]!);
    expect(createSignedUrl).toHaveBeenCalledWith(row.storage_path, 120, {
      download: 'Versandschein-24052549356.pdf',
    });
    expect(click).toHaveBeenCalledTimes(1);
  });
});

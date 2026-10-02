import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { EbayAccountApiService } from './ebay-account-api.service';
import { EbayOrderImportApiService } from './ebay-order-import-api.service';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
const mapping = { id, listingId: '123', variationId: null, target: { catalogProductId: id } };
describe('eBay-Übernahmeadapter', () => {
  let api: EbayOrderImportApiService;
  let invoke: ReturnType<typeof vi.fn>;
  let rpc: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    invoke = vi.fn();
    rpc = vi.fn(async () => ({ data: mapping, error: null }));
    from = vi.fn();
    status = vi.fn(async () => ({
      configured: true,
      importAvailable: true,
      connection: { ...scope, status: 'connected', environment: 'production' },
    }));
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { functions: { invoke }, rpc, from } } },
        { provide: EbayAccountApiService, useValue: { loadStatus: status } },
      ],
    });
    api = TestBed.inject(EbayOrderImportApiService);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('explains known SQL rejections and keeps them distinct from an unknown commit', async () => {
    for (const [code, text] of [
      ['legacy_sale_conflict', 'Bereits manuell gebucht'],
      ['stock_unavailable', 'Bestand reicht'],
      ['target_archived', 'archiviert'],
    ]) {
      invoke.mockResolvedValueOnce({
        data: null,
        error: { context: Response.json({ error: code }, { status: 409 }) },
      });
      await expect(
        api.bookOrder({
          ...scope,
          orderId: 'order-1',
          snapshotId: id,
          reviewHash: 'a'.repeat(64),
          assignments: [],
          costs: {
            platformFeeCents: 0,
            shippingCostCents: 0,
            shippingMode: null,
            additionalCosts: [],
          },
        }),
      ).rejects.toMatchObject({ message: expect.stringContaining(text), outcomeUnknown: false });
    }
  });
  it('schreibt Zuordnungen mit Nutzer-RPC und erhält null als fehlende Variante', async () => {
    expect(await api.saveMapping(scope, '123', null, mapping.target)).toEqual(mapping);
    expect(rpc).toHaveBeenCalledWith('ebay_set_article_mapping', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_listing_id: '123',
      p_variation_id: null,
      p_target: mapping.target,
    });
    expect(invoke).not.toHaveBeenCalled();
  });
  it('akzeptiert keine Bestätigung mit abweichendem Zielartikel', async () => {
    rpc.mockResolvedValueOnce({
      data: { ...mapping, target: { inventoryItemId: id } },
      error: null,
    });
    await expect(api.saveMapping(scope, '123', null, mapping.target)).rejects.toThrow();
  });
  it('prüft die eigene Verbindung vor dem direkten Zuordnungsabruf', async () => {
    status.mockResolvedValueOnce({
      configured: true,
      importAvailable: true,
      connection: {
        ...scope,
        connectionId: 'foreign',
        status: 'connected',
        environment: 'production',
      },
    });
    await expect(api.loadMappings(scope)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
    status.mockResolvedValueOnce({
      configured: true,
      connection: { ...scope, status: 'connected', environment: 'production' },
    });
    await expect(api.loadMappings(scope)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it('kennt eine verlorene Buchungsantwort als unklaren Ausgang', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('network') });
    const input = {
      ...scope,
      orderId: 'order-1',
      snapshotId: id,
      reviewHash: 'a'.repeat(64),
      assignments: [],
      costs: { platformFeeCents: 0, shippingCostCents: 0, shippingMode: null, additionalCosts: [] },
    };
    await expect(api.bookOrder(input)).rejects.toMatchObject({ outcomeUnknown: true });
  });
  it('kennzeichnet auch abgebrochene Transportaufrufe als unklaren Buchungsausgang', async () => {
    invoke.mockRejectedValueOnce(new Error('abort'));
    await expect(
      api.bookOrder({
        ...scope,
        orderId: 'order-1',
        snapshotId: id,
        reviewHash: 'a'.repeat(64),
        assignments: [],
        costs: {
          platformFeeCents: 0,
          shippingCostCents: 0,
          shippingMode: null,
          additionalCosts: [],
        },
      }),
    ).rejects.toMatchObject({ outcomeUnknown: true });
  });
  it('zeigt bekannte Anbieterfehler und prüft positive Rücknahmebestätigung', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: Response.json({ error: 'provider_unavailable' }, { status: 502 }) },
    });
    await expect(api.prepareOrder(scope, 'order-1')).rejects.toThrow('eBay konnte');
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(api.clearRecordedElsewhere(scope, 'order-1')).rejects.toThrow('Rücknahme');
    expect(invoke).toHaveBeenLastCalledWith('ebay-account', {
      body: {
        action: 'order_clear_recorded_elsewhere',
        ...scope,
        orderId: 'order-1',
        confirmed: true,
      },
    });
  });
});

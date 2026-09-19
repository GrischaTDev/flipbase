import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { FulfillmentService } from './fulfillment.service';
import { StoreService } from './store.service';
import { SyncStatusService } from './sync-status.service';
import { WebhookService } from './webhook.service';

const workspace = { id: '11111111-1111-4111-8111-111111111111' };

function supabaseUpsert(antwort: { data: unknown; error: unknown | null }) {
  const single = vi.fn(async () => antwort);
  return {
    client: {
      from: vi.fn(() => ({
        upsert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
      })),
    },
  };
}

describe('Konfigurationsdienste – DB-first', () => {
  it('schreibt nach dem Wechsel ausschließlich B-Werte in Workspace B', async () => {
    const currentWorkspace = signal({ id: 'workspace-b' });
    const upsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { payments: { stripeEnabled: true, stripePublishableKey: 'pk_b' } },
          error: null,
        })),
      })),
    }));
    const service = Object.create(StoreService.prototype) as StoreService;
    Object.assign(service, {
      storeSettings: signal({
        storeName: 'B',
        tagline: '',
        shippingFlatRate: 4.99,
        freeShippingThreshold: 50,
        currency: 'EUR',
        payments: { stripeEnabled: false, stripePublishableKey: '' },
        imprint: {},
        noticeText: '',
      }),
      workspaceService: { currentWorkspace },
      supabase: { client: { from: vi.fn(() => ({ upsert })) } },
    });

    await service.updatePaymentsConfig({
      stripeEnabled: true,
      stripePublishableKey: 'pk_b',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'workspace-b',
        payments: expect.objectContaining({ stripePublishableKey: 'pk_b' }),
      }),
      { onConflict: 'workspace_id' },
    );
  });

  it('ändert Zahlungsmethoden bei Nulltreffer nicht lokal', async () => {
    const service = Object.create(StoreService.prototype) as StoreService;
    const storeSettings = signal({ payments: { stripeEnabled: false } });
    Object.assign(service, {
      storeSettings,
      workspaceService: { currentWorkspace: () => workspace },
      syncStatus: new SyncStatusService(),
      supabase: supabaseUpsert({ data: null, error: null }),
    });

    const result = await service.updatePaymentsConfig({ stripeEnabled: true });

    expect(result.data).toBeNull();
    expect(result.reportedBySyncStatus).toBe(true);
    expect(storeSettings().payments.stripeEnabled).toBe(false);
  });

  it('übernimmt Carrier-Konfiguration erst aus der bestätigten Rückgabe', async () => {
    const service = Object.create(FulfillmentService.prototype) as FulfillmentService;
    const carrierConfig = signal({
      dhlEnabled: false,
      dhlEkp: '',
      dhlApiKey: '',
      hermesEnabled: false,
      hermesClientId: '',
      hermesApiKey: '',
    });
    Object.assign(service, {
      carrierConfig,
      workspaceService: { currentWorkspace: () => workspace },
      syncStatus: new SyncStatusService(),
      supabase: supabaseUpsert({
        data: {
          dhl_enabled: true,
          dhl_ekp: 'db-ekp',
          dhl_api_key: '',
          hermes_enabled: false,
          hermes_client_id: '',
          hermes_api_key: '',
        },
        error: null,
      }),
    });

    const result = await service.updateCarrierConfig({ dhlEnabled: true, dhlEkp: 'input-ekp' });

    expect(result.error).toBeNull();
    expect(result.data?.dhlEkp).toBe('db-ekp');
    expect(carrierConfig().dhlEkp).toBe('db-ekp');
  });

  it('weist Webhook-Speichern ohne Workspace zurück und behält den lokalen Stand', async () => {
    const service = Object.create(WebhookService.prototype) as WebhookService;
    const config = signal({ discordEnabled: false, discordWebhookUrl: '' });
    Object.assign(service, {
      config,
      workspaceService: { currentWorkspace: () => null },
      syncStatus: new SyncStatusService(),
      supabase: supabaseUpsert({ data: null, error: null }),
    });

    const result = await service.updateConfig({ discordEnabled: true });

    expect(result.data).toBeNull();
    expect(result.reportedBySyncStatus).toBe(true);
    expect(config().discordEnabled).toBe(false);
  });
});

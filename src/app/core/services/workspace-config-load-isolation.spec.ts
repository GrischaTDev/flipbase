import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { FulfillmentService } from './fulfillment.service';
import { StoreService } from './store.service';
import { WebhookService } from './webhook.service';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function queryClient(
  responses: Record<string, Record<string, Promise<{ data: unknown; error: null }>>>,
) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn((_column: string, workspaceId: string) => {
          const response = responses[table][workspaceId];
          const ordered = {
            then: response.then.bind(response),
            limit: vi.fn(() => response),
          };
          return {
            maybeSingle: vi.fn(() => response),
            order: vi.fn(() => ordered),
          };
        }),
      })),
    })),
  };
}

const workspaceA = { id: 'workspace-a' };
const workspaceB = { id: 'workspace-b' };

describe('Workspace-isoliertes Laden der Konfigurationen', () => {
  it('setzt Store-Daten bei einem leeren Workspace B zurück und ignoriert die verspätete Antwort von A', async () => {
    const currentWorkspace = signal(workspaceA);
    const settingsA = deferred<{ data: unknown; error: null }>();
    const ordersA = deferred<{ data: unknown; error: null }>();
    const service = Object.create(StoreService.prototype) as StoreService;
    Object.assign(service, {
      storeSettings: signal({
        storeName: 'A',
        tagline: 'A',
        shippingFlatRate: 9,
        freeShippingThreshold: 99,
        currency: 'EUR',
        payments: { stripeEnabled: true, stripePublishableKey: 'pk_a' },
        imprint: {},
        noticeText: 'A',
      }),
      orders: signal([{ id: 'order-a' }]),
      loadedWorkspaceId: signal<string | null>('workspace-a'),
      workspaceService: { currentWorkspace },
      logger: { error: vi.fn() },
      supabase: {
        client: queryClient({
          store_settings: {
            'workspace-a': settingsA.promise,
            'workspace-b': Promise.resolve({ data: null, error: null }),
          },
          store_orders: {
            'workspace-a': ordersA.promise,
            'workspace-b': Promise.resolve({ data: [], error: null }),
          },
        }),
      },
    });

    const loadingA = service.loadFromSupabase(workspaceA.id);
    currentWorkspace.set(workspaceB);
    await service.loadFromSupabase(workspaceB.id);

    expect(service.storeSettings().payments.stripePublishableKey).toBe('');
    expect(service.orders()).toEqual([]);

    settingsA.resolve({
      data: {
        store_name: 'Verspätetes A',
        payments: { stripeEnabled: true, stripePublishableKey: 'pk_delayed_a' },
      },
      error: null,
    });
    ordersA.resolve({ data: [{ id: 'delayed-order-a', items: [] }], error: null });
    await loadingA;

    expect(service.storeSettings().payments.stripePublishableKey).toBe('');
    expect(service.orders()).toEqual([]);
  });

  it('setzt Carrier-Daten bei einem leeren Workspace B zurück und ignoriert die verspätete Antwort von A', async () => {
    const currentWorkspace = signal(workspaceA);
    const carrierA = deferred<{ data: unknown; error: null }>();
    const ordersA = deferred<{ data: unknown; error: null }>();
    const service = Object.create(FulfillmentService.prototype) as FulfillmentService;
    Object.assign(service, {
      carrierConfig: signal({
        dhlEnabled: true,
        dhlEkp: 'a-ekp',
        dhlApiKey: 'a-secret',
        hermesEnabled: true,
        hermesClientId: 'a-client',
        hermesApiKey: 'a-hermes-secret',
      }),
      orders: signal([{ id: 'order-a' }]),
      loadedWorkspaceId: signal<string | null>('workspace-a'),
      workspaceService: { currentWorkspace },
      logger: { error: vi.fn() },
      supabase: {
        client: queryClient({
          carrier_configs: {
            'workspace-a': carrierA.promise,
            'workspace-b': Promise.resolve({ data: null, error: null }),
          },
          shipping_orders: {
            'workspace-a': ordersA.promise,
            'workspace-b': Promise.resolve({ data: [], error: null }),
          },
        }),
      },
    });

    const loadingA = service.loadFromSupabase(workspaceA.id);
    currentWorkspace.set(workspaceB);
    await service.loadFromSupabase(workspaceB.id);

    expect(service.carrierConfig().dhlApiKey).toBe('');
    expect(service.carrierConfig().hermesApiKey).toBe('');
    expect(service.orders()).toEqual([]);

    carrierA.resolve({
      data: {
        dhl_enabled: true,
        dhl_ekp: 'delayed-a',
        dhl_api_key: 'delayed-a-secret',
        hermes_enabled: false,
        hermes_client_id: '',
        hermes_api_key: '',
      },
      error: null,
    });
    ordersA.resolve({ data: [{ id: 'delayed-order-a' }], error: null });
    await loadingA;

    expect(service.carrierConfig().dhlApiKey).toBe('');
    expect(service.orders()).toEqual([]);
  });

  it('setzt Webhook und Inbox bei einem leeren Workspace B zurück und ignoriert die verspätete Antwort von A', async () => {
    const currentWorkspace = signal(workspaceA);
    const configA = deferred<{ data: unknown; error: null }>();
    const notificationsA = deferred<{ data: unknown; error: null }>();
    const service = Object.create(WebhookService.prototype) as WebhookService;
    Object.assign(service, {
      config: signal({
        discordEnabled: true,
        discordWebhookUrl: 'https://a.example',
        telegramEnabled: true,
        telegramBotToken: 'a-secret',
        telegramChatId: 'a-chat',
        customWebhookEnabled: false,
        customWebhookUrl: '',
        notifyOnSale: true,
        notifyOnPurchase: true,
        notifyOnLowMargin: true,
        soundEnabled: true,
      }),
      notifications: signal([{ id: 'notification-a' }]),
      loadedWorkspaceId: signal<string | null>('workspace-a'),
      workspaceService: { currentWorkspace },
      logger: { error: vi.fn() },
      supabase: {
        client: queryClient({
          webhook_configs: {
            'workspace-a': configA.promise,
            'workspace-b': Promise.resolve({ data: null, error: null }),
          },
          app_notifications: {
            'workspace-a': notificationsA.promise,
            'workspace-b': Promise.resolve({ data: [], error: null }),
          },
        }),
      },
    });

    const loadingA = service.loadFromSupabase(workspaceA.id);
    currentWorkspace.set(workspaceB);
    await service.loadFromSupabase(workspaceB.id);

    expect(service.config().telegramBotToken).toBe('');
    expect(service.notifications()).toEqual([]);

    configA.resolve({
      data: {
        discord_enabled: false,
        discord_webhook_url: '',
        telegram_enabled: true,
        telegram_bot_token: 'delayed-a-secret',
        telegram_chat_id: 'delayed-a-chat',
        custom_webhook_enabled: false,
        custom_webhook_url: '',
        notify_on_sale: true,
        notify_on_purchase: true,
        notify_on_low_margin: true,
        sound_enabled: true,
      },
      error: null,
    });
    notificationsA.resolve({
      data: [
        {
          id: 'delayed-notification-a',
          type: 'system',
          title: 'A',
          message: 'A',
          created_at: '2026-08-25T10:00:00Z',
          read: false,
        },
      ],
      error: null,
    });
    await loadingA;

    expect(service.config().telegramBotToken).toBe('');
    expect(service.notifications()).toEqual([]);
  });
});

import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { WebhookService } from './webhook.service';
import { WorkspaceService } from './workspace.service';
import { prepareBrowserStorage } from '../utils/browser-storage-initialization';

describe('Webhook-Zugangsdaten im Browserspeicher', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('entfernt beide alten Schlüssel beim Start ohne geladenen Webhook-Dienst', () => {
    localStorage.setItem('flipbase_webhook_config', '{"telegramBotToken":"secret"}');
    localStorage.setItem('reflip_webhook_config', '{"telegramBotToken":"older-secret"}');
    localStorage.setItem('flipbase_umzug_erledigt', 'true');
    localStorage.setItem('flipbase_theme', 'dark');

    prepareBrowserStorage(localStorage);

    expect(localStorage.getItem('flipbase_webhook_config')).toBeNull();
    expect(localStorage.getItem('reflip_webhook_config')).toBeNull();
    expect(localStorage.getItem('flipbase_theme')).toBe('dark');
  });

  it('entfernt alte Zugangsdaten, ohne sie zu laden', () => {
    localStorage.setItem(
      'flipbase_webhook_config',
      JSON.stringify({ telegramBotToken: 'legacy-secret' }),
    );
    const readStorage = vi.spyOn(Storage.prototype, 'getItem');
    const writeStorage = vi.spyOn(Storage.prototype, 'setItem');
    const injector = Injector.create({ providers: [] });
    const service = runInInjectionContext(injector, () => new WebhookService());

    expect(localStorage.length).toBe(0);
    expect(readStorage).not.toHaveBeenCalled();
    expect(writeStorage).not.toHaveBeenCalled();
    expect(service.config().telegramBotToken).toBe('');
  });

  it('schreibt geänderte Zugangsdaten nicht erneut in den Browserspeicher', async () => {
    const writeStorage = vi.spyOn(Storage.prototype, 'setItem');
    const injector = Injector.create({ providers: [] });
    const service = runInInjectionContext(injector, () => new WebhookService());

    await service.updateConfig({
      telegramBotToken: 'new-secret',
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/secret',
    });

    expect(service.config().telegramBotToken).toBeUndefined();
    expect(writeStorage).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('initialisiert sich auch bei gesperrtem Browserspeicher', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    const injector = Injector.create({ providers: [] });
    const service = runInInjectionContext(injector, () => new WebhookService());

    expect(service.config().telegramBotToken).toBe('');
    expect(service.config().notifyOnSale).toBe(true);
  });

  it('lädt die gespeicherte Workspace-Konfiguration ohne neue Browserkopie', async () => {
    const writeStorage = vi.spyOn(Storage.prototype, 'setItem');
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({ data: [], error: null }),
      maybeSingle: async () => ({
        data: {
          telegram_enabled: true,
          telegram_bot_token: 'database-secret',
          telegram_chat_id: '12345',
          notify_on_sale: true,
        },
        error: null,
      }),
    };
    const injector = Injector.create({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: (table: string) => {
                expect(table).toBe('app_notifications');
                return query;
              },
              functions: {
                invoke: async () => ({
                  data: {
                    telegramEnabled: true,
                    hasTelegramCredentials: true,
                    notifyOnSale: true,
                    discordEnabled: false,
                    customWebhookEnabled: false,
                    notifyOnPurchase: true,
                    notifyOnLowMargin: true,
                    soundEnabled: true,
                  },
                  error: null,
                }),
              },
            },
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: 'workspace-1' }) },
        },
      ],
    });
    const service = runInInjectionContext(injector, () => new WebhookService());

    await service.loadFromSupabase('workspace-1');

    expect(service.loadedWorkspaceId()).toBe('workspace-1');
    expect(service.config().telegramBotToken).toBeUndefined();
    expect(service.config().hasTelegramCredentials).toBe(true);
    expect(service.config().telegramEnabled).toBe(true);
    expect(writeStorage).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
});

import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { WebhookService } from './webhook.service';
import { WorkspaceService } from './workspace.service';

function createService() {
  const currentWorkspace = signal({ id: 'workspace-a' });
  const invoke = vi.fn(async () => ({
    data: {
      discordEnabled: false,
      telegramEnabled: true,
      customWebhookEnabled: false,
      hasTelegramCredentials: true,
      notifyOnSale: true,
      notifyOnPurchase: true,
      notifyOnLowMargin: true,
      soundEnabled: false,
    },
    error: null,
  }));
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { functions: { invoke } } } },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
    ],
  });
  const service = runInInjectionContext(injector, () => new WebhookService());
  return { service, currentWorkspace, invoke };
}

describe('Webhook-Konfiguration beim Workspace-Wechsel', () => {
  it('schreibt Zugangsdaten von A vor dem Lade-Effekt nicht in Workspace B', async () => {
    const { service, currentWorkspace, invoke } = createService();
    service.loadedWorkspaceId.set('workspace-a');
    service.config.update((config) => ({ ...config, telegramBotToken: 'secret-a' }));
    currentWorkspace.set({ id: 'workspace-b' });

    const result = await service.updateConfig({ soundEnabled: false });

    expect(result.error).toBeInstanceOf(Error);
    expect(invoke).not.toHaveBeenCalled();
    expect(service.config().soundEnabled).toBe(true);
  });

  it('weist Speichern während eines unvollständigen Ladevorgangs zurück', async () => {
    const { service, invoke } = createService();

    const result = await service.updateConfig({ telegramBotToken: 'input-secret' });

    expect(result.error).toBeInstanceOf(Error);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('speichert eine vollständig geladene Konfiguration im zugehörigen Workspace', async () => {
    const { service, invoke } = createService();
    service.loadedWorkspaceId.set('workspace-a');
    service.config.update((config) => ({ ...config, telegramBotToken: 'secret-a' }));

    const result = await service.updateConfig({ soundEnabled: false });

    expect(result.error).toBeNull();
    expect(invoke).toHaveBeenCalledWith('webhook-dispatch', {
      body: { action: 'save', workspaceId: 'workspace-a', settings: { soundEnabled: false } },
    });
    expect(service.config().telegramBotToken).toBeUndefined();
    expect(service.config().hasTelegramCredentials).toBe(true);
    expect(service.config().soundEnabled).toBe(false);
  });
});

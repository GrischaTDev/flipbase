import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { WebhookService } from './webhook.service';
import { WorkspaceService } from './workspace.service';

function createService() {
  const currentWorkspace = signal({ id: 'workspace-a' });
  const upsert = vi.fn(() => ({
    select: () => ({ single: async () => ({ data: { id: 'config-a' }, error: null }) }),
  }));
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from: () => ({ upsert }) } } },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
    ],
  });
  const service = runInInjectionContext(injector, () => new WebhookService());
  return { service, currentWorkspace, upsert };
}

describe('Webhook-Konfiguration beim Workspace-Wechsel', () => {
  it('schreibt Zugangsdaten von A vor dem Lade-Effekt nicht in Workspace B', async () => {
    const { service, currentWorkspace, upsert } = createService();
    service.loadedWorkspaceId.set('workspace-a');
    service.config.update((config) => ({ ...config, telegramBotToken: 'secret-a' }));
    currentWorkspace.set({ id: 'workspace-b' });

    const result = await service.updateConfig({ soundEnabled: false });

    expect(result.error).toBeInstanceOf(Error);
    expect(upsert).not.toHaveBeenCalled();
    expect(service.config().soundEnabled).toBe(true);
  });

  it('weist Speichern während eines unvollständigen Ladevorgangs zurück', async () => {
    const { service, upsert } = createService();

    const result = await service.updateConfig({ telegramBotToken: 'input-secret' });

    expect(result.error).toBeInstanceOf(Error);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('speichert eine vollständig geladene Konfiguration im zugehörigen Workspace', async () => {
    const { service, upsert } = createService();
    service.loadedWorkspaceId.set('workspace-a');
    service.config.update((config) => ({ ...config, telegramBotToken: 'secret-a' }));

    const result = await service.updateConfig({ soundEnabled: false });

    expect(result.error).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'workspace-a',
        telegram_bot_token: 'secret-a',
        sound_enabled: false,
      }),
      { onConflict: 'workspace_id' },
    );
    expect(service.config().soundEnabled).toBe(false);
  });
});

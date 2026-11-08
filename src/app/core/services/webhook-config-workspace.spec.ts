import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { WebhookConfig } from '../models/webhook.models';
import { SupabaseService } from './supabase.service';
import { WebhookService } from './webhook.service';
import { WorkspaceService } from './workspace.service';

interface SettingsResponse {
  data: WebhookConfig | null;
  error: Error | null;
}

function webhookSettings(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    discordEnabled: false,
    telegramEnabled: true,
    customWebhookEnabled: false,
    hasTelegramCredentials: true,
    notifyOnSale: true,
    notifyOnPurchase: true,
    notifyOnLowMargin: true,
    soundEnabled: false,
    ...overrides,
  };
}

function pendingResponse() {
  let resolve!: (response: SettingsResponse) => void;
  const promise = new Promise<SettingsResponse>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createService() {
  const currentWorkspace = signal<{ id: string } | null>({ id: 'workspace-a' });
  const invoke = vi.fn<
    (
      name: string,
      options: {
        body: { action: string; workspaceId: string; settings?: Partial<WebhookConfig> };
      },
    ) => Promise<SettingsResponse>
  >(async () => ({
    data: webhookSettings(),
    error: null,
  }));
  const notifications = {
    select: () => notifications,
    eq: () => notifications,
    order: () => notifications,
    limit: async () => ({ data: [], error: null }),
  };
  const injector = Injector.create({
    providers: [
      {
        provide: SupabaseService,
        useValue: { client: { functions: { invoke }, from: () => notifications } },
      },
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
    expect(service.config().saleSoundEnabled).toBe(false);
  });
});

describe('Verkaufston mit älteren Backendantworten', () => {
  it('speichert nach einer alten Antwort ohne unbekanntes Feld und verändert die Eingabe nicht', async () => {
    const { service, invoke } = createService();
    invoke.mockImplementation(async (_name, { body }) => {
      if (body.action === 'save' && 'saleSoundEnabled' in (body.settings ?? {})) {
        return { data: null, error: new Error('Unbekannte Einstellung') };
      }
      return { data: webhookSettings(body.settings), error: null };
    });
    await service.loadFromSupabase('workspace-a');
    const settings = Object.freeze({ soundEnabled: true, saleSoundEnabled: false });

    const result = await service.updateConfig(settings);

    expect(result.error).toBeNull();
    expect(invoke).toHaveBeenLastCalledWith('webhook-dispatch', {
      body: { action: 'save', workspaceId: 'workspace-a', settings: { soundEnabled: true } },
    });
    expect(settings).toEqual({ soundEnabled: true, saleSoundEnabled: false });
    expect(service.supportsSaleSound()).toBe(false);
    expect(result.data?.soundEnabled).toBe(true);
    expect(result.data?.saleSoundEnabled).toBe(true);
  });

  it('erkennt auch einen ausgeschalteten Verkaufston als unterstützte Einstellung', async () => {
    const { service, invoke } = createService();
    invoke.mockResolvedValueOnce({
      data: webhookSettings({ saleSoundEnabled: false }),
      error: null,
    });
    await service.loadFromSupabase('workspace-a');

    expect(service.supportsSaleSound()).toBe(true);
    expect(service.config().saleSoundEnabled).toBe(false);

    invoke.mockResolvedValueOnce({
      data: webhookSettings({ saleSoundEnabled: true }),
      error: null,
    });
    const result = await service.updateConfig({ soundEnabled: false, saleSoundEnabled: true });

    expect(result.error).toBeNull();
    expect(invoke).toHaveBeenLastCalledWith('webhook-dispatch', {
      body: {
        action: 'save',
        workspaceId: 'workspace-a',
        settings: { soundEnabled: false, saleSoundEnabled: true },
      },
    });
    expect(service.config().soundEnabled).toBe(false);
    expect(service.config().saleSoundEnabled).toBe(true);
  });

  it.each([
    { before: false, after: true },
    { before: true, after: false },
  ])(
    'übernimmt die Unterstützung aus einer bestätigten Speicherantwort ($before → $after)',
    async ({ before, after }) => {
      const { service, invoke } = createService();
      invoke.mockResolvedValueOnce({
        data: webhookSettings(before ? { saleSoundEnabled: false } : {}),
        error: null,
      });
      await service.loadFromSupabase('workspace-a');
      expect(service.supportsSaleSound()).toBe(before);
      invoke.mockResolvedValueOnce({
        data: webhookSettings(after ? { saleSoundEnabled: false } : {}),
        error: null,
      });

      const result = await service.updateConfig({ soundEnabled: false });

      expect(result.error).toBeNull();
      expect(service.supportsSaleSound()).toBe(after);
      expect(service.config().saleSoundEnabled).toBe(false);
    },
  );

  it.each([null, 'workspace-b'])(
    'setzt die Unterstützung beim Wechsel nach %s sofort zurück',
    async (workspaceId) => {
      const { service, invoke, currentWorkspace } = createService();
      invoke.mockResolvedValueOnce({
        data: webhookSettings({ saleSoundEnabled: false }),
        error: null,
      });
      await service.loadFromSupabase('workspace-a');
      expect(service.supportsSaleSound()).toBe(true);
      currentWorkspace.set(workspaceId ? { id: workspaceId } : null);

      const loading = service.loadFromSupabase(workspaceId ?? '');

      expect(service.supportsSaleSound()).toBe(false);
      expect(service.loadedWorkspaceId()).toBeNull();
      await loading;
      expect(service.supportsSaleSound()).toBe(false);
    },
  );

  it('übernimmt keine Unterstützung aus einer überholten Leseantwort', async () => {
    const { service, invoke } = createService();
    const older = pendingResponse();
    invoke.mockReturnValueOnce(older.promise);
    const oldLoad = service.loadFromSupabase('workspace-a');
    await service.loadFromSupabase('workspace-a');

    older.resolve({ data: webhookSettings({ saleSoundEnabled: true }), error: null });
    await oldLoad;

    expect(service.supportsSaleSound()).toBe(false);
    expect(service.config().saleSoundEnabled).toBe(false);
    expect(service.loadedWorkspaceId()).toBe('workspace-a');
  });

  it('verwirft eine Speicherantwort, wenn dieselbe Workspace-Konfiguration inzwischen neu geladen wurde', async () => {
    const { service, invoke } = createService();
    invoke.mockResolvedValueOnce({
      data: webhookSettings({ saleSoundEnabled: false }),
      error: null,
    });
    await service.loadFromSupabase('workspace-a');
    const older = pendingResponse();
    invoke.mockReturnValueOnce(older.promise);
    const saving = service.updateConfig({ soundEnabled: false, saleSoundEnabled: true });
    await service.loadFromSupabase('workspace-a');

    older.resolve({ data: webhookSettings({ saleSoundEnabled: true }), error: null });
    const result = await saving;

    expect(result.error).toBeInstanceOf(Error);
    expect(service.supportsSaleSound()).toBe(false);
    expect(service.config().saleSoundEnabled).toBe(false);
    expect(service.loadedWorkspaceId()).toBe('workspace-a');
  });

  it('übernimmt die Unterstützung nicht aus einer fehlgeschlagenen Speicherantwort', async () => {
    const { service, invoke } = createService();
    await service.loadFromSupabase('workspace-a');
    invoke.mockResolvedValueOnce({
      data: webhookSettings({ saleSoundEnabled: true }),
      error: new Error('Speichern abgelehnt'),
    });

    const result = await service.updateConfig({ soundEnabled: true });

    expect(result.error).toBeInstanceOf(Error);
    expect(service.supportsSaleSound()).toBe(false);
    expect(service.config().soundEnabled).toBe(false);
    expect(service.config().saleSoundEnabled).toBe(false);
  });
});

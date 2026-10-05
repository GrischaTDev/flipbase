import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { VintedFavoriteMessageApiService } from '../../services/vinted-favorite-message-api.service';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import type { FavoriteMessageSettings } from '../../models/vinted-favorite-messages';
import { VintedFavoriteMessagesComponent } from './vinted-favorite-messages.component';
const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const connection: MarketplaceConnection = {
  ...scope,
  marketplace: 'vinted',
  executionMode: 'local',
  displayName: 'Konto A',
  externalAccountId: '123',
  status: 'connected',
  capabilities: {},
  allowedActions: [],
  lastSyncedAt: null,
};
const account = signal<MarketplaceConnection | null>(connection);
const user = signal<{ id: string } | null>({ id: 'user-a' });
const workspace = signal({ id: scope.workspaceId });
const settings: FavoriteMessageSettings = {
  ...scope,
  enabled: false,
  active: false,
  version: 0,
  config: null,
  lastCheckedAt: null,
  events: [],
};
let api: { read: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
let dialog: { frage: ReturnType<typeof vi.fn> };
beforeEach(() => {
  account.set(connection);
  user.set({ id: 'user-a' });
  workspace.set({ id: scope.workspaceId });
  api = {
    read: vi.fn().mockResolvedValue(settings),
    save: vi.fn().mockImplementation(async (_settings, enabled, config) => ({
      ...settings,
      enabled,
      active: enabled,
      config,
      version: 1,
    })),
  };
  dialog = { frage: vi.fn().mockResolvedValue(false) };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceAccountStore, useValue: { selectedConnection: account } },
      { provide: VintedFavoriteMessageApiService, useValue: api },
      { provide: ConfirmDialogService, useValue: dialog },
      {
        provide: VintedLocalExtensionStore,
        useValue: {
          binding: signal({ messagesSend: true }),
          loadConnection: vi.fn(),
          messagesAllowed: () => true,
        },
      },
    ],
  }).overrideComponent(VintedFavoriteMessagesComponent, { set: { template: '', imports: [] } });
});
afterEach(() => TestBed.resetTestingModule());
async function render() {
  const fixture = TestBed.createComponent(VintedFavoriteMessagesComponent);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}
async function settle(
  fixture: ReturnType<typeof TestBed.createComponent<VintedFavoriteMessagesComponent>>,
) {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  fixture.detectChanges();
}
describe('Favorite message account and activation lifecycle', () => {
  it('never activates while editing and asks before the first enabled save', async () => {
    const fixture = await render();
    fixture.componentInstance.form.controls.enabled.setValue(true);
    expect(api.save).not.toHaveBeenCalled();
    await fixture.componentInstance.save();
    expect(dialog.frage).toHaveBeenCalledOnce();
    expect(api.save).not.toHaveBeenCalled();
    dialog.frage.mockResolvedValueOnce(true);
    await fixture.componentInstance.save();
    expect(api.save).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.settings()?.enabled).toBe(true);
  });
  it('keeps dirty edits and the original version when the background journal changes', async () => {
    const fixture = await render();
    fixture.componentInstance.form.controls.templates.at(0).setValue('Mein eigener Text');
    fixture.componentInstance.form.markAsDirty();
    api.read.mockResolvedValueOnce({
      ...settings,
      version: 4,
      active: true,
      config: {
        templates: ['Anderer Text'],
        rules: [],
        delayMinutes: 0,
        timezone: 'Europe/Berlin',
      },
    });
    await fixture.componentInstance.reload(true);
    expect(fixture.componentInstance.form.controls.templates.at(0).value).toBe('Mein eigener Text');
    expect(fixture.componentInstance.settings()?.version).toBe(0);
    expect(fixture.componentInstance.settings()?.active).toBe(true);
  });
  it('asks again after a renewed grant even when send permission is already approved', async () => {
    const activeSettings = { ...settings, enabled: true, active: true, version: 3 };
    api.read.mockResolvedValue(activeSettings);
    const fixture = await render();
    fixture.componentInstance.form.controls.templates.at(0).setValue('Geänderter Text');
    api.read.mockResolvedValue({ ...activeSettings, active: false });
    await fixture.componentInstance.save();
    expect(dialog.frage).toHaveBeenCalledOnce();
    expect(api.save).not.toHaveBeenCalled();
    dialog.frage.mockResolvedValueOnce(true);
    await fixture.componentInstance.save();
    expect(api.save).toHaveBeenCalledOnce();
  });
  it('does not reset edits after a refreshed account record with the same scope', async () => {
    const fixture = await render();
    fixture.componentInstance.form.controls.templates.at(0).setValue('Mein Text');
    account.set({ ...connection, lastSyncedAt: '2026-10-05T18:00:00Z' });
    await settle(fixture);
    expect(fixture.componentInstance.form.controls.templates.at(0).value).toBe('Mein Text');
    expect(api.read).toHaveBeenCalledOnce();
  });
  it('drops a pending save after account switch or logout', async () => {
    for (const change of ['account', 'logout']) {
      const fixture = await render();
      let finish: (saved: FavoriteMessageSettings) => void = () => undefined;
      api.save.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const saving = fixture.componentInstance.save();
      if (change === 'account') {
        api.read.mockResolvedValueOnce({ ...settings, connectionId: 'account-b' });
        account.set({ ...connection, connectionId: 'account-b' });
      } else user.set(null);
      await settle(fixture);
      finish({ ...settings, enabled: true, active: true, version: 1 });
      await saving;
      expect(fixture.componentInstance.settings()?.enabled).not.toBe(true);
      fixture.destroy();
      account.set(connection);
      user.set({ id: 'user-a' });
    }
  });
});

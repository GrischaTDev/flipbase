import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import {
  AiConnectionService,
  type AiConnection,
  type AiConnectionAccount,
} from '../../services/ai-connection.service';
import { AiConnectionsComponent } from './ai-connections.component';

const connection: AiConnection = {
  id: 'personal-grant',
  client_id: 'client',
  client_name: 'ChatGPT',
  access_mode: 'read',
  connected: true,
  revoked_at: null,
  accounts: [{ id: 'existing-account', display_name: 'Mein Konto' }],
};

describe('editing personal AI access', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup() {
    const currentWorkspace = signal({ id: 'own-workspace' });
    const service = {
      endpoint: '',
      list: vi.fn().mockResolvedValue([connection]),
      accounts: vi
        .fn<(_id: string) => Promise<readonly AiConnectionAccount[]>>()
        .mockResolvedValue(connection.accounts),
      update: vi.fn().mockResolvedValue(undefined),
      revoke: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AiConnectionService, useValue: service },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new AiConnectionsComponent());
    TestBed.tick();
    await vi.waitFor(() => expect(component.busy()).toBe(false));
    return { component, service, currentWorkspace };
  }

  it('opens the saved selection and only persists an explicit save', async () => {
    const { component, service } = await setup();
    await component.edit(connection);
    expect(component.form.controls.mode.value).toBe('read');
    expect(component.selectedAccounts()).toEqual(['existing-account']);
    component.form.controls.mode.setValue('edit');
    component.closeEditor();
    expect(service.update).not.toHaveBeenCalled();
    await component.edit(connection);
    component.form.controls.mode.setValue('edit');
    component.selectAccount('existing-account', false);
    await component.save();
    expect(service.update).toHaveBeenCalledExactlyOnceWith(connection, 'own-workspace', 'edit', []);
    expect(component.editing()).toBeNull();
    expect(service.revoke).not.toHaveBeenCalled();
  });

  it('keeps conflicts visible without replacing the saved snapshot', async () => {
    const { component, service } = await setup();
    service.update.mockRejectedValue({ message: 'Die Freigabe wurde inzwischen geändert.' });
    await component.edit(connection);
    component.form.controls.mode.setValue('edit');
    await component.save();
    expect(component.editError()).toContain('inzwischen geändert');
    expect(component.editing()).toBe(connection);
    expect(component.items()[0].access_mode).toBe('read');
    expect(component.saving()).toBe(false);
  });

  it('does not erase account access when loading accounts fails', async () => {
    const { component, service } = await setup();
    service.accounts.mockRejectedValue(new Error('offline'));
    await component.edit(connection);
    await component.save();
    expect(component.editError()).toContain('nicht geladen');
    expect(component.selectedAccounts()).toEqual(['existing-account']);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('drops the editor on workspace change and ignores an older account response', async () => {
    const { component, service, currentWorkspace } = await setup();
    let finish!: (accounts: readonly AiConnectionAccount[]) => void;
    service.accounts.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const loading = component.edit(connection);
    currentWorkspace.set({ id: 'other-workspace' });
    TestBed.tick();
    finish(connection.accounts);
    await loading;
    await component.save();
    expect(component.editing()).toBeNull();
    expect(component.accounts()).toEqual([]);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('cannot reopen a revoked connection', async () => {
    const { component, service } = await setup();
    await component.edit({ ...connection, revoked_at: '2026-11-15T12:00:00Z' });
    expect(component.editing()).toBeNull();
    expect(service.accounts).not.toHaveBeenCalled();
  });
});

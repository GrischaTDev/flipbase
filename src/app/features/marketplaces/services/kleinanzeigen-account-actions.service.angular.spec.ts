import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { KleinanzeigenAccountActionsService } from './kleinanzeigen-account-actions.service';
import { KleinanzeigenAccountService } from './kleinanzeigen-account.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
const workspace = '49000000-0000-4000-8000-000000000011';
const scope = { workspaceId: workspace, connectionId: '12' };
const proposal = {
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  installationId: '49000000-0000-4000-8000-000000000031',
  tokenHash: 'a'.repeat(64),
  nonce: '49000000-0000-4000-8000-000000000041',
};
const binding = {
  ...scope,
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  status: 'needs_login',
  generation: 1,
  expiresAt: '2026-10-17T06:00:00Z',
  canPublish: false,
};
const run = { ...scope, runId: '42', generation: 1, state: 'queued' };
describe('Kleinanzeigen-Kontoaktionen', () => {
  const api = { connect: vi.fn(), disconnect: vi.fn(), requestSync: vi.fn() };
  const bridge = {
    prepare: vi.fn(),
    connect: vi.fn(),
    status: vi.fn(),
    synchronize: vi.fn(),
    disconnect: vi.fn(),
    cancel: vi.fn(),
  };
  beforeEach(() => {
    for (const fn of [...Object.values(api), ...Object.values(bridge)]) fn.mockReset();
    api.connect.mockResolvedValue(binding);
    api.disconnect.mockResolvedValue(undefined);
    api.requestSync.mockResolvedValue(run);
    bridge.prepare.mockResolvedValue(proposal);
    bridge.connect.mockResolvedValue(binding);
    bridge.status.mockResolvedValue(binding);
    bridge.synchronize.mockResolvedValue({
      ...scope,
      runId: '42',
      generation: 1,
      state: 'confirmed',
      observedAt: '2026-10-16T06:00:00Z',
      itemCount: 17,
    });
    bridge.disconnect.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        KleinanzeigenAccountActionsService,
        { provide: KleinanzeigenAccountService, useValue: api },
        { provide: KleinanzeigenExtensionBridge, useValue: bridge },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('bindet erst nach lokaler Zustimmung und Serverfreigabe ohne automatische Schreibfreigabe', async () => {
    const actions = TestBed.inject(KleinanzeigenAccountActionsService);
    expect(await actions.connect(workspace)).toEqual(binding);
    expect(api.connect).toHaveBeenCalledWith(workspace, proposal, false);
    expect(bridge.connect).toHaveBeenCalledWith(proposal.nonce, binding);
  });
  it('startet für ein anderes Browserkonto keinen Serverauftrag', async () => {
    bridge.status.mockResolvedValue({ ...binding, connectionId: '13' });
    await expect(
      TestBed.inject(KleinanzeigenAccountActionsService).synchronize(scope),
    ).rejects.toThrow('Browserprofil');
    expect(api.requestSync).not.toHaveBeenCalled();
  });
  it('sendet einen Auftrag nur an die passende Freigabegeneration', async () => {
    api.requestSync.mockResolvedValue({ ...run, generation: 2 });
    await expect(
      TestBed.inject(KleinanzeigenAccountActionsService).synchronize(scope),
    ).rejects.toThrow('Freigabe');
    expect(bridge.synchronize).not.toHaveBeenCalled();
  });
  it('verwendet für die tatsächliche Synchronisierung genau den angeforderten Lauf', async () => {
    const result = await TestBed.inject(KleinanzeigenAccountActionsService).synchronize(scope);
    expect(result.itemCount).toBe(17);
    expect(bridge.synchronize).toHaveBeenCalledWith(run);
  });
  it('widerruft serverseitig vor dem Entfernen der lokalen Bindung', async () => {
    let revoked = false;
    api.disconnect.mockImplementation(async () => {
      revoked = true;
    });
    bridge.disconnect.mockImplementation(async () => {
      expect(revoked).toBe(true);
    });
    expect(await TestBed.inject(KleinanzeigenAccountActionsService).disconnect(scope)).toBe('done');
  });
  it('verändert beim Trennen eines anderen Kontos nicht das aktuelle Browserkonto', async () => {
    bridge.status.mockResolvedValue({ ...binding, connectionId: '13' });
    expect(await TestBed.inject(KleinanzeigenAccountActionsService).disconnect(scope)).toBe(
      'not_bound',
    );
    expect(bridge.disconnect).not.toHaveBeenCalled();
  });
  it('meldet einen bereits wirksamen Widerruf bei fehlender Erweiterung verständlich', async () => {
    bridge.status.mockRejectedValue(new Error('offline'));
    expect(await TestBed.inject(KleinanzeigenAccountActionsService).disconnect(scope)).toBe(
      'unavailable',
    );
    expect(api.disconnect).toHaveBeenCalledWith(scope);
  });
  it('legt nach einem Workspacewechsel während der Zustimmung keinen Serveraccount an', async () => {
    let resolve!: (value: unknown) => void;
    bridge.prepare.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const actions = TestBed.inject(KleinanzeigenAccountActionsService);
    const pending = actions.connect(workspace);
    actions.cancel();
    resolve(proposal);
    await expect(pending).rejects.toThrow('gewechselt');
    expect(api.connect).not.toHaveBeenCalled();
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { KleinanzeigenAccountService } from './kleinanzeigen-account.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import { KleinanzeigenRelistingService } from './kleinanzeigen-relisting.service';
import type { MarketplaceOverviewSection } from './marketplace-overview.store';

describe('Ausgewählte Kleinanzeigen neu inserieren', () => {
  const auth = { currentUser: signal<{ id: string } | null>({ id: 'owner' }) };
  const workspace = { currentWorkspace: signal({ id: 'workspace', archived_at: null }) };
  const accounts = { readAccounts: vi.fn(), requestSync: vi.fn() };
  const extension = {
    relistingAvailable: signal(true),
    relist: vi.fn(),
    relistingAttempts: vi.fn(),
    synchronize: vi.fn(),
  };
  const confirmation = { frage: vi.fn() };
  const reference = {
    platform: 'kleinanzeigen' as const,
    workspaceId: 'workspace',
    connectionId: '9',
    externalId: '11',
  };
  const section: MarketplaceOverviewSection = {
    account: {
      ...reference,
      displayName: 'Privat',
      status: 'connected',
      activeCount: 2,
      listingCount: 2,
      observedAt: null,
      completeness: 'complete',
      supportsSearch: true,
      supportsStatus: true,
      canEdit: true,
      error: null,
    },
    query: { state: 'all', search: '', limit: 25 },
    expanded: true,
    loading: false,
    error: null,
    history: [],
    page: null,
    selection: [reference, { ...reference, externalId: '12' }],
  };
  beforeEach(() => {
    vi.clearAllMocks();
    auth.currentUser.set({ id: 'owner' });
    workspace.currentWorkspace.set({ id: 'workspace', archived_at: null });
    accounts.readAccounts.mockResolvedValue({
      canManage: true,
      accounts: [
        {
          workspaceId: 'workspace',
          connectionId: '9',
          accountType: 'private',
          status: 'connected',
          localGrant: { active: true, canPublish: true, generation: 2 },
        },
      ],
    });
    accounts.requestSync.mockResolvedValue({ id: 'run' });
    confirmation.frage.mockResolvedValue(true);
    extension.relistingAvailable.set(true);
    extension.relistingAttempts.mockResolvedValue([]);
    extension.synchronize.mockResolvedValue(undefined);
    extension.relist.mockImplementation(async (_scope, externalId) => ({
      externalId,
      outcome: 'confirmed',
      newExternalId: '99',
    }));
    TestBed.configureTestingModule({
      providers: [
        KleinanzeigenRelistingService,
        { provide: AuthService, useValue: auth },
        { provide: WorkspaceService, useValue: workspace },
        { provide: KleinanzeigenAccountService, useValue: accounts },
        { provide: KleinanzeigenExtensionBridge, useValue: extension },
        { provide: ConfirmDialogService, useValue: confirmation },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('verarbeitet bestätigte Auswahl nacheinander und gleicht den Bestand erst danach ab', async () => {
    const service = TestBed.inject(KleinanzeigenRelistingService);
    expect(await service.run(section)).toBe(true);
    expect(extension.relist.mock.calls.map((call) => call[1])).toEqual(['11', '12']);
    expect(confirmation.frage).toHaveBeenCalledTimes(1);
    expect(service.results().map((value) => value.message)).toEqual([
      'Neu inseriert',
      'Neu inseriert',
    ]);
    expect(accounts.requestSync).toHaveBeenCalledTimes(1);
  });
  it('stoppt die Auswahl bei unklarem Ausgang ohne falschen Erfolg oder weiteren Auftrag', async () => {
    extension.relist.mockResolvedValue({ externalId: '11', outcome: 'outcome_unknown' });
    const service = TestBed.inject(KleinanzeigenRelistingService);
    expect(await service.run(section)).toBe(false);
    expect(extension.relist).toHaveBeenCalledTimes(1);
    expect(service.results()[0].message).toContain('kein zweites Inserat');
    expect(accounts.requestSync).not.toHaveBeenCalled();
  });
  it('löscht bei abgebrochener Bestätigung oder fremder Auswahl keine Anzeige', async () => {
    confirmation.frage.mockResolvedValue(false);
    const service = TestBed.inject(KleinanzeigenRelistingService);
    await service.run(section);
    confirmation.frage.mockResolvedValue(true);
    await service.run({ ...section, selection: [{ ...reference, connectionId: '10' }] });
    expect(extension.relist).not.toHaveBeenCalled();
  });
  it('startet nach Abmeldung während einer laufenden Anzeige keinen Folgeauftrag', async () => {
    extension.relist.mockImplementation(async () => {
      auth.currentUser.set(null);
      return { externalId: '11', outcome: 'confirmed', newExternalId: '99' };
    });
    const service = TestBed.inject(KleinanzeigenRelistingService);
    await service.run(section);
    expect(extension.relist).toHaveBeenCalledTimes(1);
    expect(service.results()).toEqual([]);
    expect(accounts.requestSync).not.toHaveBeenCalled();
  });
});

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { KleinanzeigenAccountService } from './kleinanzeigen-account.service';
const workspace = '49000000-0000-4000-8000-000000000011';
const proposal = {
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private' as const,
  installationId: '49000000-0000-4000-8000-000000000031',
  tokenHash: 'a'.repeat(64),
  nonce: '49000000-0000-4000-8000-000000000041',
};
const binding = {
  workspaceId: workspace,
  connectionId: '9007199254740993',
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  status: 'needs_login',
  generation: 1,
  expiresAt: '2026-10-17T06:00:00Z',
  canPublish: false,
};
describe('Kleinanzeigen-Kontodienst', () => {
  const invoke = vi.fn();
  beforeEach(() => {
    invoke.mockReset();
    TestBed.configureTestingModule({
      providers: [
        KleinanzeigenAccountService,
        { provide: SupabaseService, useValue: { client: { functions: { invoke } } } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('sendet nur die genehmigten öffentlichen Angaben und erteilt standardmäßig keine Schreibfreigabe', async () => {
    invoke.mockResolvedValue({ data: binding, error: null });
    expect(await TestBed.inject(KleinanzeigenAccountService).connect(workspace, proposal)).toEqual(
      binding,
    );
    expect(invoke).toHaveBeenCalledWith('kleinanzeigen-account', {
      body: {
        action: 'connect',
        workspaceId: workspace,
        externalAccountId: '123',
        displayName: 'Testkonto',
        accountType: 'private',
        installationId: proposal.installationId,
        tokenHash: proposal.tokenHash,
        canPublish: false,
      },
    });
  });
  it('fordert eine Schreibfreigabe ausschließlich nach ausdrücklicher Auswahl an', async () => {
    invoke.mockResolvedValue({ data: { ...binding, canPublish: true }, error: null });
    expect(
      (await TestBed.inject(KleinanzeigenAccountService).connect(workspace, proposal, true))
        .canPublish,
    ).toBe(true);
  });
  it('akzeptiert keine Antwort für ein anderes Konto oder andere Rechte', async () => {
    for (const change of [
      { externalAccountId: '124' },
      { canPublish: true },
      { workspaceId: '49000000-0000-4000-8000-000000000012' },
    ]) {
      invoke.mockResolvedValue({ data: { ...binding, ...change }, error: null });
      await expect(
        TestBed.inject(KleinanzeigenAccountService).connect(workspace, proposal),
      ).rejects.toThrow('Kontobindung');
    }
  });
  it('wandelt große Kennungen beim Trennen nicht in Zahlen um', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await TestBed.inject(KleinanzeigenAccountService).disconnect({
      workspaceId: workspace,
      connectionId: '9007199254740993',
      ...{ displayName: 'Testkonto', accountType: 'private' },
    });
    expect(invoke).toHaveBeenCalledWith('kleinanzeigen-account', {
      body: { action: 'disconnect', workspaceId: workspace, connectionId: '9007199254740993' },
    });
  });
  it('bestätigt einen fehlgeschlagenen oder unvollständigen Widerruf nicht', async () => {
    for (const reply of [
      { data: { ok: false }, error: null },
      { data: { ok: true, token: 'private' }, error: null },
      { data: null, error: new Error('private') },
    ]) {
      invoke.mockResolvedValue(reply);
      await expect(
        TestBed.inject(KleinanzeigenAccountService).disconnect({
          workspaceId: workspace,
          connectionId: '1',
        }),
      ).rejects.toThrow();
    }
  });
  it('lehnt ungültige Vorschläge vor dem Netzwerk ab', async () => {
    await expect(
      TestBed.inject(KleinanzeigenAccountService).connect(workspace, {
        ...proposal,
        tokenHash: 'bad',
      }),
    ).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('gibt interne Serverfehlermeldungen nicht weiter', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('private server detail') });
    await expect(
      TestBed.inject(KleinanzeigenAccountService).connect(workspace, proposal),
    ).rejects.toThrow('nicht bestätigt');
  });
  it('fordert den Abgleich für die unveränderte Zeichenkennung an und gibt keine Claim-Secrets frei', async () => {
    const scope = {
      workspaceId: workspace,
      connectionId: '9007199254740993',
      displayName: 'Testkonto',
    };
    const run = {
      workspaceId: workspace,
      connectionId: scope.connectionId,
      runId: '9007199254740995',
      generation: 1,
      state: 'queued',
    };
    invoke.mockResolvedValue({ data: run, error: null });
    expect(await TestBed.inject(KleinanzeigenAccountService).requestSync(scope)).toEqual(run);
    expect(invoke).toHaveBeenCalledWith('kleinanzeigen-account', {
      body: { action: 'request_sync', workspaceId: workspace, connectionId: scope.connectionId },
    });
    invoke.mockResolvedValue({ data: { ...run, claimToken: 'private' }, error: null });
    await expect(TestBed.inject(KleinanzeigenAccountService).requestSync(scope)).rejects.toThrow();
  });

  it('liest Kontoübersicht nur für den angefragten Workspace', async () => {
    const reply = { workspaceId: workspace, canManage: false, accounts: [] };
    invoke.mockResolvedValue({ data: reply, error: null });
    expect(await TestBed.inject(KleinanzeigenAccountService).readAccounts(workspace)).toEqual(
      reply,
    );
    expect(invoke).toHaveBeenCalledWith('kleinanzeigen-account', {
      body: { action: 'read_accounts', workspaceId: workspace },
    });
  });
  it('bindet Folgeseiten an Account, Suchauswahl und bestätigten Snapshot', async () => {
    const scope = { workspaceId: workspace, connectionId: '9007199254740993' };
    const reply = {
      ...scope,
      snapshotAt: '2026-10-16T06:00:00Z',
      items: [
        {
          publicationId: '9007199254740995',
          externalId: '101',
          title: 'Testanzeige',
          url: 'https://www.kleinanzeigen.de/s-anzeige/test/101-160-1',
          state: 'active',
          available: true,
          publishedAt: null,
          observedAt: '2026-10-16T06:00:00Z',
        },
      ],
      total: 2,
      nextId: '9007199254740995',
      completeness: 'complete',
    };
    invoke.mockResolvedValue({ data: reply, error: null });
    const service = TestBed.inject(KleinanzeigenAccountService);
    const query = { state: 'all' as const, search: '', limit: 1 };
    const page = await service.readPage(scope, query);
    expect(page.items[0].reference).toEqual({
      platform: 'kleinanzeigen',
      ...scope,
      externalId: '101',
    });
    expect(page.items[0].publishedAt).toBeNull();
    expect(page.items[0].priceCents).toBeNull();
    expect(page.items[0].externalUrl).toBe(reply.items[0].url);
    invoke.mockClear();
    await service.readPage(scope, { ...query, cursor: page.nextCursor! });
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      afterId: '9007199254740995',
      snapshotAt: reply.snapshotAt,
    });
    invoke.mockClear();
    await expect(
      service.readPage({ ...scope, connectionId: '2' }, { ...query, cursor: page.nextCursor! }),
    ).rejects.toThrow('Auswahl');
    expect(invoke).not.toHaveBeenCalled();
  });
});

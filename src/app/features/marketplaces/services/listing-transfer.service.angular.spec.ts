import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';
import { ListingTransferService } from './listing-transfer.service';
const source = {
  platform: 'vinted' as const,
  workspaceId: '50300000-0000-4000-8000-000000000011',
  connectionId: '50300000-0000-4000-8000-000000000021',
  externalId: '123',
};
const requestId = '50300000-0000-4000-8000-000000000041';
const target = '9007199254740993';
const full = {
  state: 'ready',
  workspaceId: source.workspaceId,
  targetConnectionId: target,
  connectionId: source.connectionId,
  entryId: '50300000-0000-4000-8000-000000000031',
  externalId: '123',
  externalAccountId: '99',
  executionMode: 'cloud',
  source: {
    externalAccountId: '99',
    externalId: '123',
    title: 'Jacke',
    description: 'Vollständiger Quelltext',
    priceCents: 1200,
    currency: 'EUR',
    photoReferences: ['https://images1.vinted.net/a.jpg'],
    attributeHints: { brand: 'Marke' },
  },
  observedAt: new Date().toISOString(),
  fingerprint: 'a'.repeat(64),
};
describe('Gemeinsamer Vinted-Transferdienst', () => {
  const invoke = vi.fn();
  const browser = { readListingContent: vi.fn() };
  const extension = {
    sourceDetailsAvailable: signal(true),
    request: vi.fn(),
    checkInstallation: vi.fn(),
    cancel: vi.fn(),
  };
  const auth = {
    currentUser: signal<{ id: string } | null>({ id: 'owner' }),
    session: signal({ access_token: 'user-jwt' }),
  };
  const workspace = {
    currentWorkspace: signal({ id: source.workspaceId, archived_at: null as string | null }),
  };
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue({ data: full, error: null });
    browser.readListingContent.mockReset().mockResolvedValue({});
    extension.sourceDetailsAvailable.set(true);
    extension.request.mockReset().mockResolvedValue({
      workspaceId: source.workspaceId,
      connectionId: source.connectionId,
      entryId: full.entryId,
      externalId: '123',
      fingerprint: full.fingerprint,
    });
    auth.currentUser.set({ id: 'owner' });
    workspace.currentWorkspace.set({ id: source.workspaceId, archived_at: null });
    TestBed.configureTestingModule({
      providers: [
        ListingTransferService,
        { provide: SupabaseService, useValue: { client: { functions: { invoke } } } },
        { provide: AuthService, useValue: auth },
        { provide: WorkspaceService, useValue: workspace },
        { provide: MarketplaceBrowserTestApiService, useValue: browser },
        { provide: VintedLocalExtensionBridge, useValue: extension },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('übernimmt geprüfte vollständige Cachequelle ohne neuen Browserabruf', async () => {
    const result = await TestBed.inject(ListingTransferService).prepare(source, target, requestId);
    expect(result.content.description).toBe(full.source.description);
    expect(result.sourceReference.fingerprint).toBe(full.fingerprint);
    expect(result.content.categoryId).toBeNull();
    expect(result.content.priceType).toBe('NEGOTIABLE');
    expect(result.content.shippingType).toBe('both');
    expect(browser.readListingContent).not.toHaveBeenCalled();
  });
  it.each(['cloud', 'local'])(
    'startet bei fehlenden gespeicherten Angaben keinen stillen %s-Anbieterabruf',
    async (mode) => {
      const {
        source: ignored,
        observedAt: ignoredDate,
        fingerprint: ignoredFingerprint,
        ...missing
      } = full;
      invoke.mockResolvedValue({
        data: { ...missing, state: 'needs_source', executionMode: mode },
        error: null,
      });
      await expect(
        TestBed.inject(ListingTransferService).prepare(source, target, requestId),
      ).rejects.toThrow('gespeicherten');
      expect(browser.readListingContent).not.toHaveBeenCalled();
      expect(extension.request).not.toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledTimes(1);
    },
  );
  it('verwirft verspätete Vorbereitung nach Abmeldung', async () => {
    let resolve!: (value: unknown) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = TestBed.inject(ListingTransferService).prepare(source, target, requestId);
    auth.currentUser.set(null);
    resolve({ data: full, error: null });
    await expect(pending).rejects.toThrow('gewechselt');
  });
  it('speichert nur die geprüfte Quelle für das gewählte Ziel und gibt vollständigen Bildstatus zurück', async () => {
    const service = TestBed.inject(ListingTransferService);
    const preview = await service.prepare(source, target, requestId);
    const content = { ...preview.content, priceCents: 1200 };
    const draft = {
      id: '50300000-0000-4000-8000-000000000051',
      workspaceId: source.workspaceId,
      targetConnectionId: target,
      sourceReference: preview.sourceReference,
      revision: 3,
      status: 'prepared',
      content,
      imagesComplete: true,
    };
    invoke.mockResolvedValue({ data: draft, error: null });
    expect(await service.save(preview, content, null)).toEqual(draft);
    expect(invoke.mock.calls.at(-1)?.[1].body).toMatchObject({
      action: 'save_transfer',
      workspaceId: source.workspaceId,
      targetConnectionId: target,
      source: preview.sourceReference,
      draftId: null,
      expectedRevision: null,
    });
  });
});

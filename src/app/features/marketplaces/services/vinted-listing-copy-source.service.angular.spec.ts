import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { emptyVintedListingContent } from '../models/vinted-listing-content';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { VintedListingDraftService } from './vinted-listing-draft.service';
import {
  VintedListingCopySourceService,
  type VintedListingCopySource,
} from './vinted-listing-copy-source.service';

afterEach(() => TestBed.resetTestingModule());
function setup() {
  const workspace = signal({ id: 'workspace-a', archived_at: null });
  const account = {
    connectionId: 'account-a',
    externalAccountId: '123',
    executionMode: 'cloud',
    status: 'connected',
  };
  const connections = signal([account]);
  const content = { ...emptyVintedListingContent(), title: 'Quelle' };
  const drafts = {
    list: vi.fn().mockResolvedValue({
      items: [{ id: '2', content, connectionId: null }],
      nextCursor: { id: '2', createdAt: '2026-10-20T10:00:00Z' },
    }),
    load: vi.fn().mockResolvedValue({ content }),
  };
  const api = {
    readOverviewPublications: vi.fn().mockResolvedValue({
      items: [
        {
          title: 'Quelle',
          reference: { externalId: '99' },
          detailLink: ['/marketplaces/vinted/listings', 'account-a', 'entry-a'],
        },
      ],
      nextCursor: 'next',
    }),
  };
  const browser = {
    readListingContent: vi.fn().mockResolvedValue({ externalId: '99', content }),
    readListingEdit: vi
      .fn()
      .mockResolvedValue({ title: 'Ohne Preis', description: 'Unvollstaendig', price: '' }),
  };
  TestBed.configureTestingModule({
    providers: [
      VintedListingCopySourceService,
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ id: 'user-a' }),
          session: signal({ access_token: 'test-token' }),
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceAccountStore, useValue: { canManage: signal(true), connections } },
      { provide: VintedListingDraftService, useValue: drafts },
      { provide: MarketplaceApiService, useValue: api },
      { provide: MarketplaceBrowserTestApiService, useValue: browser },
    ],
  });
  return {
    service: TestBed.inject(VintedListingCopySourceService),
    workspace,
    connections,
    drafts,
    api,
    browser,
    content,
  };
}
const source: VintedListingCopySource = {
  key: 'listing:account-a:99',
  id: 'entry-a',
  title: 'Quelle',
  kind: 'listing',
  connectionId: 'account-a',
  externalId: '99',
};
it('sucht und lädt lokale Entwürfe mit unverändertem Seitenzeiger', async () => {
  const f = setup();
  const page = await f.service.list('workspace-a', 'local', null, 'Jacke');
  expect(page.items[0].key).toBe('local:2');
  await f.service.list('workspace-a', 'local', null, 'Jacke', page.nextCursor!);
  expect(f.drafts.list).toHaveBeenLastCalledWith('workspace-a', 'Jacke', {
    id: '2',
    createdAt: '2026-10-20T10:00:00Z',
  });
  expect((await f.service.read('workspace-a', page.items[0])).content).toEqual(f.content);
});
it('liest Anbieterentwürfe ausdrücklich mit Entwurfsfilter und vollständiger Artikelbindung', async () => {
  const f = setup();
  const page = await f.service.list('workspace-a', 'provider_draft', 'account-a', 'Schal');
  expect(f.api.readOverviewPublications).toHaveBeenCalledWith(
    { workspaceId: 'workspace-a', connectionId: 'account-a' },
    { state: 'draft', search: 'Schal', limit: 25 },
  );
  await f.service.read('workspace-a', page.items[0]);
  expect(f.browser.readListingContent).toHaveBeenCalledWith(
    { workspaceId: 'workspace-a', connectionId: 'account-a' },
    'entry-a',
    '123',
    'test-token',
  );
});
it('verwirft eine falsche Artikelkennung statt ähnliche Daten zu übernehmen', async () => {
  const f = setup();
  f.browser.readListingContent.mockResolvedValueOnce({ externalId: '100', content: f.content });
  await expect(f.service.read('workspace-a', source)).rejects.toThrow(/Artikelzuordnung/);
});
it('sperrt fremde Workspaces und nicht mehr vorhandene Quellkonten vor dem Abruf', async () => {
  const f = setup();
  await expect(f.service.read('workspace-b', source)).rejects.toThrow(/Arbeitsbereich/);
  f.connections.set([]);
  await expect(f.service.read('workspace-a', source)).rejects.toThrow(/Verbinde/);
  expect(f.browser.readListingContent).not.toHaveBeenCalled();
});
it('verwirft eine laufende Antwort nach Workspacewechsel', async () => {
  const f = setup();
  let finish!: (value: unknown) => void;
  f.browser.readListingContent.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.service.read('workspace-a', source);
  f.workspace.set({ id: 'workspace-b', archived_at: null });
  finish({ externalId: '99', content: f.content });
  await expect(pending).rejects.toThrow(/Arbeitsbereich/);
});

it('verwirft die Antwort nach einem Kontowechsel unter gleicher Verbindungskennung', async () => {
  const f = setup();
  let finish!: (value: unknown) => void;
  f.browser.readListingContent.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.service.read('workspace-a', source);
  f.connections.update((accounts) =>
    accounts.map((account) => ({ ...account, externalAccountId: '456' })),
  );
  finish({ externalId: '99', content: f.content });
  await expect(pending).rejects.toThrow(/Konto der Quelle/);
});

it('liest bei einem unvollstaendigen Anbieterentwurf nur die bestaetigten Grundfelder', async () => {
  const f = setup();
  f.browser.readListingContent.mockRejectedValueOnce(new Error('Merkmale unvollstaendig'));
  const result = await f.service.read('workspace-a', { ...source, kind: 'provider_draft' });
  expect(result.fields).toEqual(['title', 'description', 'price']);
  expect(result.content).toMatchObject({ title: 'Ohne Preis', priceCents: null, categoryId: null });
});

it.each([
  ['20,50 €', 2050],
  ['1.234,56 €', 123456],
  ['19.99', 1999],
])('liest den formatierten Anbieterpreis %s im Grundfeld-Fallback', async (price, priceCents) => {
  const f = setup();
  f.browser.readListingContent.mockRejectedValueOnce(new Error('Merkmale unvollstaendig'));
  f.browser.readListingEdit.mockResolvedValueOnce({ title: 'Quelle', description: 'Text', price });
  const result = await f.service.read('workspace-a', { ...source, kind: 'provider_draft' });
  expect(result.content.priceCents).toBe(priceCents);
});

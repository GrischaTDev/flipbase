import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { vintedListingCopyRendering } from '../../../../../../e2e/support/vinted-listing-copy-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { emptyVintedListingContent } from '../../models/vinted-listing-content';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingCopySourceService } from '../../services/vinted-listing-copy-source.service';
import { VintedListingCopyDialogComponent } from './vinted-listing-copy-dialog.component';

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering(vintedListingCopyRendering);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
const source = { key: 'local:2', id: '2', title: 'Quelle', kind: 'local', connectionId: null };
const content = {
  ...emptyVintedListingContent(),
  title: 'Quelle',
  description: 'Text aus der Quelle',
  priceCents: 1800,
};
const readResult = { content, fields: ['title', 'description', 'price'] as const };
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  TestBed.tick();
}
function setup() {
  const workspace = signal({ id: 'workspace-a', archived_at: null });
  const connections = signal([
    {
      connectionId: 'account-a',
      displayName: 'Konto',
      externalAccountId: '123',
      executionMode: 'cloud',
      status: 'connected',
    },
  ]);
  const api = {
    list: vi.fn().mockResolvedValue({
      items: [source, { ...source, id: '1', key: 'local:1' }],
      nextCursor: null,
    }),
    read: vi.fn().mockResolvedValue(readResult),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: MarketplaceAccountStore,
        useValue: { canManage: signal(true), connections },
      },
      { provide: VintedListingCopySourceService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(VintedListingCopyDialogComponent);
  fixture.componentRef.setInput('workspaceId', 'workspace-a');
  fixture.componentRef.setInput('targetDraftId', '1');
  fixture.componentRef.setInput('content', {
    ...emptyVintedListingContent(),
    title: 'Mein Entwurf',
  });
  const applied = vi.fn();
  fixture.componentInstance.applied.subscribe(applied);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, workspace, connections, api, applied };
}
it('zeigt die vollständige Vorschau und überträgt ausschließlich gewählte Felder ohne Speichern', async () => {
  const f = setup();
  await settle();
  expect(f.component.options().map((option) => option.value)).toEqual(['local:2']);
  await f.component.select(source.key);
  f.fixture.detectChanges();
  expect(f.fixture.nativeElement.textContent).toContain('Text aus der Quelle');
  expect(f.component.canApply()).toBe(false);
  f.component.toggle('description', true);
  f.component.apply();
  expect(f.applied).toHaveBeenCalledWith({
    content: expect.objectContaining({
      title: 'Mein Entwurf',
      description: 'Text aus der Quelle',
      priceCents: null,
    }),
    fields: ['description'],
  });
});
it('verwirft verspätete Quelldaten nach Quellenwechsel', async () => {
  const f = setup();
  await settle();
  let finish!: (value: typeof readResult) => void;
  f.api.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.component.select(source.key);
  await f.component.select(null);
  finish(readResult);
  await pending;
  expect(f.component.sourceContent()).toBeNull();
  expect(f.component.canApply()).toBe(false);
});
it('sperrt eine bereits gelesene Vorschau sofort bei Workspacewechsel', async () => {
  const f = setup();
  await settle();
  await f.component.select(source.key);
  f.component.toggle('title', true);
  f.workspace.set({ id: 'workspace-b', archived_at: null });
  f.component.apply();
  expect(f.applied).not.toHaveBeenCalled();
  expect(f.component.canApply()).toBe(false);
  await settle();
  expect(f.component.options()).toEqual([]);
});
it('behält eine fehlgeschlagene Quelle unverändert und bietet Nachladen an', async () => {
  const f = setup();
  await settle();
  f.api.read.mockRejectedValueOnce(new Error('Konto beschäftigt'));
  await f.component.select(source.key);
  expect(f.component.error()).toBe('Konto beschäftigt');
  expect(f.component.canApply()).toBe(false);
  await f.component.select(source.key);
  expect(f.component.sourceContent()).toEqual(content);
});

it('sperrt eine fertige Vorschau nach neuer Anbieteridentitaet unter gleicher Kontokennung', async () => {
  const f = setup();
  await settle();
  const provider = {
    ...source,
    key: 'listing:account-a:99',
    kind: 'listing',
    connectionId: 'account-a',
    externalId: '99',
  };
  f.api.list.mockResolvedValueOnce({ items: [provider], nextCursor: null });
  f.component.setKind('listing');
  await settle();
  await f.component.select(provider.key);
  f.component.toggle('title', true);
  expect(f.component.canApply()).toBe(true);
  f.connections.update((accounts) =>
    accounts.map((account) => ({ ...account, externalAccountId: '456' })),
  );
  expect(f.component.canApply()).toBe(false);
  f.component.apply();
  expect(f.applied).not.toHaveBeenCalled();
});

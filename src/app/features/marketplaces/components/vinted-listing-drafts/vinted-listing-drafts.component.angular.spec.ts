import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingDraftService } from '../../services/vinted-listing-draft.service';
import { VintedListingImageService } from '../../services/vinted-listing-image.service';
import { VintedAccountViewService } from '../../services/vinted-account-view.service';
import { emptyVintedListingContent } from '../../models/vinted-listing-content';
import type { VintedListingDraft } from '../../models/vinted-listing-draft';
import type { VintedListingJob } from '../../models/vinted-listing-job';
import { VintedListingDraftsComponent } from './vinted-listing-drafts.component';
const row: VintedListingDraft = {
  id: '1',
  workspaceId: 'workspace-a',
  content: { ...emptyVintedListingContent(), title: 'Meine Jacke' },
  connectionId: null,
  revision: 2,
  images: [],
  inventoryItemId: null,
  createdAt: '2026-10-21T12:00:00Z',
  updatedAt: '2026-10-22T12:00:00Z',
};
const olderRow: VintedListingDraft = {
  ...row,
  id: '2',
  content: { ...row.content, title: 'Älterer Entwurf' },
  createdAt: '2026-10-20T12:00:00Z',
};
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  TestBed.tick();
}
function setup() {
  const workspace = signal({ id: 'workspace-a', archived_at: null });
  const account = signal<{ connectionId: string } | null>(null);
  const showAllAccounts = signal(false);
  const list = vi.fn().mockResolvedValue({ items: [row], nextCursor: null });
  const remove = vi.fn().mockResolvedValue(undefined);
  const frage = vi.fn().mockResolvedValue(true);
  const thumbnailUrls = vi.fn().mockResolvedValue(new Map());
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          canManage: signal(true),
          connections: signal([]),
          selectedConnection: account,
        },
      },
      { provide: VintedAccountViewService, useValue: { showAllAccounts } },
      { provide: VintedListingDraftService, useValue: { list, remove } },
      { provide: VintedListingImageService, useValue: { thumbnailUrls } },
      { provide: ConfirmDialogService, useValue: { frage } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new VintedListingDraftsComponent());
  return { component, workspace, list, remove, frage, thumbnailUrls, account, showAllAccounts };
}
afterEach(() => {
  vi.useRealTimers();
  TestBed.resetTestingModule();
});
const publication = (state: VintedListingJob['state']) =>
  ({
    id: '9',
    workspaceId: 'workspace-a',
    draftId: row.id,
    connectionId: 'account-a',
    draftRevision: row.revision,
    action: 'publish',
    state,
    executionMode: 'cloud',
    externalAccountId: '123',
    version: 1,
    scheduledAt: null,
    timeZone: null,
    errorCode: state === 'failed' ? 'provider_unavailable' : null,
    externalId: null,
    providerState: null,
    relistExternalId: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }) as unknown as VintedListingJob;
describe('Vinted-Entwurfsübersicht', () => {
  it('wechselt von kontogebundenen Entwürfen zur gemeinsamen Liste', async () => {
    const { account, showAllAccounts, component, list } = setup();
    account.set({ connectionId: 'account-a' });
    const first = { ...row, connectionId: 'account-a' };
    const second = { ...olderRow, connectionId: 'account-b' };
    list.mockResolvedValueOnce({ items: [first], nextCursor: null });
    await settle();
    expect(component.drafts()).toEqual([first]);
    expect(list).toHaveBeenLastCalledWith('workspace-a', '', undefined, 'account-a');

    list.mockResolvedValueOnce({ items: [first, second], nextCursor: null });
    showAllAccounts.set(true);
    await settle();
    expect(component.drafts()).toEqual([first, second]);
    expect(list).toHaveBeenLastCalledWith('workspace-a', '', undefined, undefined);
  });
  it('zeigt eine laufende Veröffentlichung und entfernt den Entwurf erst nach der Bestätigung', async () => {
    vi.useFakeTimers();
    const { component, list } = setup();
    const publishing = { ...row, publication: publication('claimed') };
    list.mockResolvedValueOnce({ items: [publishing, olderRow], nextCursor: null });
    await settle();
    expect(component.publicationStatus(publishing)).toEqual({
      label: 'Wird vorbereitet',
      tone: 'info',
      busy: true,
    });
    list.mockResolvedValueOnce({ items: [publishing, olderRow], nextCursor: null });
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(component.drafts().map((draft) => draft.id)).toEqual(['1', '2']);
    list.mockResolvedValueOnce({ items: [olderRow], nextCursor: null });
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(component.drafts().map((draft) => draft.id)).toEqual(['2']);
    expect(component.announcement()).toBe('Ein Entwurf wurde veröffentlicht.');
    const calls = list.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15000);
    expect(list).toHaveBeenCalledTimes(calls);
  });
  it('lässt einen fehlgeschlagenen Entwurf stehen und fragt nicht weiter nach', async () => {
    vi.useFakeTimers();
    const { component, list } = setup();
    const failed = { ...row, publication: publication('failed') };
    list.mockResolvedValueOnce({ items: [failed], nextCursor: null });
    await settle();
    expect(component.publicationStatus(failed)).toEqual({
      label: 'Vorbereitung bei Vinted fehlgeschlagen',
      tone: 'critical',
      busy: false,
    });
    await vi.advanceTimersByTimeAsync(15000);
    expect(list).toHaveBeenCalledTimes(1);
    expect(component.drafts()).toEqual([failed]);
  });
  it('loads workspace drafts without a selected account', async () => {
    const { component, list } = setup();
    await settle();
    expect(component.drafts()).toEqual([row]);
    expect(list).toHaveBeenCalledWith('workspace-a', '', undefined, undefined);
  });
  it('rejects a page arriving after changing the workspace', async () => {
    const { component, workspace, list } = setup();
    let complete!: (value: unknown) => void;
    list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await settle();
    workspace.set({ id: 'workspace-b', archived_at: null });
    list.mockResolvedValueOnce({ items: [], nextCursor: null });
    await settle();
    complete({ items: [row], nextCursor: null });
    await settle();
    expect(component.drafts()).toEqual([]);
  });
  it('keeps server creation order when appending a page and switching views', async () => {
    const { component, list } = setup();
    const cursor = { id: row.id, createdAt: row.createdAt };
    list.mockResolvedValueOnce({ items: [row], nextCursor: cursor });
    await settle();
    list.mockResolvedValueOnce({ items: [olderRow], nextCursor: null });
    await component.loadMore();
    component.viewMode.set('list');
    expect(component.drafts()).toEqual([row, olderRow]);
    expect(list).toHaveBeenLastCalledWith('workspace-a', '', cursor, undefined);
    component.viewMode.set('grid');
    expect(component.drafts()).toEqual([row, olderRow]);
  });
  it('keeps drafts usable when preview images cannot be loaded', async () => {
    const { component, thumbnailUrls } = setup();
    thumbnailUrls.mockRejectedValueOnce(new Error('Storage unavailable'));
    await settle();
    expect(component.drafts()).toEqual([row]);
    expect(component.error()).toBeNull();
    expect(component.thumbnails().size).toBe(0);
  });
  it('discards preview images arriving after a workspace change', async () => {
    const { component, workspace, thumbnailUrls, list } = setup();
    let complete!: (value: Map<string, string>) => void;
    thumbnailUrls.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)));
    await settle();
    list.mockResolvedValueOnce({ items: [], nextCursor: null });
    workspace.set({ id: 'workspace-b', archived_at: null });
    await settle();
    complete(new Map([[row.id, 'https://example.test/private-image']]));
    await settle();
    expect(component.thumbnails().size).toBe(0);
  });
  it('leaves a draft untouched when deletion is cancelled', async () => {
    const { component, remove, frage } = setup();
    frage.mockResolvedValueOnce(false);
    await settle();
    await component.deleteDraft(row);
    expect(remove).not.toHaveBeenCalled();
    expect(component.drafts()).toEqual([row]);
    expect(component.deletingId()).toBeNull();
  });
  it('removes only the confirmed draft and its preview', async () => {
    const { component, list, remove, thumbnailUrls } = setup();
    list.mockResolvedValueOnce({ items: [row, olderRow], nextCursor: null });
    thumbnailUrls.mockResolvedValueOnce(new Map([[row.id, 'https://example.test/image']]));
    await settle();
    await component.deleteDraft(row);
    expect(remove).toHaveBeenCalledExactlyOnceWith(row);
    expect(component.drafts()).toEqual([olderRow]);
    expect(component.thumbnails().has(row.id)).toBe(false);
    expect(component.announcement()).toBe('Entwurf gelöscht.');
  });
  it('keeps the list and exposes an action error when deletion fails', async () => {
    const { component, remove } = setup();
    remove.mockRejectedValueOnce(new Error('Der Entwurf wurde inzwischen geändert.'));
    await settle();
    await component.deleteDraft(row);
    expect(component.drafts()).toEqual([row]);
    expect(component.error()).toBeNull();
    expect(component.actionError()).toBe('Der Entwurf wurde inzwischen geändert.');
    expect(component.deletingId()).toBeNull();
    expect(component.announcement()).toBe('');
  });
  it('loads the next page after deleting the last visible draft', async () => {
    const { component, list } = setup();
    const cursor = { id: row.id, createdAt: row.createdAt };
    list.mockResolvedValueOnce({ items: [row], nextCursor: cursor });
    await settle();
    list.mockResolvedValueOnce({ items: [olderRow], nextCursor: null });
    await component.deleteDraft(row);
    expect(component.drafts()).toEqual([olderRow]);
    expect(component.nextCursor()).toBeNull();
    expect(list).toHaveBeenLastCalledWith('workspace-a', '', cursor, undefined);
  });
  it('does not delete after switching workspaces while confirming', async () => {
    const { component, workspace, list, frage, remove } = setup();
    let confirm!: (value: boolean) => void;
    frage.mockImplementationOnce(() => new Promise((resolve) => (confirm = resolve)));
    await settle();
    const deletion = component.deleteDraft(row);
    list.mockResolvedValueOnce({ items: [], nextCursor: null });
    workspace.set({ id: 'workspace-b', archived_at: null });
    await settle();
    confirm(true);
    await deletion;
    expect(remove).not.toHaveBeenCalled();
    expect(component.deletingId()).toBeNull();
  });
  it('ignores a completed deletion in a previous workspace', async () => {
    const { component, workspace, list, remove } = setup();
    let complete!: () => void;
    remove.mockImplementationOnce(() => new Promise<void>((resolve) => (complete = resolve)));
    await settle();
    const deletion = component.deleteDraft(row);
    await settle();
    const otherRow = { ...olderRow, workspaceId: 'workspace-b' };
    list.mockResolvedValueOnce({ items: [otherRow], nextCursor: null });
    workspace.set({ id: 'workspace-b', archived_at: null });
    await settle();
    complete();
    await deletion;
    expect(component.drafts()).toEqual([otherRow]);
    expect(component.announcement()).toBe('');
  });
  it('prevents duplicate deletion while a request is pending', async () => {
    const { component, remove, frage } = setup();
    let complete!: () => void;
    remove.mockImplementationOnce(() => new Promise<void>((resolve) => (complete = resolve)));
    await settle();
    const deletion = component.deleteDraft(row);
    await settle();
    await component.deleteDraft(row);
    expect(frage).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    complete();
    await deletion;
  });
  for (const searchFinishesFirst of [true, false]) {
    it(`keeps a deleted draft out of changed search results arriving ${searchFinishesFirst ? 'before' : 'after'} deletion`, async () => {
      vi.useFakeTimers();
      const { component, list, remove } = setup();
      let completeDelete!: () => void;
      let completeSearch!: (value: unknown) => void;
      remove.mockImplementationOnce(
        () => new Promise<void>((resolve) => (completeDelete = resolve)),
      );
      await settle();
      const deletion = component.deleteDraft(row);
      await settle();
      list.mockImplementationOnce(() => new Promise((resolve) => (completeSearch = resolve)));
      component.setSearch('Jacke');
      await vi.advanceTimersByTimeAsync(250);
      await settle();
      expect(list).toHaveBeenLastCalledWith('workspace-a', 'Jacke', undefined, undefined);
      if (searchFinishesFirst) {
        completeSearch({ items: [row], nextCursor: null });
        await settle();
      }
      completeDelete();
      await deletion;
      if (!searchFinishesFirst) completeSearch({ items: [row], nextCursor: null });
      await settle();
      expect(component.drafts()).toEqual([]);
      expect(component.deletingId()).toBeNull();
      expect(remove).toHaveBeenCalledExactlyOnceWith(row);
    });
  }
  it('does not reintroduce a deleted draft from an in-flight page or image response', async () => {
    const { component, list, thumbnailUrls } = setup();
    let completePage!: (value: unknown) => void;
    let completeImages!: (value: Map<string, string>) => void;
    list.mockResolvedValueOnce({
      items: [row],
      nextCursor: { id: row.id, createdAt: row.createdAt },
    });
    thumbnailUrls.mockImplementationOnce(
      () => new Promise((resolve) => (completeImages = resolve)),
    );
    await settle();
    list.mockImplementationOnce(() => new Promise((resolve) => (completePage = resolve)));
    const more = component.loadMore();
    await component.deleteDraft(row);
    completeImages(new Map([[row.id, 'https://example.test/old-image']]));
    completePage({ items: [row, olderRow], nextCursor: null });
    await more;
    await settle();
    expect(component.drafts()).toEqual([olderRow]);
    expect(component.thumbnails().has(row.id)).toBe(false);
  });
});

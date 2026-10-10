import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingDraftService } from '../../services/vinted-listing-draft.service';
import { VintedListingDraftsComponent } from './vinted-listing-drafts.component';
const row = {
  id: '1',
  workspaceId: 'workspace-a',
  content: { title: 'Meine Jacke' },
  connectionId: null,
};
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  TestBed.tick();
}
function setup() {
  const workspace = signal({ id: 'workspace-a', archived_at: null });
  const list = vi.fn().mockResolvedValue({ items: [row], nextCursor: null });
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: MarketplaceAccountStore,
        useValue: { canManage: signal(true), connections: signal([]) },
      },
      { provide: VintedListingDraftService, useValue: { list } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new VintedListingDraftsComponent());
  return { component, workspace, list };
}
afterEach(() => TestBed.resetTestingModule());
describe('Vinted-Entwurfsübersicht', () => {
  it('loads workspace drafts without a selected account', async () => {
    const { component, list } = setup();
    await settle();
    expect(component.drafts()).toEqual([row]);
    expect(list).toHaveBeenCalledWith('workspace-a', '');
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
});

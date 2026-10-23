import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceApiService } from '../../services/marketplace-api.service';
import { VintedProviderDraftsComponent } from './vinted-provider-drafts.component';

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedProviderDraftsComponent,
      path: 'src/app/features/marketplaces/components/vinted-provider-drafts/vinted-provider-drafts.component.ts',
    },
    ...[
      ['badge', BadgeComponent],
      ['card', CardComponent],
      ['custom-select', CustomSelectComponent],
      ['notice-banner', NoticeBannerComponent],
      ['product-thumbnail', ProductThumbnailComponent],
    ].map(([name, type]) => ({
      type,
      path: `src/app/shared/components/${name}/${name}.component.ts`,
    })),
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
const draft = {
  reference: {
    platform: 'vinted',
    workspaceId: 'workspace-a',
    connectionId: 'account-a',
    externalId: '99',
  },
  title: 'Nativer Entwurf',
  priceCents: null,
  currency: 'EUR',
  imageUrl: null,
  publishedAt: null,
  state: 'draft',
  actions: ['view'],
  detailLink: ['/marketplaces/vinted/listings', 'account-a', 'entry-a'],
  externalUrl: null,
  editLink: null,
};
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  TestBed.tick();
}
function setup() {
  const workspace = signal({ id: 'workspace-a', archived_at: null });
  const read = vi.fn().mockResolvedValue({ items: [draft], nextCursor: 'next', total: 2 });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          canManage: signal(true),
          connections: signal([{ connectionId: 'account-a', displayName: 'Mein Konto' }]),
          selectedConnection: signal(null),
        },
      },
      { provide: MarketplaceApiService, useValue: { readOverviewPublications: read } },
    ],
  });
  const fixture = TestBed.createComponent(VintedProviderDraftsComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, workspace, read };
}
it('liest ausschließlich native Entwürfe paginiert und zeigt Herkunft statt Alter', async () => {
  const f = setup();
  await settle();
  f.fixture.detectChanges();
  expect(f.read).toHaveBeenCalledWith(
    { workspaceId: 'workspace-a', connectionId: 'account-a' },
    { state: 'draft', search: '', limit: 25 },
  );
  const element = f.fixture.nativeElement as HTMLElement;
  expect(element.querySelector('app-badge')?.textContent).toContain('Vinted-Entwurf');
  expect(element.textContent).not.toContain('Alter unbekannt');
  expect(element.querySelector('a')?.getAttribute('href')).toContain('/account-a/entry-a');
  f.read.mockResolvedValueOnce({
    items: [{ ...draft, title: 'Zweiter', reference: { ...draft.reference, externalId: '100' } }],
    nextCursor: null,
  });
  await f.component.load(true);
  expect(f.component.items()).toHaveLength(2);
  expect(f.read).toHaveBeenLastCalledWith(expect.anything(), {
    state: 'draft',
    search: '',
    limit: 25,
    cursor: 'next',
  });
});
it('verwirft eine verspätete Entwurfsseite nach Workspacewechsel', async () => {
  const f = setup();
  await settle();
  let finish!: (value: unknown) => void;
  f.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.component.load(true);
  f.read.mockResolvedValueOnce({ items: [], nextCursor: null });
  f.workspace.set({ id: 'workspace-b', archived_at: null });
  expect(f.component.items()).toEqual([]);
  await settle();
  finish({ items: [draft], nextCursor: null });
  await pending;
  expect(f.component.items().every((row) => row.reference.workspaceId === 'workspace-b')).toBe(
    true,
  );
});

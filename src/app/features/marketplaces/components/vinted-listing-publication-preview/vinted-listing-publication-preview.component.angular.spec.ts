import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { VintedListingScheduleDialogComponent } from '../vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component';
import { listingCategoryFixture } from '../../../../../../e2e/support/vinted-listing-category-fixture';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { VintedBrandSearchService } from '../../../platform-admin/services/vinted-brand-search.service';
import { emptyVintedListingContent } from '../../models/vinted-listing-content';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceBrowserTestApiService } from '../../services/marketplace-browser-test-api.service';
import { VintedListingCategoryService } from '../../services/vinted-listing-category.service';
import { VintedListingJobService } from '../../services/vinted-listing-job.service';
import { VintedListingPublicationPreviewComponent } from './vinted-listing-publication-preview.component';

const workspaceId = '46600000-0000-4000-8000-000000000001',
  connectionId = '46600000-0000-4000-8000-000000000002';
const account = {
  workspaceId,
  connectionId,
  marketplace: 'vinted',
  displayName: 'Mein Konto',
  externalAccountId: '123',
  executionMode: 'cloud',
  status: 'connected',
  capabilities: {},
  allowedActions: [],
  lastSyncedAt: null,
};
const draft = {
  id: '1',
  workspaceId,
  connectionId,
  revision: 1,
  content: {
    ...emptyVintedListingContent(),
    categoryId: 1223,
    categoryLabel: 'Bomberjacken',
    title: 'Meine Jacke',
    description: 'Tragespuren',
    priceCents: 2050,
    brandId: 254956,
    brandLabel: 'Jako',
    sizeId: 208,
    sizeLabel: 'M',
    conditionId: 2,
    conditionLabel: 'Sehr gut',
    packageSizeId: 2,
  },
  images: [
    {
      id: '2',
      storagePath: `${workspaceId}/1/2.jpg`,
      fileName: 'jacke.jpg',
      mimeType: 'image/jpeg',
      byteSize: 123,
    },
  ],
  inventoryItemId: null,
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
};
const fields = () => ({
  ...listingCategoryFixture(),
  fields: [
    ...listingCategoryFixture().fields,
    {
      field: 'brand',
      sizeGroupId: null,
      choices: [
        { id: null, label: 'Keine Marke', selected: false, disabled: false, sizeGroupId: null },
      ],
    },
  ],
});
let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedListingPublicationPreviewComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-publication-preview/vinted-listing-publication-preview.component.ts',
    },
    {
      type: VintedListingScheduleDialogComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component.ts',
    },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
    },
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: CustomCheckboxComponent,
      path: 'src/app/shared/components/custom-checkbox/custom-checkbox.component.ts',
    },
    {
      type: CustomSelectComponent,
      path: 'src/app/shared/components/custom-select/custom-select.component.ts',
    },
    {
      type: DatePickerComponent,
      path: 'src/app/shared/components/date-picker/date-picker.component.ts',
    },
    {
      type: TextFieldComponent,
      path: 'src/app/shared/components/text-field/text-field.component.ts',
    },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
function setup(allowed = false) {
  const workspace = signal<{ id: string; archived_at: string | null }>({
      id: workspaceId,
      archived_at: null,
    }),
    user = signal({ id: 'user-a' }),
    connections = signal([account]);
  const api = {
    readPermission: vi
      .fn()
      .mockResolvedValue({ allowed, authorizationVersion: 1, executionMode: 'cloud' }),
    list: vi.fn().mockResolvedValue([]),
    approve: vi
      .fn()
      .mockResolvedValue({ allowed: true, authorizationVersion: 2, executionMode: 'cloud' }),
    revoke: vi
      .fn()
      .mockResolvedValue({ allowed: false, authorizationVersion: 3, executionMode: 'cloud' }),
    enqueue: vi.fn().mockResolvedValue({
      id: '10',
      workspaceId,
      draftId: '1',
      action: 'publish',
      state: 'queued',
      connectionId,
      draftRevision: 1,
      executionMode: 'cloud',
      externalAccountId: '123',
    }),
  };
  const read = vi.fn().mockResolvedValue(fields()),
    search = vi.fn().mockResolvedValue([{ id: 254956, name: 'Jako' }]),
    available = vi
      .fn()
      .mockResolvedValue({ available: true, readOnly: false, listingPublishingEnabled: true });
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceAccountStore, useValue: { canManage: signal(true), connections } },
      { provide: VintedListingJobService, useValue: api },
      { provide: VintedListingCategoryService, useValue: { read } },
      { provide: VintedBrandSearchService, useValue: { search } },
      { provide: MarketplaceBrowserTestApiService, useValue: { available } },
    ],
  });
  const fixture = TestBed.createComponent(VintedListingPublicationPreviewComponent);
  fixture.componentRef.setInput('scopeKey', 'user-a/workspace/draft/account/revision-1');
  fixture.componentRef.setInput('userId', 'user-a');
  fixture.componentRef.setInput('draft', draft);
  fixture.componentRef.setInput('account', account);
  const accepted = vi.fn(),
    closed = vi.fn();
  fixture.componentInstance.accepted.subscribe(accepted);
  fixture.componentInstance.closed.subscribe(closed);
  return {
    fixture,
    component: fixture.componentInstance,
    api,
    read,
    search,
    available,
    workspace,
    user,
    connections,
    accepted,
    closed,
  };
}
async function settle(_f: ReturnType<typeof setup>) {
  // Diese fachlichen Tests benötigen keine gerenderte Shared-Oberfläche; E2E prüft das echte Template.
  TestBed.tick();
  for (let index = 0; index < 20; index++) await Promise.resolve();
  TestBed.tick();
}
afterEach(() => TestBed.resetTestingModule());
describe('Vinted publication preview', () => {
  it('ignores a category response after closing the preview', async () => {
    const f = setup();
    let resolve!: (value: ReturnType<typeof fields>) => void;
    f.read.mockImplementationOnce(
      () =>
        new Promise((complete) => {
          resolve = complete;
        }),
    );
    await settle(f);
    expect(f.component.loading()).toBe(true);
    f.component.close();
    resolve(fields());
    await settle(f);
    expect(f.component.schema()).toBeNull();
    expect(f.closed).toHaveBeenCalledTimes(1);
    f.fixture.destroy();
  });
  it('rejects an accepted response from another external account', async () => {
    const f = setup(true);
    await settle(f);
    f.api.enqueue.mockResolvedValueOnce({
      id: '10',
      workspaceId,
      draftId: '1',
      action: 'publish',
      state: 'queued',
      connectionId,
      draftRevision: 1,
      executionMode: 'cloud',
      externalAccountId: '456',
    });
    await f.component.submit();
    expect(f.accepted).not.toHaveBeenCalled();
    expect(f.component.error()).toContain('Zielkonto');
    f.fixture.destroy();
  });
  it('loads current category, brand, permission, runtime and jobs without writing', async () => {
    const f = setup();
    await settle(f);
    expect(f.read).toHaveBeenCalledWith(connectionId, 1223);
    expect(f.search).toHaveBeenCalledWith('Jako', workspaceId);
    expect(f.component.review()?.ready).toBe(true);
    expect(f.component.canSubmit()).toBe(false);
    expect(f.api.approve).not.toHaveBeenCalled();
    expect(f.api.enqueue).not.toHaveBeenCalled();
    f.fixture.destroy();
  });
  it('approves only after explicit consent and enqueues the exact saved revision and chosen schedule', async () => {
    const f = setup();
    await settle(f);
    f.component.selectSchedule({
      scheduledAt: '2099-10-25T01:30:00.000Z',
      timeZone: 'Europe/Berlin',
      latePolicy: 'pause_after_30_minutes',
    });
    f.component.aiPhoto.set(true);
    f.component.consent.set(true);
    await f.component.submit();
    expect(f.api.approve).toHaveBeenCalledWith(workspaceId, connectionId, '123');
    expect(f.api.enqueue).toHaveBeenCalledWith(
      draft,
      expect.objectContaining({
        requestId: expect.any(String),
        action: 'publish',
        aiPhoto: true,
        schedule: {
          scheduledAt: '2099-10-25T01:30:00.000Z',
          timeZone: 'Europe/Berlin',
          latePolicy: 'pause_after_30_minutes',
        },
      }),
    );
    expect(f.accepted).toHaveBeenCalledTimes(1);
    f.fixture.destroy();
  });
  it('retains one intent for an uncertain response and rejects duplicate clicks', async () => {
    const f = setup(true);
    await settle(f);
    let reject!: (error: Error) => void;
    f.api.enqueue.mockImplementationOnce(
      () =>
        new Promise((_resolve, failed) => {
          reject = failed;
        }),
    );
    const sending = f.component.submit();
    await f.component.submit();
    expect(f.api.enqueue).toHaveBeenCalledTimes(1);
    reject(new Error('Antwort verloren'));
    await sending;
    expect(f.component.intentLocked()).toBe(true);
    f.component.selectSchedule({
      scheduledAt: '2099-10-25T01:30:00.000Z',
      timeZone: 'Europe/Berlin',
      latePolicy: 'pause_after_30_minutes',
    });
    await f.component.submit();
    expect(f.api.enqueue.mock.calls[1][1]).toEqual(f.api.enqueue.mock.calls[0][1]);
    f.fixture.destroy();
  });
  it.each(['workspace', 'user', 'account'])(
    'does not enqueue after changing %s during approval',
    async (change) => {
      const f = setup();
      await settle(f);
      f.component.consent.set(true);
      let resolve!: (value: {
        allowed: boolean;
        authorizationVersion: number;
        executionMode: string;
      }) => void;
      f.api.approve.mockImplementationOnce(
        () =>
          new Promise((complete) => {
            resolve = complete;
          }),
      );
      const sending = f.component.submit();
      if (change === 'workspace') f.workspace.set({ id: 'other', archived_at: null });
      if (change === 'user') f.user.set({ id: 'user-b' });
      if (change === 'account') f.connections.set([{ ...account, externalAccountId: '456' }]);
      resolve({ allowed: true, authorizationVersion: 2, executionMode: 'cloud' });
      await sending;
      expect(f.api.enqueue).not.toHaveBeenCalled();
      expect(f.accepted).not.toHaveBeenCalled();
      f.fixture.destroy();
    },
  );
  it('blocks a disabled runtime and an existing confirmed or uncertain job', async () => {
    const f = setup(true);
    f.available.mockResolvedValueOnce({
      available: true,
      readOnly: false,
      listingPublishingEnabled: false,
    });
    await settle(f);
    await f.component.submit();
    expect(f.api.enqueue).not.toHaveBeenCalled();
    f.api.list.mockResolvedValueOnce([{ state: 'outcome_unknown' }]);
    await f.component.load();
    expect(f.component.blockedJob()).toBeTruthy();
    await f.component.submit();
    expect(f.api.enqueue).not.toHaveBeenCalled();
    f.fixture.destroy();
  });
  it('blocks incomplete fields, stale revision and a revoked account before approval', async () => {
    const f = setup();
    f.fixture.componentRef.setInput('draft', {
      ...draft,
      content: { ...draft.content, description: '' },
    });
    await settle(f);
    f.component.consent.set(true);
    expect(f.component.review()?.ready).toBe(false);
    await f.component.submit();
    expect(f.api.approve).not.toHaveBeenCalled();
    f.fixture.componentRef.setInput('draft', { ...draft, revision: 2 });
    await f.component.submit();
    expect(f.api.approve).not.toHaveBeenCalled();
    f.fixture.destroy();
  });
  it('revokes the displayed permission version and rejects submission after close', async () => {
    const f = setup(true);
    await settle(f);
    await f.component.revoke();
    expect(f.api.revoke).toHaveBeenCalledWith(workspaceId, connectionId, 1);
    expect(f.component.permission()?.allowed).toBe(false);
    f.component.close();
    await f.component.submit();
    expect(f.api.enqueue).not.toHaveBeenCalled();
    expect(f.closed).toHaveBeenCalledTimes(1);
    f.fixture.destroy();
  });
});

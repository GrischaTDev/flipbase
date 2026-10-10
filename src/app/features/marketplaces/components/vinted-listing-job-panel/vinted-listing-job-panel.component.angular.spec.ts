import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingJobService } from '../../services/vinted-listing-job.service';
import type { VintedListingJob } from '../../models/vinted-listing-job';
import { emptyVintedListingContent } from '../../models/vinted-listing-content';
import { VintedListingJobPanelComponent } from './vinted-listing-job-panel.component';

import { VintedListingScheduleDialogComponent } from '../vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedListingScheduleDialogComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component.ts',
    },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
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
      type: CustomSelectComponent,
      path: 'src/app/shared/components/custom-select/custom-select.component.ts',
    },
    {
      type: VintedListingJobPanelComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-job-panel/vinted-listing-job-panel.component.ts',
    },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
const job: VintedListingJob = {
  id: '9007199254740999',
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  draftId: '12',
  draftRevision: 2,
  executionMode: 'local',
  externalAccountId: '123',
  action: 'publish',
  state: 'queued',
  version: 1,
  scheduledAt: '2026-10-25T01:30:00Z',
  timeZone: 'Europe/Berlin',
  latePolicy: 'pause_after_30_minutes',
  errorCode: null,
  externalId: null,
  providerState: null,
  verifiedAt: null,
  createdAt: '2026-10-09T12:00:00Z',
  updatedAt: '2026-10-09T12:00:00Z',
  replacesJobId: null,
};
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  TestBed.tick();
}
function setup(jobs: readonly VintedListingJob[] = [job]) {
  const workspace = signal({ id: 'workspace-a', archived_at: null }),
    user = signal({ id: 'user-a' }),
    session = signal({ access_token: 'token-a' }),
    canManage = signal(true);
  const subscriptions: {
    change: () => void;
    reconnect: () => void;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  const listen = vi.fn(
    (_workspace: string, _draft: string, change: () => void, reconnect: () => void) => {
      const stop = vi.fn();
      subscriptions.push({ change, reconnect, stop });
      return stop;
    },
  );
  const authenticate = vi.fn();
  const list = vi.fn().mockResolvedValue(jobs),
    cancel = vi.fn().mockResolvedValue({ ...job, state: 'cancelled', version: 2 }),
    reschedule = vi
      .fn()
      .mockResolvedValue({ ...job, id: '20', draftRevision: 3, replacesJobId: job.id });
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user, session } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceAccountStore, useValue: { canManage } },
      {
        provide: VintedListingJobService,
        useValue: { list, cancel, reschedule, listen, authenticate },
      },
    ],
  });
  const fixture = TestBed.createComponent(VintedListingJobPanelComponent);
  fixture.componentRef.setInput('workspaceId', 'workspace-a');
  fixture.componentRef.setInput('draftId', '12');
  fixture.componentRef.setInput('draftRevision', 3);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    list,
    cancel,
    reschedule,
    workspace,
    user,
    canManage,
    subscriptions,
    listen,
    authenticate,
    session,
  };
}
afterEach(() => TestBed.resetTestingModule());
describe('Inserataufträge im Editor', () => {
  it('refreshes a newly accepted job even without a live connection', async () => {
    const f = setup([]);
    await settle();
    f.list.mockResolvedValue([job]);
    f.fixture.componentRef.setInput('refreshToken', 1);
    await settle();
    expect(f.component.jobs()).toEqual([job]);
  });
  it('coalesces change hints during an active read and reloads on reconnect', async () => {
    const f = setup();
    await settle();
    let resolve!: (value: readonly VintedListingJob[]) => void;
    f.list.mockImplementationOnce(
      () =>
        new Promise<readonly VintedListingJob[]>((done) => {
          resolve = done;
        }),
    );
    f.subscriptions[0].change();
    await settle();
    expect(f.list).toHaveBeenCalledTimes(2);
    f.subscriptions[0].change();
    f.subscriptions[0].change();
    f.subscriptions[0].reconnect();
    await settle();
    expect(f.list).toHaveBeenCalledTimes(2);
    f.list.mockResolvedValue([{ ...job, state: 'failed', errorCode: 'provider_unconfirmed' }]);
    resolve([{ ...job, state: 'writing' }]);
    await settle();
    await settle();
    expect(f.list).toHaveBeenCalledTimes(3);
    expect(f.component.jobs()[0].state).toBe('failed');
    expect(f.component.announcement()).toContain('aktualisiert');
  });
  it('removes subscriptions on context changes and ignores hints from the old subscription', async () => {
    const f = setup();
    await settle();
    expect(f.authenticate).toHaveBeenCalledWith('token-a');
    f.session.set({ access_token: 'token-b' });
    await settle();
    expect(f.authenticate).toHaveBeenLastCalledWith('token-b');
    f.user.set({ id: 'user-b' });
    await settle();
    expect(f.subscriptions[0].stop).toHaveBeenCalledTimes(1);
    const reads = f.list.mock.calls.length;
    f.subscriptions[0].change();
    f.subscriptions[0].reconnect();
    await settle();
    expect(f.list).toHaveBeenCalledTimes(reads);
    f.canManage.set(false);
    await settle();
    expect(f.subscriptions[1].stop).toHaveBeenCalledTimes(1);
    f.subscriptions[1].change();
    await settle();
    expect(f.component.jobs()).toEqual([]);
    f.canManage.set(true);
    await settle();
    f.fixture.destroy();
    expect(f.subscriptions[2].stop).toHaveBeenCalledTimes(1);
    const finalReads = f.list.mock.calls.length;
    f.subscriptions[2].change();
    f.subscriptions[2].reconnect();
    await settle();
    expect(f.list).toHaveBeenCalledTimes(finalReads);
  });
  it('keeps a pending change until the planning dialog has closed', async () => {
    const f = setup();
    await settle();
    f.fixture.componentRef.setInput('draft', {
      id: '12',
      workspaceId: 'workspace-a',
      connectionId: 'account-a',
      revision: 3,
      content: emptyVintedListingContent(),
      images: [],
      inventoryItemId: null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
    f.fixture.componentRef.setInput('draftReady', true);
    f.fixture.detectChanges();
    f.component.openPlan(job);
    f.subscriptions[0].change();
    await settle();
    expect(f.list).toHaveBeenCalledTimes(1);
    f.component.closePlan();
    await settle();
    await settle();
    expect(f.list).toHaveBeenCalledTimes(2);
  });
  it('changes a saved plan once and retains the request identity after response loss', async () => {
    const f = setup();
    await settle();
    const draft = {
      id: '12',
      workspaceId: 'workspace-a',
      connectionId: 'account-a',
      revision: 3,
      content: emptyVintedListingContent(),
      images: [],
      inventoryItemId: null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    f.fixture.componentRef.setInput('draft', draft);
    f.fixture.componentRef.setInput('draftReady', true);
    f.fixture.detectChanges();
    f.component.openPlan(job);
    f.reschedule.mockRejectedValueOnce(new Error('private-details'));
    const schedule = {
      scheduledAt: job.scheduledAt!,
      timeZone: job.timeZone!,
      latePolicy: job.latePolicy,
    };
    await f.component.reschedule(schedule);
    expect(f.component.planningError()).not.toContain('private-details');
    const requestId = f.reschedule.mock.calls[0][2];
    await f.component.reschedule(schedule);
    expect(f.reschedule.mock.calls[1]).toEqual([job, draft, requestId, schedule]);
    expect(f.component.jobs().map((job) => job.state)).toEqual(['queued', 'cancelled']);
    expect(f.component.planning()).toBeNull();
  });
  it('blocks rescheduling unsaved changes and discards acknowledgments after account access changes', async () => {
    const f = setup();
    await settle();
    const draft = {
      id: '12',
      workspaceId: 'workspace-a',
      connectionId: 'account-a',
      revision: 3,
      content: emptyVintedListingContent(),
      images: [],
      inventoryItemId: null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    f.fixture.componentRef.setInput('draft', draft);
    f.fixture.detectChanges();
    f.component.openPlan(job);
    expect(f.component.planning()).toBeNull();
    f.fixture.componentRef.setInput('draftReady', true);
    f.fixture.detectChanges();
    f.component.openPlan(job);
    let resolve!: (job: VintedListingJob) => void;
    f.reschedule.mockImplementation(
      () =>
        new Promise<VintedListingJob>((done) => {
          resolve = done;
        }),
    );
    const schedule = {
      scheduledAt: job.scheduledAt!,
      timeZone: job.timeZone!,
      latePolicy: job.latePolicy,
    };
    const pending = f.component.reschedule(schedule);
    await f.component.reschedule(schedule);
    f.component.closePlan();
    expect(f.reschedule).toHaveBeenCalledTimes(1);
    expect(f.component.planning()).not.toBeNull();
    f.canManage.set(false);
    await settle();
    resolve({ ...job, id: '20', replacesJobId: job.id });
    await pending;
    expect(f.component.jobs()).toEqual([]);
    expect(f.component.planning()).toBeNull();
  });
  it('closes the planning dialog when a newer saved revision arrives', async () => {
    const f = setup();
    await settle();
    const draft = {
      id: '12',
      workspaceId: 'workspace-a',
      connectionId: 'account-a',
      revision: 3,
      content: emptyVintedListingContent(),
      images: [],
      inventoryItemId: null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    f.fixture.componentRef.setInput('draft', draft);
    f.fixture.componentRef.setInput('draftReady', true);
    f.fixture.detectChanges();
    f.component.openPlan(job);
    f.fixture.componentRef.setInput('draft', { ...draft, revision: 4 });
    f.fixture.detectChanges();
    expect(f.component.planning()).toBeNull();
  });
  it('distinguishes both occurrences of an autumn clock-change time in the history', async () => {
    const f = setup([job, { ...job, id: '2', scheduledAt: '2026-10-25T00:30:00Z' }]);
    await settle();
    expect(f.component.entries()[0].time).not.toBe(f.component.entries()[1].time);
    expect(f.component.entries()[0].time).toContain('02:30');
    expect(f.component.entries()[1].time).toContain('02:30');
  });
  it('distinguishes accepted, processing and unknown results and warns about changed content', async () => {
    const f = setup([
      job,
      {
        ...job,
        id: '2',
        state: 'confirmed',
        externalId: '999',
        providerState: 'processing',
        verifiedAt: '2026-10-09T12:00:01Z',
      },
      { ...job, id: '3', state: 'outcome_unknown' },
    ]);
    await settle();
    f.fixture.detectChanges();
    const text = f.fixture.nativeElement.textContent;
    expect(text).toContain('Veröffentlichung beauftragt');
    expect(text).toContain('Vinted prüft Dein Inserat');
    expect(text).toContain('Ergebnis unklar');
    expect(text).toContain('neuere Änderungen');
    expect(text).toContain('Europe/Berlin');
    expect(text).toContain('Nicht erneut');
  });
  it('allows version-bound cancellation only before preparation and prevents duplicate clicks', async () => {
    const f = setup();
    await settle();
    let resolve!: (value: VintedListingJob) => void;
    f.cancel.mockImplementation(
      () =>
        new Promise<VintedListingJob>((done) => {
          resolve = done;
        }),
    );
    const cancelling = f.component.cancelJob(job);
    await f.component.cancelJob(job);
    expect(f.cancel).toHaveBeenCalledTimes(1);
    expect(f.cancel).toHaveBeenCalledWith(job);
    resolve({ ...job, state: 'cancelled', version: 2 });
    await cancelling;
    expect(f.component.jobs()[0].state).toBe('cancelled');
    await f.component.cancelJob({ ...job, state: 'writing' });
    expect(f.cancel).toHaveBeenCalledTimes(1);
  });
  it('discards old history responses after switching workspace', async () => {
    const f = setup();
    await settle();
    let resolve!: (value: readonly VintedListingJob[]) => void;
    f.list.mockImplementationOnce(
      () =>
        new Promise<readonly VintedListingJob[]>((done) => {
          resolve = done;
        }),
    );
    const old = f.component.refresh();
    f.workspace.set({ id: 'workspace-b', archived_at: null });
    f.fixture.componentRef.setInput('workspaceId', 'workspace-b');
    f.fixture.componentRef.setInput('draftId', '13');
    f.list.mockResolvedValue([{ ...job, id: '2', workspaceId: 'workspace-b', draftId: '13' }]);
    await settle();
    resolve([job]);
    await old;
    expect(f.component.jobs()[0].workspaceId).toBe('workspace-b');
  });
  it('revoked access clears history and blocks cancellation', async () => {
    const f = setup();
    await settle();
    f.canManage.set(false);
    await settle();
    expect(f.component.jobs()).toEqual([]);
    await f.component.cancelJob(job);
    expect(f.cancel).not.toHaveBeenCalled();
  });
  it('failed cancellation preserves the job and explains that history must be refreshed', async () => {
    const f = setup();
    await settle();
    f.cancel.mockRejectedValue(new Error('private-detail'));
    await f.component.cancelJob(job);
    expect(f.component.jobs()[0].state).toBe('queued');
    expect(f.component.error()).toContain('aktualisiere');
    expect(f.component.error()).not.toContain('private-detail');
  });
  it('old cancellation acknowledgments cannot update the next signed-in user', async () => {
    const f = setup();
    await settle();
    let resolve!: (value: VintedListingJob) => void;
    f.cancel.mockImplementation(
      () =>
        new Promise<VintedListingJob>((done) => {
          resolve = done;
        }),
    );
    const cancelling = f.component.cancelJob(job);
    f.user.set({ id: 'user-b' });
    f.list.mockResolvedValue([]);
    await settle();
    resolve({ ...job, state: 'cancelled' });
    await cancelling;
    expect(f.component.jobs()).toEqual([]);
  });
});

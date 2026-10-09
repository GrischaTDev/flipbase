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
import { VintedListingJobPanelComponent } from './vinted-listing-job-panel.component';

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
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
    canManage = signal(true);
  const list = vi.fn().mockResolvedValue(jobs),
    cancel = vi.fn().mockResolvedValue({ ...job, state: 'cancelled', version: 2 });
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceAccountStore, useValue: { canManage } },
      { provide: VintedListingJobService, useValue: { list, cancel } },
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
    workspace,
    user,
    canManage,
  };
}
afterEach(() => TestBed.resetTestingModule());
describe('Inserataufträge im Editor', () => {
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

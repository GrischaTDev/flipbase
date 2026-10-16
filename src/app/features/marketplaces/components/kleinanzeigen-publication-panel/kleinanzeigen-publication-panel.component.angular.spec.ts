import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { KleinanzeigenPublicationPanelComponent } from './kleinanzeigen-publication-panel.component';
import { KleinanzeigenListingJobService } from '../../services/kleinanzeigen-listing-job.service';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import { kleinanzeigenJobFixture } from '../../../../../../supabase/test-support/kleinanzeigen-job-fixture';
const job = kleinanzeigenJobFixture();
const scope = {
  workspaceId: job.workspaceId,
  connectionId: job.connectionId,
  externalAccountId: '88',
  generation: 2,
  accountType: 'private' as const,
};
function fixture() {
  const jobs = {
    job: signal<unknown>(null),
    busy: signal(false),
    error: signal<string | null>(null),
    cancel: vi.fn(),
    latest: vi.fn().mockResolvedValue(null),
    enqueue: vi.fn().mockResolvedValue(job),
    reconcile: vi.fn(),
  };
  const bridge = {
    capabilities: signal({ accounts: true, sync: true, publish: true }),
    quotaAvailable: signal(true),
  };
  TestBed.configureTestingModule({
    providers: [
      KleinanzeigenPublicationPanelComponent,
      { provide: KleinanzeigenListingJobService, useValue: jobs },
      { provide: KleinanzeigenExtensionBridge, useValue: bridge },
    ],
  });
  const panel = TestBed.inject(KleinanzeigenPublicationPanelComponent);
  return { jobs, panel };
}
afterEach(() => TestBed.resetTestingModule());
describe('Veröffentlichungsanzeige', () => {
  it('startet mit ungespeicherten Änderungen keinen Auftrag', async () => {
    const f = fixture();
    Object.defineProperty(f.panel, 'scope', { value: () => scope });
    Object.defineProperty(f.panel, 'draftId', { value: () => job.draftId });
    Object.defineProperty(f.panel, 'revision', { value: () => 4 });
    Object.defineProperty(f.panel, 'unsaved', { value: () => true });
    await f.panel.publish();
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
  it('bietet bei unklarem Ausgang keine erneute Veröffentlichung an', () => {
    const f = fixture();
    f.jobs.job.set({ ...job, state: 'outcome_unknown' });
    expect(f.panel.hasUnresolvedJob()).toBe(true);
    expect(f.panel.canPublish()).toBe(false);
    expect(f.panel.status()).toContain('unklar');
  });
});

let restore: () => void;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: KleinanzeigenPublicationPanelComponent,
      path: 'src/app/features/marketplaces/components/kleinanzeigen-publication-panel/kleinanzeigen-publication-panel.component.ts',
    },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
  ]);
});
afterAll(() => restore?.());

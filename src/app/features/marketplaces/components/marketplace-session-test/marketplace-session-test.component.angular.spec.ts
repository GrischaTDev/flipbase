import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceTestSessionApiService } from '../../services/marketplace-test-session-api.service';
import { MarketplaceSessionTestComponent } from './marketplace-session-test.component';

const account = createMarketplaceFixtures().connections[0];
let resetBindings: (() => void) | undefined;
let start: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  resetBindings = await prepareMarketplaceRendering([
    { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
    {
      type: MarketplaceSessionTestComponent,
      path: 'src/app/features/marketplaces/components/marketplace-session-test/marketplace-session-test.component.ts',
    },
  ]);
});
afterAll(() => resetBindings?.());
beforeEach(() => {
  start = vi.fn().mockResolvedValue({
    workspaceId: account.workspaceId,
    connectionId: account.connectionId,
    id: '25500000-0000-4000-8000-000000000031',
    state: 'active',
    expiresAt: '2099-09-27T10:00:00Z',
    interactionCount: 0,
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MarketplaceSessionTestComponent],
    providers: [
      {
        provide: MarketplaceAccountStore,
        useValue: {
          selectedConnection: computed(() => account),
          selectionVersion: signal(0),
          canManage: signal(true),
        },
      },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'operator-a' }) } },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: account.workspaceId }) },
      },
      {
        provide: MarketplaceTestSessionApiService,
        useValue: { start, status: vi.fn(), action: vi.fn() },
      },
    ],
  });
});

describe('Eigene Marktplatz-Testseite', () => {
  it('kennzeichnet die Sitzung als Simulation und startet nur für das ausgewählte Konto', async () => {
    const fixture = TestBed.createComponent(MarketplaceSessionTestComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Simulation');
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (node: HTMLButtonElement) => node.textContent?.includes('Testsitzung starten'),
    ) as HTMLButtonElement | undefined;
    expect(button).toBeDefined();
    button?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(start).toHaveBeenCalledWith({
      workspaceId: account.workspaceId,
      connectionId: account.connectionId,
    });
    expect(fixture.nativeElement.textContent).toContain('Aktiv');
  });

  it('hat in der Testseite keine schweren strukturellen Barrieren', async () => {
    const fixture = TestBed.createComponent(MarketplaceSessionTestComponent);
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(
      result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious'),
    ).toEqual([]);
  });
});

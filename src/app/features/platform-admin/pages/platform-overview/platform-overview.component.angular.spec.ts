import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { BetaApplicationService } from '../../services/beta-application.service';
import { PlatformUserService } from '../../services/platform-user.service';
import { PlatformOverviewComponent } from './platform-overview.component';

const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

async function render(users: () => Promise<unknown>) {
  await TestBed.configureTestingModule({
    imports: [PlatformOverviewComponent],
    providers: [
      provideRouter([]),
      { provide: PlatformUserService, useValue: { list: vi.fn(users) } },
      {
        provide: BetaApplicationService,
        useValue: { list: vi.fn(async () => [{ status: 'open' }, { status: 'accepted' }]) },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PlatformOverviewComponent);
  fixture.detectChanges();
  // Das Laden startet in ngOnInit; erst danach stehen die Werte bereit.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PlatformOverviewComponent', () => {
  let restoreBindings: (() => void) | undefined;
  beforeAll(async () => {
    restoreBindings = await prepareMarketplaceRendering([
      {
        type: PlatformOverviewComponent,
        path: 'src/app/features/platform-admin/pages/platform-overview/platform-overview.component.ts',
      },
    ]);
  });
  afterAll(() => restoreBindings?.());
  afterEach(() => TestBed.resetTestingModule());

  it('zeigt Kennzahlen und die zuletzt aktiven Nutzer mit Link zur Nutzung', async () => {
    const element = await render(async () => [
      {
        userId: 'user-1',
        fullName: 'Anna Beispiel',
        email: 'anna@example.test',
        registeredAt: recent,
        licenseStatus: 'active',
        lastSignInAt: recent,
        lastActionAt: null,
      },
    ]);

    const value = (key: string) =>
      element.querySelector(`[data-metric="${key}"] .metric-value`)?.textContent?.trim();
    expect(value('users')).toBe('1');
    expect(value('active')).toBe('1');
    expect(value('inactive')).toBe('0');
    expect(value('access')).toBe('1');
    expect(value('applications')).toBe('1');

    const link = element.querySelector('[data-platform-recent-activity] a');
    expect(link?.getAttribute('href')).toBe('/admin/users/user-1');
    expect(link?.textContent).toContain('Anna Beispiel');

    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it('meldet einen Ladefehler sichtbar', async () => {
    const element = await render(async () => {
      throw new Error('offline');
    });

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Die Übersicht konnte nicht geladen werden.',
    );
  });
});

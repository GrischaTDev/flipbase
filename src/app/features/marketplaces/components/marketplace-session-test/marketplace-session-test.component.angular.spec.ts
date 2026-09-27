import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceTestSessionApiService } from '../../services/marketplace-test-session-api.service';
import { MarketplaceBrowserTestApiService } from '../../services/marketplace-browser-test-api.service';
import { MarketplaceBrowserTestComponent } from '../marketplace-browser-test/marketplace-browser-test.component';
import { MarketplaceSessionTestComponent } from './marketplace-session-test.component';

const account = createMarketplaceFixtures().connections[0];
let resetBindings: (() => void) | undefined;
let start: ReturnType<typeof vi.fn>;
let liveApi: {
  available: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  frame: ReturnType<typeof vi.fn>;
  input: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

beforeAll(async () => {
  resetBindings = await prepareMarketplaceRendering([
    { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
    {
      type: TextFieldComponent,
      path: 'src/app/shared/components/text-field/text-field.component.ts',
    },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
    {
      type: MarketplaceBrowserTestComponent,
      path: 'src/app/features/marketplaces/components/marketplace-browser-test/marketplace-browser-test.component.ts',
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
  liveApi = {
    available: vi.fn().mockResolvedValue({ available: false, readOnly: true }),
    open: vi.fn().mockResolvedValue('25600000-0000-4000-8000-000000000031'),
    frame: vi.fn().mockResolvedValue(new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])])),
    input: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MarketplaceSessionTestComponent],
    providers: [
      provideRouter([]),
      {
        provide: MarketplaceAccountStore,
        useValue: {
          selectedConnection: computed(() => account),
          selectionVersion: signal(0),
          canManage: signal(true),
        },
      },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ id: 'operator-a' }),
          session: signal({ access_token: 'synthetic-token' }),
        },
      },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: account.workspaceId }) },
      },
      {
        provide: MarketplaceTestSessionApiService,
        useValue: { start, status: vi.fn(), action: vi.fn() },
      },
      {
        provide: MarketplaceBrowserTestApiService,
        useValue: liveApi,
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

  it('bindet den Browser-Testbereich an das ausgewählte Konto und die Anmeldung', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    liveApi.available.mockResolvedValue({ available: true, readOnly: true });
    const fixture = TestBed.createComponent(MarketplaceSessionTestComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (node: HTMLButtonElement) => node.textContent?.includes('Öffentlichen Testbrowser starten'),
    ) as HTMLButtonElement | undefined;
    expect(button).toBeDefined();
    button?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(liveApi.open).toHaveBeenCalledWith(
      { workspaceId: account.workspaceId, connectionId: account.connectionId },
      'synthetic-token',
    );
    expect(
      fixture.nativeElement.querySelector(
        'img[alt="Öffentliche Profilseite im lokalen Testbrowser"]',
      ),
    ).not.toBeNull();
    const result = await axe.run(fixture.nativeElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(
      result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious'),
    ).toEqual([]);
  });
});

it('bietet nach abgelehntem Login wieder das leere Formular an und stoppt den Prüfstatus', async () => {
  const { VintedLoginRejectedError } =
    await import('../../services/marketplace-browser-test-api.service');
  TestBed.overrideProvider(MarketplaceAccountStore, {
    useValue: {
      selectedConnection: signal({ ...account, status: 'pending' }),
      selectionVersion: signal(0),
      canManage: signal(true),
    },
  });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:test' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  liveApi.available.mockResolvedValue({ available: true, readOnly: false });
  const login = vi.fn().mockResolvedValue('submitted');
  Object.assign(liveApi, {
    login,
    identify: vi.fn().mockRejectedValue(new VintedLoginRejectedError()),
  });
  const fixture = TestBed.createComponent(MarketplaceBrowserTestComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.componentInstance.loginForm.setValue({ username: 'synthetic', password: 'synthetic' });
  await fixture.componentInstance.login();
  await fixture.componentInstance.store.checkLogin();
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Zugangsdaten abgelehnt');
  expect(fixture.nativeElement.textContent).not.toContain('Anmeldung wird geprüft');
  expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  expect(fixture.componentInstance.loginForm.getRawValue()).toEqual({ username: '', password: '' });
  fixture.componentInstance.loginForm.setValue({ username: 'corrected', password: 'corrected' });
  fixture.detectChanges();
  const submit = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  expect(submit.disabled).toBe(false);
  submit.click();
  await fixture.whenStable();
  expect(login).toHaveBeenCalledTimes(2);
  expect(liveApi.open).toHaveBeenCalledOnce();
  fixture.destroy();
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import {
  VintedLocalExtensionBridge,
  type VintedLocalAccountStatus,
} from '../../services/vinted-local-extension-bridge';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { VintedLocalConnectComponent } from './vinted-local-connect.component';

const account = {
  ...createMarketplaceFixtures().connections[0],
  connectionId: '35000000-0000-4000-8000-000000000021',
  executionMode: 'local' as const,
};
const profileAccount = signal<VintedLocalAccountStatus | null | undefined>(undefined);
const prepare = vi.fn();
let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedLocalConnectComponent,
      path: 'src/app/features/marketplaces/components/vinted-local-connect/vinted-local-connect.component.ts',
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
beforeEach(() => {
  TestBed.resetTestingModule();
  vi.clearAllMocks();
  profileAccount.set(undefined);
  const parameters = convertToParamMap({ connectionId: account.connectionId });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(parameters), snapshot: { paramMap: parameters } },
      },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          connections: signal([account]),
          canManage: signal(true),
          loading: signal(false),
          selectedConnection: signal(account),
          selectConnection: vi.fn(),
        },
      },
      {
        provide: VintedLocalExtensionBridge,
        useValue: {
          localAccount: profileAccount,
          installed: signal(true),
          checkingInstallation: signal(false),
          installationCheckFailed: signal(false),
          checkInstallation: vi.fn(),
        },
      },
      {
        provide: VintedLocalExtensionStore,
        useValue: {
          connection: signal(null),
          error: signal(null),
          notice: signal(null),
          prepared: signal(null),
          binding: signal(null),
          imported: signal(null),
          busy: signal(false),
          hasValidBinding: () => false,
          canRevoke: () => false,
          prepare,
        },
      },
    ],
  });
});
function render() {
  const fixture = TestBed.createComponent(VintedLocalConnectComponent);
  fixture.detectChanges();
  return fixture;
}
it('führt die vorbereitete Verbindung durch Profilprüfung und Freigabe ohne weitere Kontoanlage', () => {
  const fixture = render();
  expect(fixture.nativeElement.textContent).toContain('Chrome oder');
  expect(fixture.nativeElement.textContent).toContain('Brave');
  expect(fixture.nativeElement.textContent).toContain('Entpackte Erweiterung laden');
  expect(fixture.nativeElement.textContent).toContain('Vorbereitete Verbindung bestätigen');
  expect(fixture.nativeElement.textContent).not.toContain('Logo-Blase');
  expect(fixture.nativeElement.textContent).toContain('Nachrichtenzugriff freigeben');
  expect(fixture.nativeElement.textContent).not.toContain(
    'Postfach, Verkäufe und automatische Aktionen',
  );
});
it('verhindert Kontoprüfung für ein anders verknüpftes Browserprofil', () => {
  profileAccount.set({
    boundUsername: 'andereskonto',
    boundConnectionId: '35000000-0000-4000-8000-000000000022',
    expiresAt: '2026-10-07T10:00:00.000Z',
    state: 'linked',
  });
  const fixture = render();
  expect(fixture.nativeElement.textContent).toContain('@andereskonto');
  const button = [...fixture.nativeElement.querySelectorAll('button')].find(
    (element: HTMLButtonElement) =>
      element.textContent?.includes('Angemeldetes Vinted-Konto prüfen'),
  ) as HTMLButtonElement | undefined;
  expect(button?.disabled).toBe(true);
  button?.click();
  expect(prepare).not.toHaveBeenCalled();
});
it('erlaubt die erneute Prüfung der vorhandenen Profilverknüpfung', () => {
  profileAccount.set({
    boundUsername: null,
    boundConnectionId: account.connectionId,
    expiresAt: '2026-10-05T10:00:00.000Z',
    state: 'expired',
  });
  const fixture = render();
  const button = [...fixture.nativeElement.querySelectorAll('button')].find(
    (element: HTMLButtonElement) =>
      element.textContent?.includes('Angemeldetes Vinted-Konto prüfen'),
  ) as HTMLButtonElement | undefined;
  expect(button?.disabled).toBe(false);
  button?.click();
  expect(prepare).toHaveBeenCalledOnce();
});

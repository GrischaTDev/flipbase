import { MarketplaceSyncProgressComponent } from '../marketplace-sync-progress/marketplace-sync-progress.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { readFile } from 'node:fs/promises';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceBrowserTestStore } from '../../services/marketplace-browser-test.store';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { MarketplaceBrowserTestComponent } from './marketplace-browser-test.component';

const session = signal<{ id: string; frameUrl: string | null } | null>(null);
const error = signal<string | null>(null);
const mutationError = signal<string | null>(null);
const cloudVerified = signal(false);
const synchronizationOpen = signal(false);
let restoreRendering: (() => void) | undefined;

afterEach(() => {
  restoreRendering?.();
  TestBed.resetTestingModule();
});

beforeEach(async () => {
  mutationError.set(null);
  synchronizationOpen.set(false);
  cloudVerified.set(false);
  session.set({
    id: 'fixture-session',
    frameUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  });
  error.set('Die Anmeldung konnte noch nicht bestätigt werden.');
  const browserStore = {
    session,
    error,
    connection: signal(createMarketplaceFixtures().connections[0]),
    availabilityChecked: signal(true),
    available: signal(true),
    outdated: signal(false),
    readOnly: signal(false),
    busy: signal(false),
    canAct: signal(true),
    canLogin: signal(true),
    canStart: signal(true),
    dragSupported: signal(true),
    manualLogin: signal(false),
    awaitingLogin: signal(false),
    awaitingVerification: signal(false),
    interactionRequired: signal(false),
    progress: signal(null),
    synchronizationOpen,
    cloudCancelled: signal(false),
    cloudCompleted: signal(false),
    cloudVerified,
    cloudSetup: signal(null),
    checkAvailability: vi.fn(),
    configureCloudSetup: vi.fn(),
    checkLogin: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: MarketplaceAccountStore,
        useValue: {
          canManage: signal(true),
          mutationError,
          syncProgress: signal({
            id: 'fixture-sync',
            state: 'succeeded',
            stage: 'cleanup',
            errorCode: null,
          }),
        },
      },
      {
        provide: MarketplaceBrowserTestStore,
        useValue: browserStore,
      },
    ],
  });
  TestBed.overrideComponent(MarketplaceBrowserTestComponent, {
    set: {
      providers: [{ provide: MarketplaceBrowserTestStore, useValue: browserStore }],
      template: await readFile(
        'src/app/features/marketplaces/components/marketplace-browser-test/marketplace-browser-test.component.html',
        'utf8',
      ),
      templateUrl: undefined,
    },
  });
  const shared = 'src/app/shared/components';
  restoreRendering = await prepareMarketplaceRendering([
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
    },
    {
      type: MarketplaceSyncProgressComponent,
      path: 'src/app/features/marketplaces/components/marketplace-sync-progress/marketplace-sync-progress.component.ts',
    },
    {
      type: MarketplaceBrowserTestComponent,
      path: 'src/app/features/marketplaces/components/marketplace-browser-test/marketplace-browser-test.component.ts',
    },
    { type: ButtonComponent, path: `${shared}/button/button.component.ts` },
    { type: CardComponent, path: `${shared}/card/card.component.ts` },
    {
      type: LoadingIndicatorComponent,
      path: `${shared}/loading-indicator/loading-indicator.component.ts`,
    },
    { type: NoticeBannerComponent, path: `${shared}/notice-banner/notice-banner.component.ts` },
    { type: TextFieldComponent, path: `${shared}/text-field/text-field.component.ts` },
  ]);
});

it('places a single browser warning inside the preview and keeps credentials in their own full-width card', () => {
  const fixture = TestBed.createComponent(MarketplaceBrowserTestComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const preview = root.querySelector('[aria-label="Vinted-Browseransicht"]');
  const alerts = root.querySelectorAll('[role="alert"]');
  expect(alerts).toHaveLength(1);
  expect(preview?.contains(alerts[0])).toBe(true);
  const form = root.querySelector('form');
  expect(form?.closest('app-card')?.textContent).toContain('Anmeldedaten');
  expect(form?.classList.contains('max-w-md')).toBe(false);
  expect(form?.querySelectorAll('app-text-field')).toHaveLength(2);
});

it('keeps an error visible when a browser image has not loaded', () => {
  session.set({ id: 'fixture-session', frameUrl: null });
  const fixture = TestBed.createComponent(MarketplaceBrowserTestComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  expect(root.querySelector('[aria-label="Vinted-Browseransicht"]')).toBeNull();
  expect(root.querySelectorAll('[role="alert"]')).toHaveLength(1);
  expect(root.querySelector('[role="alert"]')?.textContent).toContain(error());
});

it('distinguishes a stored account link from an unconfirmed provider session after a failed refresh', () => {
  session.set(null);
  error.set(null);
  mutationError.set('Die Aktualisierung ist beim Lesen des Profils fehlgeschlagen.');
  const fixture = TestBed.createComponent(MarketplaceBrowserTestComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  expect(root.textContent).toContain('Die Kontoverknüpfung ist gespeichert.');
  expect(root.textContent).toContain('Der aktuelle Vinted-Zugriff konnte nicht bestätigt werden.');
  expect(root.textContent).not.toContain('Dein Vinted-Konto ist verbunden.');
  expect(root.textContent).toContain('Anmeldung erneuern');
});

it('keeps Cloud activation errors visible after a confirmed login', () => {
  cloudVerified.set(true);
  const fixture = TestBed.createComponent(MarketplaceBrowserTestComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  expect(root.querySelector('[aria-label="Vinted-Browseransicht"]')).toBeNull();
  expect(root.querySelector('[role="alert"]')?.textContent).toContain(error());
  expect(root.textContent).toContain('Cloud aktivieren');
});

it('passes the DOM accessibility checks for the login and browser cards', async () => {
  const fixture = TestBed.createComponent(MarketplaceBrowserTestComponent);
  fixture.detectChanges();
  const result = await axe.run(fixture.nativeElement, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    // JSDOM kann den tatsächlichen Farbkontrast nicht messen.
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations).toEqual([]);
});

it('zeigt nach Anmeldung den bestehenden Fortschrittsdialog mit dem tatsächlichen Abrufstand', () => {
  synchronizationOpen.set(true);
  error.set(null);
  const fixture = TestBed.createComponent(MarketplaceBrowserTestComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const progress = root.querySelector('app-marketplace-sync-progress');
  expect(progress?.textContent).toContain('Kontodaten aktualisieren');
  expect(progress?.textContent).toContain('Die Kontodaten wurden aktualisiert.');
});

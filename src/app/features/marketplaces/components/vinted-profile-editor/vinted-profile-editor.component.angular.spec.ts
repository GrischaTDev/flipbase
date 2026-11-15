import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { vintedProfileEditorRendering } from '../../../../../../e2e/support/vinted-profile-editor-rendering';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedEditUnconfirmedError } from '../../services/marketplace-browser-test-api.service';
import { VintedProfileEditorComponent } from './vinted-profile-editor.component';

const original = {
  about: 'Shop',
  city: 'Berlin',
  showCity: true,
  language: 'de-DE',
  country: 'Deutschland',
  imageUrl: null,
  languages: [{ id: 'de-DE', label: 'Deutsch' }],
  canUploadPhoto: true,
};
const selectedConnection = signal({ connectionId: 'account-a', workspaceId: 'workspace-a' });
const store = {
  selectedConnection,
  selectionVersion: signal(1),
  readProfileDetails: vi.fn(),
  searchProfileCities: vi.fn(),
  saveProfileDetails: vi.fn(),
};
let restore: (() => void) | undefined;
let restoreTestBindings: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    ...vintedProfileEditorRendering,
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
    {
      type: TextFieldComponent,
      path: 'src/app/shared/components/text-field/text-field.component.ts',
    },
    {
      type: VintedProfileEditorComponent,
      path: 'src/app/features/marketplaces/components/vinted-profile-editor/vinted-profile-editor.component.ts',
    },
  ]);
});
afterAll(() => restore?.());

beforeEach(async () => {
  store.selectionVersion.set(1);
  selectedConnection.set({ connectionId: 'account-a', workspaceId: 'workspace-a' });
  store.readProfileDetails.mockReset().mockResolvedValue(original);
  store.searchProfileCities.mockReset().mockResolvedValue([{ id: '796', label: 'Hamburg' }]);
  store.saveProfileDetails
    .mockReset()
    .mockResolvedValue({ profile: original, cachePending: false });
  await TestBed.configureTestingModule({
    imports: [VintedProfileEditorComponent],
    providers: [{ provide: MarketplaceAccountStore, useValue: store }],
  })
    .overrideComponent(VintedProfileEditorComponent, { set: { template: '', imports: [] } })
    .compileComponents();
  restoreTestBindings = await prepareMarketplaceRendering([
    {
      type: VintedProfileEditorComponent,
      path: 'src/app/features/marketplaces/components/vinted-profile-editor/vinted-profile-editor.component.ts',
    },
  ]);
});
afterEach(() => {
  TestBed.resetTestingModule();
  restoreTestBindings?.();
});

function editor() {
  const fixture = TestBed.createComponent(VintedProfileEditorComponent);
  fixture.componentRef.setInput('connectionId', 'account-a');
  fixture.detectChanges();
  return fixture.componentInstance;
}

it('speichert nur die gewählte Vinted-Stadt mit dem ursprünglichen Profil als Konfliktschutz', async () => {
  const component = editor();
  await component.open();
  component.citySearch.setValue('Hamburg');
  await component.searchCities();
  component.form.controls.cityId.setValue('796');
  component.form.controls.showCity.setValue(false);
  await component.save();
  expect(store.saveProfileDetails).toHaveBeenCalledWith(
    'account-a',
    { about: 'Shop', city: 'Hamburg', cityId: '796', showCity: false, language: 'de-DE' },
    original,
  );
});

it('verwirft verspätete Profildaten nach einem Kontowechsel', async () => {
  let resolveProfile: (profile: typeof original) => void = () => undefined;
  store.readProfileDetails.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveProfile = resolve;
    }),
  );
  const component = editor();
  const pending = component.open();
  selectedConnection.set({ connectionId: 'account-b', workspaceId: 'workspace-a' });
  resolveProfile(original);
  await pending;
  expect(component.editing()).toBe(false);
});
it('verwirft einen alten Profilabruf auch bei gleicher Konto-ID nach A–B–A', async () => {
  let complete: (profile: typeof original) => void = () => undefined;
  store.readProfileDetails.mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const component = editor();
  const reading = component.open();
  store.selectionVersion.update((version) => version + 2);
  complete(original);
  await reading;
  expect(component.original()).toBeNull();
  expect(component.editing()).toBe(false);
});

it('verhindert erneutes Speichern nach einem unbestätigten Ergebnis bis zum Neuladen', async () => {
  const component = editor();
  await component.open();
  component.form.controls.about.setValue('Neu');
  store.saveProfileDetails.mockRejectedValueOnce(new VintedEditUnconfirmedError('Profil'));
  await component.save();
  await component.save();
  expect(store.saveProfileDetails).toHaveBeenCalledTimes(1);
  expect(component.requiresReload()).toBe(true);
});

it('schließt nach gespeicherter Annahme und lässt ein späteres Ergebnis keinen neu geöffneten Editor verändern', async () => {
  const component = editor();
  await component.open();
  let complete: (result: { profile: typeof original; cachePending: boolean }) => void = () =>
    undefined;
  store.saveProfileDetails.mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const saving = component.save();
  window.dispatchEvent(
    new CustomEvent('flipbase-account-action-accepted', {
      detail: {
        id: '11111111-1111-4111-8111-111111111111',
        requestId: '22222222-2222-4222-8222-222222222222',
        workspaceId: 'workspace-a',
        connectionId: 'account-a',
        entryId: null,
        title: null,
        kind: 'profile_details_save',
        state: 'queued',
        version: 1,
        waitReason: 'pool_busy',
        errorCode: null,
        result: null,
        blockedByActionId: null,
        historyPurged: false,
        resultExpired: false,
        createdAt: '2026-11-14T12:00:00Z',
        updatedAt: '2026-11-14T12:00:00Z',
        startedAt: null,
        finishedAt: null,
      },
    }),
  );
  expect(component.editing()).toBe(false);
  expect(component.busy()).toBe(false);
  expect(component.saved()).toBe(false);
  await component.open();
  component.form.controls.about.setValue('Neue Eingabe');
  complete({ profile: original, cachePending: false });
  await saving;
  expect(component.editing()).toBe(true);
  expect(component.form.controls.about.value).toBe('Neue Eingabe');
  expect(component.saved()).toBe(false);
});

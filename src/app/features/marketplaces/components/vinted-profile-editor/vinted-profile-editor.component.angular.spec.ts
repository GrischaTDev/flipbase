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
const selectedConnection = signal({ connectionId: 'account-a' });
const store = {
  selectedConnection,
  readProfileDetails: vi.fn(),
  searchProfileCities: vi.fn(),
  saveProfileDetails: vi.fn(),
};
let restore: (() => void) | undefined;
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
  selectedConnection.set({ connectionId: 'account-a' });
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
  await prepareMarketplaceRendering([
    {
      type: VintedProfileEditorComponent,
      path: 'src/app/features/marketplaces/components/vinted-profile-editor/vinted-profile-editor.component.ts',
    },
  ]);
});
afterEach(() => TestBed.resetTestingModule());

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
  selectedConnection.set({ connectionId: 'account-b' });
  resolveProfile(original);
  await pending;
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

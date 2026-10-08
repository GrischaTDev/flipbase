import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { provideRouter } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { VintedFavoriteMessageApiService } from '../../services/vinted-favorite-message-api.service';
import { VintedMessagingApiService } from '../../services/vinted-messaging-api.service';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import type { FavoriteMessageSettings } from '../../models/vinted-favorite-messages';
import { VintedFavoriteMessagesComponent } from './vinted-favorite-messages.component';
const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const connection: MarketplaceConnection = {
  ...scope,
  marketplace: 'vinted',
  executionMode: 'local',
  displayName: 'Konto A',
  externalAccountId: '123',
  status: 'connected',
  capabilities: {},
  allowedActions: [],
  lastSyncedAt: null,
};
const account = signal<MarketplaceConnection | null>(connection);
const user = signal<{ id: string } | null>({ id: 'user-a' });
const workspace = signal({ id: scope.workspaceId });
const settings: FavoriteMessageSettings = {
  ...scope,
  enabled: false,
  active: false,
  version: 0,
  config: null,
  lastCheckedAt: null,
  events: [],
};
let api: { read: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
let dialog: { frage: ReturnType<typeof vi.fn> };
let restore: (() => void) | undefined;
let favoriteTemplate: string;
beforeAll(async () => {
  const shared = [
    { type: BadgeComponent, path: 'badge/badge.component' },
    { type: ButtonComponent, path: 'button/button.component' },
    { type: CardComponent, path: 'card/card.component' },
    { type: CustomCheckboxComponent, path: 'custom-checkbox/custom-checkbox.component' },
    { type: CustomSelectComponent, path: 'custom-select/custom-select.component' },
    { type: NoticeBannerComponent, path: 'notice-banner/notice-banner.component' },
    { type: NumberInputComponent, path: 'number-input/number-input.component' },
    { type: TextFieldComponent, path: 'text-field/text-field.component' },
  ];
  const componentPath =
    'src/app/features/marketplaces/components/vinted-favorite-messages/vinted-favorite-messages.component';
  restore = await prepareMarketplaceRendering([
    ...shared.map((component) => ({
      ...component,
      path: `src/app/shared/components/${component.path}.ts`,
    })),
    { type: VintedFavoriteMessagesComponent, path: `${componentPath}.ts` },
  ]);
  favoriteTemplate = await readFile(`${componentPath}.html`, 'utf8');
});
afterAll(() => restore?.());
beforeEach(() => {
  account.set(connection);
  user.set({ id: 'user-a' });
  workspace.set({ id: scope.workspaceId });
  api = {
    read: vi.fn().mockResolvedValue(settings),
    save: vi.fn().mockImplementation(async (_settings, enabled, config) => ({
      ...settings,
      enabled,
      active: enabled,
      config,
      version: 1,
    })),
  };
  dialog = { frage: vi.fn().mockResolvedValue(false) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceAccountStore, useValue: { selectedConnection: account } },
      { provide: VintedFavoriteMessageApiService, useValue: api },
      {
        provide: VintedMessagingApiService,
        useValue: {
          readPermission: vi.fn(async () => ({
            executionMode: 'cloud',
            allowed: false,
            authorizationVersion: 0,
          })),
          approveCloud: vi.fn(async () => ({
            executionMode: 'cloud',
            allowed: true,
            authorizationVersion: 1,
          })),
        },
      },
      { provide: ConfirmDialogService, useValue: dialog },
      {
        provide: VintedLocalExtensionStore,
        useValue: {
          binding: signal({ messagesSend: true }),
          loadConnection: vi.fn(),
          messagesAllowed: () => true,
        },
      },
    ],
  }).overrideComponent(VintedFavoriteMessagesComponent, { set: { template: '', imports: [] } });
});

describe('Favorite message form rendering', () => {
  beforeEach(() => {
    TestBed.overrideComponent(VintedFavoriteMessagesComponent, {
      set: {
        template: favoriteTemplate,
        imports: [
          ReactiveFormsModule,
          DatePipe,
          BadgeComponent,
          ButtonComponent,
          CardComponent,
          CustomCheckboxComponent,
          CustomSelectComponent,
          NoticeBannerComponent,
          NumberInputComponent,
          TextFieldComponent,
        ],
      },
    });
  });
  it('submits through the single save button beside the title and keeps normal form submission working', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const form = element.querySelector<HTMLFormElement>('form');
    const saveButtons = element.querySelectorAll<HTMLButtonElement>('button[type="submit"]');
    expect(saveButtons).toHaveLength(1);
    const saveButton = saveButtons[0];
    expect(saveButton.closest('form')).toBeNull();
    expect(saveButton.getAttribute('form')).toBe(form?.id);
    expect(saveButton.disabled).toBe(false);
    saveButton.click();
    await settle(fixture);
    expect(api.save).toHaveBeenCalledOnce();
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(fixture);
    expect(api.save).toHaveBeenCalledTimes(2);
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    expect(saveButton.disabled).toBe(true);
    fixture.componentInstance.loading.set(false);
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    expect(saveButton.disabled).toBe(true);
  });
  it('renders live examples through shared controls without activating automation or clamping user input', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const offerCheckbox = [
      ...element.querySelectorAll<HTMLButtonElement>('button[role="checkbox"]'),
    ].find((button) => button.getAttribute('aria-label') === 'Angebot mitschicken');
    expect(offerCheckbox).toBeDefined();
    offerCheckbox?.click();
    fixture.detectChanges();
    expect(element.textContent?.replace(/\s+/g, ' ')).toContain(
      'Artikelpreis 40,00 € → Angebot 35,00 €',
    );
    fixture.componentInstance.form.controls.offerType.setValue('percentage');
    fixture.detectChanges();
    const offerInput = element.querySelector<HTMLInputElement>('#favorite-offer-value');
    expect(offerInput).not.toBeNull();
    if (!offerInput) throw new Error('Angebotsfeld fehlt');
    offerInput.value = '10';
    offerInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(element.textContent?.replace(/\s+/g, ' ')).toContain('Angebot 36,00 €');
    offerInput.value = '60';
    offerInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.offerValue.value).toBe(60);
    expect(offerInput.getAttribute('aria-invalid')).toBe('true');
    expect(element.textContent).toContain('1 bis 50 Prozent');
    expect(api.save).not.toHaveBeenCalled();
    expect(dialog.frage).not.toHaveBeenCalled();
  });
  it('separates a confirmed message from an uncertain offer and exposes no severe accessibility barriers', async () => {
    api.read.mockResolvedValue({
      ...settings,
      events: [
        {
          id: 'event-1',
          title: 'Testschal',
          eventAt: '2026-10-06T12:00:00Z',
          state: 'sent',
          text: 'Hallo',
          errorCode: null,
          offerState: 'outcome_unknown',
          offerPriceCents: 3600,
          offerErrorCode: 'request_failed',
        },
      ],
    });
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Nachricht: Gesendet');
    expect(element.textContent).toContain('Angebotsversand unklar');
    expect(element.textContent).toContain('Der genaue Angebotsgrund ist nicht verfügbar.');
    expect(element.textContent).not.toContain('request_failed');
    expect(element.textContent?.replace(/\s+/g, ' ')).toContain('Angebotspreis: 36,00 €');
    const results = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });
  it('explains a skipped offer while preserving the confirmed message result', async () => {
    api.read.mockResolvedValue({
      ...settings,
      events: [
        {
          id: 'event-skipped',
          title: 'Testschal',
          eventAt: '2026-10-06T12:00:00Z',
          state: 'sent',
          text: 'Hallo',
          errorCode: null,
          offerState: 'skipped',
          offerPriceCents: null,
          offerErrorCode: 'missing_transaction',
        },
      ],
    });
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Nachricht: Gesendet');
    expect(element.textContent).toContain('Angebot ausgelassen');
    expect(element.textContent).toContain(
      'Für dieses Gespräch fehlt die Zuordnung zu einem Vinted-Angebot.',
    );
    expect(element.textContent).not.toContain('missing_transaction');
    expect(
      [...element.querySelectorAll('app-badge')].map((badge) => badge.textContent?.trim()),
    ).not.toContain('Angebot gesendet');
  });
});
afterEach(() => TestBed.resetTestingModule());
async function render() {
  const fixture = TestBed.createComponent(VintedFavoriteMessagesComponent);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}
async function settle(
  fixture: ReturnType<typeof TestBed.createComponent<VintedFavoriteMessagesComponent>>,
) {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  fixture.detectChanges();
}
describe('Favorite message account and activation lifecycle', () => {
  it('activates cloud rules with explicit account approval without loading the extension', async () => {
    account.set({ ...connection, executionMode: 'cloud' });
    const fixture = await render();
    fixture.componentInstance.form.controls.enabled.setValue(true);
    dialog.frage.mockResolvedValueOnce(true);
    await fixture.componentInstance.save();
    expect(TestBed.inject(VintedLocalExtensionStore).loadConnection).not.toHaveBeenCalled();
    expect(TestBed.inject(VintedMessagingApiService).approveCloud).toHaveBeenCalledWith(
      expect.objectContaining(scope),
      '123',
    );
    expect(api.save).toHaveBeenCalledWith(settings, true, expect.anything());
    expect(dialog.frage.mock.calls[0][0].text).toContain('Cloud');
  });
  it('keeps old configurations without offers off and saves an optional fixed discount explicitly', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;
    expect(component.form.controls.offerEnabled.value).toBe(false);
    component.form.controls.offerEnabled.setValue(true);
    component.form.controls.offerType.setValue('amount');
    component.form.controls.offerValue.setValue(5);
    expect(component.offerPreviewPriceCents()).toBe(3500);
    expect(api.save).not.toHaveBeenCalled();
    await component.save();
    expect(api.save).toHaveBeenCalledWith(
      settings,
      false,
      expect.objectContaining({ offer: { type: 'amount', value: 5 } }),
    );
    expect(dialog.frage).not.toHaveBeenCalled();
  });
  it('calculates percentages and rejects invalid discounts without silently changing them', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;
    component.form.controls.offerEnabled.setValue(true);
    component.form.controls.offerType.setValue('percentage');
    component.form.controls.offerValue.setValue(10);
    expect(component.offerPreviewPriceCents()).toBe(3600);
    for (const invalid of [0, -1, 0.99, 50.01, 5.555, Number.NaN, Number.POSITIVE_INFINITY]) {
      component.form.controls.offerValue.setValue(invalid);
      await component.save();
      expect(api.save).not.toHaveBeenCalled();
      expect(component.error()).toContain('Nachlass');
      expect(component.form.controls.offerValue.value).toBe(invalid);
    }
    component.form.controls.offerType.setValue('amount');
    component.form.controls.offerValue.setValue(25);
    expect(component.offerPreviewPriceCents()).toBeNull();
    expect(component.form.controls.offerValue.value).toBe(25);
  });
  it('loads saved offer settings, retains dirty offer edits and resets offers when switching to an old account config', async () => {
    const config = {
      templates: ['Text'],
      rules: [],
      delayMinutes: 0,
      timezone: 'Europe/Berlin' as const,
      offer: { type: 'percentage' as const, value: 12.5 },
    };
    api.read.mockResolvedValue({ ...settings, config });
    const fixture = await render();
    const component = fixture.componentInstance;
    expect(component.form.controls.offerEnabled.value).toBe(true);
    expect(component.form.controls.offerType.value).toBe('percentage');
    expect(component.form.controls.offerValue.value).toBe(12.5);
    component.form.controls.offerValue.setValue(15);
    component.form.markAsDirty();
    await component.reload(true);
    expect(component.form.controls.offerValue.value).toBe(15);
    api.read.mockResolvedValue({
      ...settings,
      connectionId: 'account-b',
      config: { ...config, offer: undefined },
    });
    account.set({ ...connection, connectionId: 'account-b' });
    await settle(fixture);
    expect(component.form.controls.offerEnabled.value).toBe(false);
    expect(component.form.controls.offerValue.value).toBe(5);
    component.form.controls.offerEnabled.setValue(true);
    component.form.controls.offerValue.setValue(10);
    component.form.controls.offerEnabled.setValue(false);
    await component.save();
    expect(api.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ connectionId: 'account-b' }),
      false,
      expect.objectContaining({ offer: null }),
    );
  });
  it('never activates while editing and asks before the first enabled save', async () => {
    const fixture = await render();
    fixture.componentInstance.form.controls.enabled.setValue(true);
    expect(api.save).not.toHaveBeenCalled();
    await fixture.componentInstance.save();
    expect(dialog.frage).toHaveBeenCalledOnce();
    expect(api.save).not.toHaveBeenCalled();
    dialog.frage.mockResolvedValueOnce(true);
    await fixture.componentInstance.save();
    expect(api.save).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.settings()?.enabled).toBe(true);
  });
  it('keeps dirty edits and the original version when the background journal changes', async () => {
    const fixture = await render();
    fixture.componentInstance.form.controls.templates.at(0).setValue('Mein eigener Text');
    fixture.componentInstance.form.markAsDirty();
    api.read.mockResolvedValueOnce({
      ...settings,
      version: 4,
      active: true,
      config: {
        templates: ['Anderer Text'],
        rules: [],
        delayMinutes: 0,
        timezone: 'Europe/Berlin',
      },
    });
    await fixture.componentInstance.reload(true);
    expect(fixture.componentInstance.form.controls.templates.at(0).value).toBe('Mein eigener Text');
    expect(fixture.componentInstance.settings()?.version).toBe(0);
    expect(fixture.componentInstance.settings()?.active).toBe(true);
  });
  it('asks again after a renewed grant even when send permission is already approved', async () => {
    const activeSettings = { ...settings, enabled: true, active: true, version: 3 };
    api.read.mockResolvedValue(activeSettings);
    const fixture = await render();
    fixture.componentInstance.form.controls.templates.at(0).setValue('Geänderter Text');
    api.read.mockResolvedValue({ ...activeSettings, active: false });
    await fixture.componentInstance.save();
    expect(dialog.frage).toHaveBeenCalledOnce();
    expect(api.save).not.toHaveBeenCalled();
    dialog.frage.mockResolvedValueOnce(true);
    await fixture.componentInstance.save();
    expect(api.save).toHaveBeenCalledOnce();
  });
  it('does not reset edits after a refreshed account record with the same scope', async () => {
    const fixture = await render();
    fixture.componentInstance.form.controls.templates.at(0).setValue('Mein Text');
    account.set({ ...connection, lastSyncedAt: '2026-10-05T18:00:00Z' });
    await settle(fixture);
    expect(fixture.componentInstance.form.controls.templates.at(0).value).toBe('Mein Text');
    expect(api.read).toHaveBeenCalledOnce();
  });
  it('drops a pending save after account switch or logout', async () => {
    for (const change of ['account', 'logout']) {
      const fixture = await render();
      let finish: (saved: FavoriteMessageSettings) => void = () => undefined;
      api.save.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const saving = fixture.componentInstance.save();
      if (change === 'account') {
        api.read.mockResolvedValueOnce({ ...settings, connectionId: 'account-b' });
        account.set({ ...connection, connectionId: 'account-b' });
      } else user.set(null);
      await settle(fixture);
      finish({ ...settings, enabled: true, active: true, version: 1 });
      await saving;
      expect(fixture.componentInstance.settings()?.enabled).not.toBe(true);
      fixture.destroy();
      account.set(connection);
      user.set({ id: 'user-a' });
    }
  });
});

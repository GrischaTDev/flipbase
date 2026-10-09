import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedNegotiationApiService } from '../../services/vinted-negotiation-api.service';
import { createDefaultNegotiationConfig } from '../../models/vinted-negotiation';
import { VintedNegotiationComponent } from './vinted-negotiation.component';
const account = signal({
  workspaceId: 'workspace',
  connectionId: 'account',
  externalAccountId: '123',
  executionMode: 'cloud',
});
const workspace = signal({ id: 'workspace', archived_at: null });
const settings = {
  ...account(),
  enabled: false,
  active: false,
  version: 2,
  config: createDefaultNegotiationConfig(),
  events: [],
};
let api: { read: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
let restoreRendering: () => void = () => undefined;
beforeAll(async () => {
  restoreRendering = await prepareMarketplaceRendering([
    {
      type: VintedNegotiationComponent,
      path: 'src/app/features/marketplaces/components/vinted-negotiation/vinted-negotiation.component.ts',
    },
    ...[
      { type: CardComponent, name: 'card' },
      { type: ButtonComponent, name: 'button' },
      { type: BadgeComponent, name: 'badge' },
      { type: TextFieldComponent, name: 'text-field' },
      { type: NumberInputComponent, name: 'number-input' },
      { type: CustomCheckboxComponent, name: 'custom-checkbox' },
      { type: CustomSelectComponent, name: 'custom-select' },
      { type: NoticeBannerComponent, name: 'notice-banner' },
    ].map(({ type, name }) => ({
      type,
      path: `src/app/shared/components/${name}/${name}.component.ts`,
    })),
  ]);
});
afterAll(() => restoreRendering());
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  TestBed.tick();
}
beforeEach(() => {
  account.set({
    workspaceId: 'workspace',
    connectionId: 'account',
    externalAccountId: '123',
    executionMode: 'cloud',
  });
  workspace.set({ id: 'workspace', archived_at: null });
  api = {
    read: vi.fn().mockResolvedValue(settings),
    save: vi.fn().mockImplementation(async (_settings, enabled, config) => ({
      ...settings,
      enabled,
      config,
      version: 3,
    })),
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MarketplaceAccountStore,
        useValue: { selectedConnection: account, canManage: () => true },
      },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user' }) } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: VintedNegotiationApiService, useValue: api },
    ],
  });
});
afterEach(() => TestBed.resetTestingModule());
describe('Verhandlungseinstellungen', () => {
  beforeEach(() => {
    TestBed.overrideComponent(VintedNegotiationComponent, {
      set: { template: '', templateUrl: undefined, imports: [] },
    });
  });
  it('bewahrt beim manuellen Verlaufabruf dirty Felder, Struktur, Konflikt und Einstellungsrevision', async () => {
    const component = TestBed.createComponent(VintedNegotiationComponent).componentInstance;
    await settle();
    component.form.controls.discountValue.setValue(15);
    component.addStep('accepted');
    component.messageForms.accepted.at(0).controls.templates.at(0).setValue('Mein Entwurf');
    api.save.mockRejectedValue(new Error('Versionskonflikt'));
    await component.save();
    const events = [{ id: 'job', action: 'counter', state: 'sent' }];
    api.read.mockResolvedValue({ ...settings, version: 8, active: true, events });
    await component.reload();
    expect(component.form.controls.discountValue.value).toBe(15);
    expect(component.messageForms.accepted.at(0).controls.templates.at(0).value).toBe(
      'Mein Entwurf',
    );
    expect(component.form.dirty).toBe(true);
    expect(component.settings()).toMatchObject({ version: 2, active: true, events });
    expect(component.error()).toBe('Versionskonflikt');
    await component.save();
    expect(api.save.mock.calls[1][0].version).toBe(2);
  });
  it('rechnet individuelle Minuten für allgemeine und Nachrichtenwartezeit um und zeigt gespeicherte Werte wieder an', async () => {
    const component = TestBed.createComponent(VintedNegotiationComponent).componentInstance;
    await settle();
    component.chooseDelay('custom');
    component.chooseDelayUnit(component.form.controls.delaySeconds, 'minutes');
    component.changeDelay(component.form.controls.delaySeconds, 7);
    component.addStep('accepted');
    const step = component.messageForms.accepted.at(0);
    step.controls.templates.at(0).setValue('Danke');
    component.chooseDelayUnit(step.controls.delaySeconds, 'minutes');
    component.changeDelay(step.controls.delaySeconds, 3);
    await component.save();
    expect(api.save.mock.calls[0][2]).toMatchObject({
      delaySeconds: 420,
      messages: { accepted: [{ delaySeconds: 180 }] },
    });
    expect(component.delayUnit(component.form.controls.delaySeconds)).toBe('minutes');
    expect(component.delayAmount(component.form.controls.delaySeconds)).toBe(7);
    const savedStep = component.messageForms.accepted.at(0);
    expect(component.delayAmount(savedStep.controls.delaySeconds)).toBe(3);
    component.chooseDelayUnit(savedStep.controls.delaySeconds, 'seconds');
    expect(component.delayAmount(savedStep.controls.delaySeconds)).toBe(180);
  });
  it('hält die Ganzsekunden- und Siebentagegrenze in beiden individuellen Zeiteinheiten ein', async () => {
    const component = TestBed.createComponent(VintedNegotiationComponent).componentInstance;
    await settle();
    const control = component.form.controls.delaySeconds;
    component.chooseDelayUnit(control, 'minutes');
    for (const invalid of [-1, 10081, 0.001]) {
      component.changeDelay(control, invalid);
      await component.save();
    }
    expect(api.save).not.toHaveBeenCalled();
    component.changeDelay(control, 10080);
    await component.save();
    expect(api.save.mock.calls[0][2].delaySeconds).toBe(604800);
    component.chooseDelayUnit(control, 'seconds');
    component.changeDelay(control, 604801);
    await component.save();
    expect(api.save).toHaveBeenCalledOnce();
    component.addStep('accepted');
    const step = component.messageForms.accepted.at(0);
    step.controls.templates.at(0).setValue('Danke');
    component.changeDelay(control, 1);
    component.chooseDelayUnit(step.controls.delaySeconds, 'minutes');
    component.changeDelay(step.controls.delaySeconds, 10081);
    await component.save();
    expect(api.save).toHaveBeenCalledOnce();
  });
  it('übernimmt schnelle Wartezeiten und lässt eine individuelle Eingabe zu', async () => {
    const component = TestBed.createComponent(VintedNegotiationComponent).componentInstance;
    await settle();
    component.chooseDelay('60');
    expect(component.form.controls.delaySeconds.value).toBe(60);
    component.chooseDelay('custom');
    expect(component.selectedDelay()).toBe('custom');
    component.form.controls.delaySeconds.setValue(90);
    await component.save();
    expect(api.save.mock.calls[0][2].delaySeconds).toBe(90);
  });
  it('bewahrt strukturelle Formularänderungen beim Hintergrundabruf und akzeptiert centgenaue Bereichsgrenzen', async () => {
    const component = TestBed.createComponent(VintedNegotiationComponent).componentInstance;
    await settle();
    component.addBand();
    component.form.controls.priceBands.at(0).controls.upTo.setValue(19.99);
    expect(component.config().priceBands[0].upToCents).toBe(1999);
    await component.reload(true);
    expect(component.form.controls.priceBands.length).toBe(1);
    component.removeBand(0);
    expect(component.form.dirty).toBe(true);
    await component.reload(true);
    expect(component.form.controls.priceBands.length).toBe(0);
  });
  it('speichert Alternativen und Folgen getrennt, Kauftexte unabhängig und bewahrt buyer_accepted', async () => {
    const retained = [{ templates: ['Unverändert'], delaySeconds: 12 }];
    api.read.mockResolvedValue({
      ...settings,
      config: {
        ...settings.config,
        messages: { ...settings.config.messages, buyer_accepted: retained },
      },
    });
    const component = TestBed.createComponent(VintedNegotiationComponent).componentInstance;
    await settle();
    component.addStep('purchased');
    const first = component.messageForms.purchased.at(0);
    first.controls.templates.at(0).setValue('Danke');
    component.addAlternative(first);
    first.controls.templates.at(1).setValue('Vielen Dank');
    component.addStep('purchased');
    const next = component.messageForms.purchased.at(1);
    next.controls.templates.at(0).setValue('Versand folgt');
    next.controls.delaySeconds.setValue(60);
    component.form.controls.purchaseEnabled.setValue(true);
    await component.save();
    expect(api.save.mock.calls[0][1]).toBe(false);
    expect(api.save.mock.calls[0][2]).toMatchObject({
      purchaseEnabled: true,
      messages: {
        purchased: [
          { templates: ['Danke', 'Vielen Dank'], delaySeconds: 0 },
          { templates: ['Versand folgt'], delaySeconds: 60 },
        ],
        buyer_accepted: retained,
      },
    });
  });
  it('verwirft eine verspätete Antwort nach Konto- oder Workspacewechsel', async () => {
    let resolve: (response: typeof settings) => void = () => undefined;
    api.read.mockImplementationOnce(
      () =>
        new Promise((complete) => {
          resolve = complete;
        }),
    );
    const component = TestBed.createComponent(VintedNegotiationComponent).componentInstance;
    await settle();
    account.update((current) => ({ ...current, connectionId: 'other' }));
    api.read.mockResolvedValue({ ...settings, connectionId: 'other' });
    await settle();
    resolve(settings);
    await settle();
    expect(component.settings()?.connectionId).toBe('other');
    workspace.set({ id: 'foreign', archived_at: null });
    await settle();
    expect(component.settings()).toBeNull();
    await component.save();
    expect(api.save).not.toHaveBeenCalled();
  });
  it('sperrt doppelte Speicherung, meldet Konflikte und behält Formwerte', async () => {
    const component = TestBed.createComponent(VintedNegotiationComponent).componentInstance;
    await settle();
    component.form.controls.discountValue.setValue(15);
    api.save.mockRejectedValue(new Error('Versionskonflikt'));
    await Promise.all([component.save(), component.save()]);
    expect(api.save).toHaveBeenCalledOnce();
    expect(component.error()).toBe('Versionskonflikt');
    expect(component.form.controls.discountValue.value).toBe(15);
  });
  it('validiert Stufen vor dem Speichern und deaktiviert ohne Kaufautomatik zu ändern', async () => {
    const component = TestBed.createComponent(VintedNegotiationComponent).componentInstance;
    await settle();
    component.form.controls.stages.at(2).setValue(80);
    await component.save();
    expect(api.save).not.toHaveBeenCalled();
    component.form.controls.stages.at(2).setValue(100);
    component.form.controls.enabled.setValue(false);
    component.form.controls.purchaseEnabled.setValue(true);
    await component.save();
    expect(api.save.mock.calls[0][1]).toBe(false);
    expect(api.save.mock.calls[0][2].purchaseEnabled).toBe(true);
  });
});

describe('Gerenderter Verhandlungsverlauf', () => {
  async function renderResult(state: 'outcome_unknown' | 'failed') {
    api.read.mockResolvedValue({
      ...settings,
      events: [
        {
          id: 'job',
          action: 'counter',
          state,
          errorCode: 'timeout',
          createdAt: '2026-10-09T10:00:00Z',
        },
      ],
    });
    const fixture = TestBed.createComponent(VintedNegotiationComponent);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    return element.textContent?.replace(/\s+/g, ' ');
  }
  it('bewahrt bei unbekanntem Ausgang mit Fehlercode die Unsicherheit statt Nichtausführung zu behaupten', async () => {
    const text = await renderResult('outcome_unknown');
    expect(text).toContain('Ausgang unklar');
    expect(text).toContain('Die Ausführung konnte nicht bestätigt werden.');
    expect(text).toContain('wiederhole die Aktion nicht ungeprüft');
    expect(text).not.toContain('Diese Aktion konnte nicht ausgeführt werden.');
    expect(api.save).not.toHaveBeenCalled();
  });
  it('zeigt beim endgültigen Scheitern mit Fehlercode den sicheren Fehlerhinweis', async () => {
    const text = await renderResult('failed');
    expect(text).toContain('Fehlgeschlagen');
    expect(text).toContain('Diese Aktion konnte nicht ausgeführt werden.');
    expect(text).not.toContain('Die Ausführung konnte nicht bestätigt werden.');
    expect(api.save).not.toHaveBeenCalled();
  });
});

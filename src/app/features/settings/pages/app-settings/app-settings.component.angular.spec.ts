import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { AppDisplayPreferencesService } from '../../../../core/services/app-display-preferences.service';
import { AppSettingsComponent } from './app-settings.component';

let user = signal({ id: 'user-a' });
let preferences: {
  actionOverviewEnabled: ReturnType<typeof signal<boolean>>;
  workspaceSwitcherEnabled: ReturnType<typeof signal<boolean>>;
  saving: ReturnType<typeof signal<boolean>>;
  error: ReturnType<typeof signal<string | null>>;
  save: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  user = signal({ id: 'user-a' });
  preferences = {
    actionOverviewEnabled: signal(false),
    workspaceSwitcherEnabled: signal(true),
    saving: signal(false),
    error: signal(null),
    save: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: AppDisplayPreferencesService, useValue: preferences },
    ],
  });
});
afterEach(() => TestBed.resetTestingModule());
function create() {
  const component = TestBed.runInInjectionContext(() => new AppSettingsComponent());
  TestBed.tick();
  return component;
}
describe('Persönliche App-Einstellung speichern', () => {
  it('wiederholt nach Teilfehlern ausschließlich die geänderte Einstellung', () => {
    const component = create();
    component.form.controls.workspaceSwitcherEnabled.setValue(false);
    component.form.controls.workspaceSwitcherEnabled.markAsDirty();
    component.save();
    preferences.saving.set(true);
    TestBed.tick();
    preferences.error.set('offline');
    preferences.saving.set(false);
    TestBed.tick();
    component.save();
    expect(preferences.save.mock.calls).toEqual([
      [{ workspaceSwitcherEnabled: false }],
      [{ workspaceSwitcherEnabled: false }],
    ]);
  });
  it('speichert nur geänderte Felder und lässt unberührte Auswahl bei spätem Lesen nachziehen', () => {
    const component = create();
    component.form.controls.enabled.setValue(true);
    component.form.controls.enabled.markAsDirty();
    preferences.workspaceSwitcherEnabled.set(false);
    TestBed.tick();
    expect(component.form.controls.enabled.value).toBe(true);
    expect(component.form.controls.workspaceSwitcherEnabled.value).toBe(false);
    component.save();
    expect(preferences.save).toHaveBeenCalledWith({ actionOverviewEnabled: true });
  });
  it('bereitet das Ausblenden nur als Entwurf vor und speichert beide Änderungen gemeinsam', () => {
    const component = create();
    component.form.controls.workspaceSwitcherEnabled.setValue(false);
    component.form.controls.workspaceSwitcherEnabled.markAsDirty();
    expect(preferences.save).not.toHaveBeenCalled();
    component.form.controls.enabled.setValue(true);
    component.form.controls.enabled.markAsDirty();
    component.save();
    expect(preferences.save).toHaveBeenCalledWith({
      actionOverviewEnabled: true,
      workspaceSwitcherEnabled: false,
    });
  });
  it('speichert eine geänderte Auswahl erst mit dem Speichern-Aufruf', () => {
    const component = create();
    component.form.controls.enabled.setValue(true);
    component.form.controls.enabled.markAsDirty();
    expect(preferences.save).not.toHaveBeenCalled();
    component.save();
    expect(preferences.save).toHaveBeenCalledWith({ actionOverviewEnabled: true });
  });
  it('behält einen Entwurf bei verzögertem Lesen und setzt ihn nach erfolgreichem Speichern zurück', () => {
    const component = create();
    component.form.controls.enabled.setValue(true);
    component.form.controls.enabled.markAsDirty();
    preferences.actionOverviewEnabled.set(true);
    preferences.saving.set(true);
    TestBed.tick();
    expect(component.form.dirty).toBe(true);
    preferences.saving.set(false);
    TestBed.tick();
    expect(component.form.pristine).toBe(true);
    expect(component.form.controls.enabled.value).toBe(true);
  });
  it('behält die Auswahl bei Fehlern und verwirft sie bei Nutzerwechsel', () => {
    const component = create();
    component.form.controls.enabled.setValue(true);
    component.form.controls.enabled.markAsDirty();
    preferences.saving.set(true);
    TestBed.tick();
    preferences.error.set('offline');
    preferences.saving.set(false);
    TestBed.tick();
    expect(component.form.dirty).toBe(true);
    user.set({ id: 'user-b' });
    component.save();
    expect(preferences.save).not.toHaveBeenCalled();
    TestBed.tick();
    expect(component.form.pristine).toBe(true);
    expect(component.form.controls.enabled.value).toBe(false);
  });
});

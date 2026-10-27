import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { ActionOverviewPreferencesService } from '../../../../core/services/action-overview-preferences.service';
import { AppSettingsComponent } from './app-settings.component';

let user = signal({ id: 'user-a' });
let preferences: {
  enabled: ReturnType<typeof signal<boolean>>;
  saving: ReturnType<typeof signal<boolean>>;
  error: ReturnType<typeof signal<string | null>>;
  setEnabled: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  user = signal({ id: 'user-a' });
  preferences = {
    enabled: signal(false),
    saving: signal(false),
    error: signal(null),
    setEnabled: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: ActionOverviewPreferencesService, useValue: preferences },
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
  it('speichert eine geänderte Auswahl erst mit dem Speichern-Aufruf', () => {
    const component = create();
    component.form.controls.enabled.setValue(true);
    component.form.markAsDirty();
    expect(preferences.setEnabled).not.toHaveBeenCalled();
    component.save();
    expect(preferences.setEnabled).toHaveBeenCalledWith(true);
  });
  it('behält einen Entwurf bei verzögertem Lesen und setzt ihn nach erfolgreichem Speichern zurück', () => {
    const component = create();
    component.form.controls.enabled.setValue(true);
    component.form.markAsDirty();
    preferences.enabled.set(true);
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
    component.form.markAsDirty();
    preferences.saving.set(true);
    TestBed.tick();
    preferences.error.set('offline');
    preferences.saving.set(false);
    TestBed.tick();
    expect(component.form.dirty).toBe(true);
    user.set({ id: 'user-b' });
    component.save();
    expect(preferences.setEnabled).not.toHaveBeenCalled();
    TestBed.tick();
    expect(component.form.pristine).toBe(true);
    expect(component.form.controls.enabled.value).toBe(false);
  });
});

import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AccountSettingsComponent } from './account-settings.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

const inputSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

const profile = signal<{ full_name: string } | null>({ full_name: 'Grischa Tänzer' });
const currentUser = signal<{ email: string } | null>({ email: 'test@test.de' });
const updateProfile = vi.fn();
const changePassword = vi.fn();
const signOutEverywhere = vi.fn();
const confirm = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

describe('AccountSettingsComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const fileName = url.replace(/^\.\//u, '');
      const matches: string[] = [];
      for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
      if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
      return readFile(matches[0], 'utf8');
    });

    registerSignalInputs(TextFieldComponent, [
      'id',
      'label',
      'type',
      'revealable',
      'autocomplete',
      'required',
      'error',
      'helpText',
    ]);
    registerSignalInputs(ButtonComponent, [
      'variant',
      'size',
      'disabled',
      'loading',
      'type',
      'formId',
      'icon',
      'ariaLabel',
    ]);
    registerSignalInputs(CardComponent, ['padding', 'rounded']);
    registerSignalInputs(ModalShellComponent, [
      'title',
      'subtitle',
      'size',
      'presentation',
      'hasFooter',
    ]);
  });

  afterAll(() => {
    for (const [component, snapshot] of inputSnapshots) {
      const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
    }
  });

  beforeEach(() => {
    profile.set({ full_name: 'Grischa Tänzer' });
    currentUser.set({ email: 'test@test.de' });
    updateProfile.mockReset().mockResolvedValue({ error: null, reportedBySyncStatus: false });
    changePassword.mockReset().mockResolvedValue({ error: null, reportedBySyncStatus: false });
    signOutEverywhere.mockReset().mockResolvedValue(undefined);
    confirm.mockReset().mockResolvedValue(true);
    toastSuccess.mockReset();
    toastError.mockReset();

    TestBed.configureTestingModule({
      imports: [AccountSettingsComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            profile,
            currentUser,
            userName: () => profile()?.full_name ?? currentUser()?.email ?? '',
            aktualisiereProfil: updateProfile,
            changePassword,
            abmeldenUeberall: signOutEverywhere,
          },
        },
        { provide: ConfirmDialogService, useValue: { frage: confirm } },
        {
          provide: ToastService,
          useValue: { success: toastSuccess, error: toastError },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('gliedert das Konto in Profil, Sicherheit und Sitzungen', () => {
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const headings = [...host.querySelectorAll('h2')].map((heading) => heading.textContent?.trim());

    expect(headings).toEqual(['Profil', 'Sicherheit', 'Sitzungen']);
    expect(host.querySelectorAll('app-card')).toHaveLength(3);
    expect(host.querySelector('[data-account-avatar]')?.textContent?.trim()).toBe('GT');
    expect(host.textContent).toContain('test@test.de');
    expect(host.textContent).toContain('Dieser Browser');
    expect(host.textContent).toContain('Zwei-Faktor-Authentifizierung');
    expect(host.textContent).toContain('Noch nicht eingerichtet');
    expect(
      [...host.querySelectorAll('h2')].every(
        (heading) => !heading.className.match(/uppercase|tracking-wider/u),
      ),
    ).toBe(true);
    expect(host.querySelector('[data-two-factor-action]')).toBeNull();
  });

  it('aktualisiert ein unberührtes Profil, überschreibt aber keine laufende Eingabe', () => {
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.profileForm.controls.fullName.value).toBe('Grischa Tänzer');
    profile.set({ full_name: 'Neuer Servername' });
    fixture.detectChanges();
    expect(component.profileForm.controls.fullName.value).toBe('Neuer Servername');

    component.profileForm.controls.fullName.setValue('Meine Eingabe');
    component.profileForm.controls.fullName.markAsDirty();
    profile.set({ full_name: 'Noch ein Servername' });
    fixture.detectChanges();

    expect(component.profileForm.controls.fullName.value).toBe('Meine Eingabe');
  });

  it('speichert den Anzeigenamen weiter über den AuthService', async () => {
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();
    fixture.componentInstance.profileForm.controls.fullName.setValue('Grischa Neu');

    await fixture.componentInstance.onSaveProfile();

    expect(updateProfile).toHaveBeenCalledWith('Grischa Neu');
    expect(toastSuccess).toHaveBeenCalledWith('Profil wurde gespeichert.');
  });

  it('öffnet den Passwortdialog mit drei Passwortfeldern und passender Autovervollständigung', () => {
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();
    fixture.componentInstance.openPasswordModal();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-modal-shell')).not.toBeNull();
    expect(host.textContent).toContain('Passwort ändern');
    const fields = [...host.querySelectorAll('app-text-field')].filter((field) =>
      field.textContent?.includes('Passwort'),
    );
    expect(fields).toHaveLength(3);
    expect(fixture.componentInstance.passwordForm.controls.currentPassword.value).toBe('');
    expect(fixture.componentInstance.passwordForm.invalid).toBe(true);
  });

  it('blockiert kurze und nicht übereinstimmende neue Passwörter', () => {
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.openPasswordModal();

    component.passwordForm.setValue({
      currentPassword: 'alt-passwort',
      newPassword: 'kurz',
      confirmPassword: 'kurz',
    });
    expect(component.passwordForm.invalid).toBe(true);

    component.passwordForm.setValue({
      currentPassword: 'alt-passwort',
      newPassword: 'neues-passwort-123',
      confirmPassword: 'anderes-passwort-123',
    });
    expect(component.passwordForm.invalid).toBe(true);
    expect(component.passwordMismatch()).toBe(true);
  });

  it('behält den Passwortdialog samt Eingaben bei einem Auth-Fehler offen', async () => {
    changePassword.mockResolvedValue({
      error: new Error('Das aktuelle Passwort ist nicht korrekt.'),
      reportedBySyncStatus: false,
    });
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.openPasswordModal();
    component.passwordForm.setValue({
      currentPassword: 'falsch',
      newPassword: 'neues-passwort-123',
      confirmPassword: 'neues-passwort-123',
    });

    await component.onChangePassword();
    fixture.detectChanges();

    expect(changePassword).toHaveBeenCalledWith('falsch', 'neues-passwort-123');
    expect(component.isPasswordModalOpen()).toBe(true);
    expect(component.passwordForm.controls.currentPassword.value).toBe('falsch');
    expect(component.passwordError()).toBe('Das aktuelle Passwort ist nicht korrekt.');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('schließt und leert den Passwortdialog erst nach erfolgreicher Änderung', async () => {
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.openPasswordModal();
    component.passwordForm.setValue({
      currentPassword: 'alt-passwort',
      newPassword: 'neues-passwort-123',
      confirmPassword: 'neues-passwort-123',
    });

    await component.onChangePassword();

    expect(changePassword).toHaveBeenCalledWith('alt-passwort', 'neues-passwort-123');
    expect(component.isPasswordModalOpen()).toBe(false);
    expect(component.passwordForm.getRawValue()).toEqual({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    expect(toastSuccess).toHaveBeenCalledWith('Passwort wurde geändert.');
  });

  it('meldet nicht global ab, wenn die Bestätigung abgebrochen wird', async () => {
    confirm.mockResolvedValue(false);
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();

    await fixture.componentInstance.onSignOutEverywhere();

    expect(signOutEverywhere).not.toHaveBeenCalled();
  });

  it('meldet nach bestätigter Sicherheitsabfrage global ab', async () => {
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();

    await fixture.componentInstance.onSignOutEverywhere();

    expect(signOutEverywhere).toHaveBeenCalledTimes(1);
  });

  it('hat ohne und mit Passwortdialog keine schwerwiegenden Barrieren', async () => {
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();

    let result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
    expect(result.violations.filter((violation) => violation.impact === 'serious')).toEqual([]);

    fixture.componentInstance.openPasswordModal();
    fixture.detectChanges();
    result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
    expect(result.violations.filter((violation) => violation.impact === 'serious')).toEqual([]);
  });
});

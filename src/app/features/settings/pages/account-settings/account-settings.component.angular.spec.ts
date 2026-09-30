import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { glob, readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AccountSettingsComponent } from './account-settings.component';

const profile = signal<{ full_name: string } | null>({ full_name: 'Grischa Tänzer' });
const currentUser = signal<{ email: string } | null>({ email: 'test@test.de' });
const updateProfile = vi.fn(async () => ({ error: null, reportedBySyncStatus: false }));
const changePassword = vi.fn(async () => ({ error: null, reportedBySyncStatus: false }));
const signOutEverywhere = vi.fn(async () => undefined);
const askForConfirmation = vi.fn(async () => false);
const toastSuccess = vi.fn();
const toastError = vi.fn();

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
});

beforeEach(() => {
  profile.set({ full_name: 'Grischa Tänzer' });
  currentUser.set({ email: 'test@test.de' });
  updateProfile.mockReset().mockResolvedValue({ error: null, reportedBySyncStatus: false });
  changePassword.mockReset().mockResolvedValue({ error: null, reportedBySyncStatus: false });
  signOutEverywhere.mockReset().mockResolvedValue(undefined);
  askForConfirmation.mockReset().mockResolvedValue(false);
  toastSuccess.mockReset();
  toastError.mockReset();

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AccountSettingsComponent],
    providers: [
      {
        provide: AuthService,
        useValue: {
          profile,
          currentUser,
          userName: () => profile()?.full_name || currentUser()?.email?.split('@')[0] || '',
          aktualisiereProfil: updateProfile,
          changePassword,
          abmeldenUeberall: signOutEverywhere,
        },
      },
      {
        provide: ConfirmDialogService,
        useValue: { frage: askForConfirmation },
      },
      {
        provide: ToastService,
        useValue: { success: toastSuccess, error: toastError },
      },
    ],
  });
});

function createAccount() {
  const fixture = TestBed.createComponent(AccountSettingsComponent);
  fixture.detectChanges();
  return fixture;
}

function buttonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === text,
  );
  if (!button) throw new Error(`Button „${text}“ nicht gefunden`);
  return button;
}

function inputByLabel(host: HTMLElement, labelText: string): HTMLInputElement {
  const label = [...host.querySelectorAll<HTMLLabelElement>('label')].find(
    (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim().startsWith(labelText),
  );
  const id = label?.getAttribute('for');
  const input = id ? host.querySelector<HTMLInputElement>(`#${id}`) : null;
  if (!input) throw new Error(`Feld „${labelText}“ nicht gefunden`);
  return input;
}

function setInput(host: HTMLElement, label: string, value: string): void {
  const input = inputByLabel(host, label);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('AccountSettingsComponent', () => {
  it('gliedert das Konto in Profil, Sicherheit und Sitzungen', () => {
    const fixture = createAccount();
    const host = fixture.nativeElement as HTMLElement;
    const sectionTitles = [...host.querySelectorAll('h2')].map((heading) =>
      heading.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(sectionTitles).toEqual(['Profil', 'Sicherheit', 'Sitzungen']);
    expect(host.querySelectorAll('app-card')).toHaveLength(3);
    expect(host.querySelector('[data-account-avatar]')?.textContent?.trim()).toBe('GT');
    expect(host.textContent).toContain('test@test.de');
    expect(host.textContent).toContain('Dieser Browser');
    expect(host.textContent).toContain('Zwei-Faktor-Authentifizierung');
    expect(host.textContent).toContain('Noch nicht eingerichtet');

    for (const heading of host.querySelectorAll('h2')) {
      expect(heading.className).not.toMatch(/uppercase|tracking-wider/);
    }

    const primary = host.querySelector('app-button[variant="primary"]');
    const destructive = host.querySelector('app-button[variant="destructive"]');
    expect(primary?.textContent).toContain('Änderungen speichern');
    expect(destructive?.textContent).toContain('Von allen Geräten abmelden');
    expect(
      [...host.querySelectorAll('button, a')].some((element) =>
        element.textContent?.includes('Zwei-Faktor-Authentifizierung'),
      ),
    ).toBe(false);
  });

  it('aktualisiert ein unberührtes Profil, überschreibt aber keine laufende Eingabe', () => {
    const fixture = createAccount();
    const component = fixture.componentInstance;

    expect(component.profileForm.controls.fullName.value).toBe('Grischa Tänzer');

    profile.set({ full_name: 'Neuer Servername' });
    fixture.detectChanges();
    expect(component.profileForm.controls.fullName.value).toBe('Neuer Servername');

    component.profileForm.controls.fullName.setValue('Meine Eingabe');
    component.profileForm.controls.fullName.markAsDirty();
    profile.set({ full_name: 'Noch neuer Servername' });
    fixture.detectChanges();

    expect(component.profileForm.controls.fullName.value).toBe('Meine Eingabe');
  });

  it('speichert den Anzeigenamen über den bestehenden Profilweg', async () => {
    const fixture = createAccount();
    const component = fixture.componentInstance;

    component.profileForm.controls.fullName.setValue('Grischa T.');
    await component.onSaveProfile();

    expect(updateProfile).toHaveBeenCalledWith('Grischa T.');
    expect(toastSuccess).toHaveBeenCalledWith('Profil wurde gespeichert.');
  });

  it('öffnet einen zentrierten Passwortdialog mit drei passend ausgezeichneten Feldern', () => {
    const fixture = createAccount();
    const host = fixture.nativeElement as HTMLElement;

    buttonByText(host, 'Passwort ändern').click();
    fixture.detectChanges();

    const modal = host.querySelector('app-modal-shell');
    expect(modal).not.toBeNull();
    expect(modal?.getAttribute('presentation')).toBe('center');

    const current = inputByLabel(host, 'Aktuelles Passwort');
    const next = inputByLabel(host, 'Neues Passwort');
    const confirm = inputByLabel(host, 'Neues Passwort wiederholen');

    expect(current.autocomplete).toBe('current-password');
    expect(next.autocomplete).toBe('new-password');
    expect(confirm.autocomplete).toBe('new-password');
    expect(current.parentElement?.querySelector('button[aria-label="Passwort anzeigen"]')).not.toBeNull();
  });

  it('blockiert ein zu kurzes oder nicht übereinstimmendes neues Passwort', () => {
    const fixture = createAccount();
    const host = fixture.nativeElement as HTMLElement;

    buttonByText(host, 'Passwort ändern').click();
    fixture.detectChanges();

    setInput(host, 'Aktuelles Passwort', 'alt-passwort');
    setInput(host, 'Neues Passwort', 'zu-kurz');
    setInput(host, 'Neues Passwort wiederholen', 'zu-kurz');
    fixture.detectChanges();
    expect(buttonByText(host, 'Passwort ändern').disabled).toBe(true);

    setInput(host, 'Neues Passwort', 'neues-passwort-123');
    setInput(host, 'Neues Passwort wiederholen', 'anderes-passwort-123');
    fixture.detectChanges();

    expect(buttonByText(host, 'Passwort ändern').disabled).toBe(true);
    expect(host.textContent).toContain('Passwörter stimmen nicht überein');
  });

  it('behält bei einem Auth-Fehler Dialog und Eingaben und zeigt die Fehlermeldung', async () => {
    changePassword.mockResolvedValueOnce({
      error: new Error('Das aktuelle Passwort ist nicht korrekt.'),
      reportedBySyncStatus: false,
    });
    const fixture = createAccount();
    const host = fixture.nativeElement as HTMLElement;

    buttonByText(host, 'Passwort ändern').click();
    fixture.detectChanges();
    setInput(host, 'Aktuelles Passwort', 'falsch');
    setInput(host, 'Neues Passwort', 'neues-passwort-123');
    setInput(host, 'Neues Passwort wiederholen', 'neues-passwort-123');
    fixture.detectChanges();

    buttonByText(host, 'Passwort ändern').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(changePassword).toHaveBeenCalledWith('falsch', 'neues-passwort-123');
    expect(host.querySelector('app-modal-shell')).not.toBeNull();
    expect(inputByLabel(host, 'Aktuelles Passwort').value).toBe('falsch');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Das aktuelle Passwort ist nicht korrekt.',
    );
  });

  it('schließt nach erfolgreicher Passwortänderung und bestätigt per Toast', async () => {
    const fixture = createAccount();
    const host = fixture.nativeElement as HTMLElement;

    buttonByText(host, 'Passwort ändern').click();
    fixture.detectChanges();
    setInput(host, 'Aktuelles Passwort', 'alt-passwort');
    setInput(host, 'Neues Passwort', 'neues-passwort-123');
    setInput(host, 'Neues Passwort wiederholen', 'neues-passwort-123');
    fixture.detectChanges();

    buttonByText(host, 'Passwort ändern').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(changePassword).toHaveBeenCalledWith('alt-passwort', 'neues-passwort-123');
    expect(host.querySelector('app-modal-shell')).toBeNull();
    expect(toastSuccess).toHaveBeenCalledWith('Passwort wurde geändert.');
  });

  it('meldet nur nach bestätigter Rückfrage auf allen Geräten ab', async () => {
    const fixture = createAccount();
    const component = fixture.componentInstance;

    askForConfirmation.mockResolvedValueOnce(false);
    await component.onSignOutEverywhere();
    expect(signOutEverywhere).not.toHaveBeenCalled();

    askForConfirmation.mockResolvedValueOnce(true);
    await component.onSignOutEverywhere();
    expect(signOutEverywhere).toHaveBeenCalledTimes(1);
  });

  it('hat geschlossen und mit Passwortdialog keine schwerwiegenden AXE-Befunde', async () => {
    const fixture = createAccount();
    const host = fixture.nativeElement as HTMLElement;

    let result = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);

    buttonByText(host, 'Passwort ändern').click();
    fixture.detectChanges();

    result = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  });
});

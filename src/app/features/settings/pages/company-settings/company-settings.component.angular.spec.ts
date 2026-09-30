import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CompanyProfileService } from '../../../../core/services/company-profile.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { CompanySettingsComponent } from './company-settings.component';

function profile(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'workspace-a',
    companyName: 'Wiehen Store',
    legalName: 'Grischa Tänzer',
    legalForm: 'sole_proprietorship' as const,
    email: 'hello@example.test',
    phone: '',
    website: '',
    street: 'Teststraße',
    houseNumber: '12',
    postalCode: '32289',
    city: 'Rödinghausen',
    countryCode: 'DE',
    mailingAddressEnabled: false,
    mailingStreet: null,
    mailingHouseNumber: null,
    mailingPostalCode: null,
    mailingCity: null,
    mailingCountryCode: null,
    taxNumber: '310/000/00000',
    vatId: null,
    taxOffice: '',
    federalState: 'Nordrhein-Westfalen',
    bankAccountHolder: 'Grischa Tänzer',
    bankName: 'Testbank',
    iban: 'DE12345678901234567890',
    bic: 'ABCDEFGH',
    logoPath: null,
    createdAt: '2026-09-30T10:00:00.000Z',
    updatedAt: '2026-09-30T10:00:00.000Z',
    ...overrides,
  };
}

function makeEnvironment(canEdit = true) {
  const activeWorkspace = signal({ id: 'workspace-a', name: 'Wiehen Store' });
  const companyProfile = signal(profile());
  const taxMode = signal<'diff_25a' | 'kleinunternehmer_19' | 'regular_19'>('diff_25a');
  const editable = signal(canEdit);
  const loadedWorkspaceId = signal<string | null>('workspace-a');
  const isLoading = signal(false);
  const loadError = signal<Error | null>(null);
  const logoUrl = signal<string | null>(null);
  const readiness = signal({ complete: true, missingFields: [] as string[] });
  const save = vi.fn(async () => ({ data: companyProfile(), error: null, reportedBySyncStatus: false }));
  const replaceLogo = vi.fn(async () => ({ data: companyProfile(), error: null, reportedBySyncStatus: false }));
  const removeLogo = vi.fn(async () => ({ data: companyProfile(), error: null, reportedBySyncStatus: false }));
  const load = vi.fn(async () => undefined);
  const release = vi.fn();
  const acquire = vi.fn(() => release);
  const toastSuccess = vi.fn();
  const toastError = vi.fn();

  TestBed.configureTestingModule({
    imports: [CompanySettingsComponent],
    providers: [
      {
        provide: CompanyProfileService,
        useValue: {
          profile: companyProfile,
          taxMode,
          canEdit: editable,
          loadedWorkspaceId,
          isLoading,
          loadError,
          logoUrl,
          readiness,
          save,
          replaceLogo,
          removeLogo,
          load,
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: activeWorkspace } },
      { provide: WorkspaceContextLockService, useValue: { acquire } },
      { provide: ToastService, useValue: { success: toastSuccess, error: toastError } },
    ],
  });

  const fixture = TestBed.createComponent(CompanySettingsComponent);
  fixture.detectChanges();
  return {
    fixture,
    companyProfile,
    taxMode,
    editable,
    isLoading,
    loadError,
    readiness,
    save,
    replaceLogo,
    removeLogo,
    load,
    acquire,
    release,
    toastSuccess,
    toastError,
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//u, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
});

describe('CompanySettingsComponent', () => {
  it('gliedert Unternehmensdaten in vier gleichrangige Karten', () => {
    const { fixture } = makeEnvironment();
    const host = fixture.nativeElement as HTMLElement;
    const headings = [...host.querySelectorAll('h2')].map((element) =>
      element.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(headings).toEqual([
      'Unternehmensprofil',
      'Geschäftsanschrift',
      'Steuerdaten',
      'Bankverbindung',
    ]);
    expect(host.querySelectorAll('app-card')).toHaveLength(4);
    expect(host.querySelector('app-card app-card')).toBeNull();
    for (const heading of host.querySelectorAll('h2')) {
      expect(heading.className).not.toMatch(/uppercase|tracking-wider/);
    }
  });

  it('zeigt Postanschrift nur nach Aktivierung', () => {
    const { fixture } = makeEnvironment();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).not.toContain('Postanschrift Straße');
    fixture.componentInstance.form.controls.mailingAddressEnabled.setValue(true);
    fixture.detectChanges();

    expect(host.textContent).toContain('Postanschrift Straße');
    expect(host.textContent).toContain('Postanschrift Ort');
  });

  it('zeigt Nicht-Admins dieselben Werte schreibgeschützt ohne Änderungsaktionen', () => {
    const { fixture } = makeEnvironment(false);
    const host = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.form.disabled).toBe(true);
    expect(host.textContent).toContain('Nur Inhaber und Administratoren können Unternehmensdaten ändern.');
    expect(host.textContent).not.toContain('Änderungen speichern');
    expect(host.textContent).not.toContain('Logo ändern');
  });

  it('sperrt den Workspace-Wechsel nur solange ungespeicherte Änderungen existieren', () => {
    const { fixture, acquire, release } = makeEnvironment();
    const component = fixture.componentInstance;

    component.form.controls.companyName.setValue('Wiehen Store Neu');
    fixture.detectChanges();
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(acquire).toHaveBeenCalledTimes(1);

    component.discard();
    fixture.detectChanges();
    expect(component.hasUnsavedChanges()).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('speichert Profil und Steuermodus gemeinsam und übernimmt erst den bestätigten Stand', async () => {
    const env = makeEnvironment();
    const component = env.fixture.componentInstance;
    component.form.controls.companyName.setValue('Neuer Name');
    component.form.controls.taxMode.setValue('kleinunternehmer_19');

    await component.save();

    expect(env.save).toHaveBeenCalledTimes(1);
    expect(env.save.mock.calls[0]?.[1]).toBe('kleinunternehmer_19');
    expect(env.toastSuccess).toHaveBeenCalledWith('Unternehmensdaten wurden gespeichert.');
  });

  it('behält Eingaben bei einem Speicherfehler und bleibt dirty', async () => {
    const env = makeEnvironment();
    env.save.mockResolvedValueOnce({
      data: null,
      error: new Error('Speichern fehlgeschlagen'),
      reportedBySyncStatus: false,
    });
    const component = env.fixture.componentInstance;
    component.form.controls.companyName.setValue('Nicht verloren');

    await component.save();

    expect(component.form.controls.companyName.value).toBe('Nicht verloren');
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(env.toastError).toHaveBeenCalled();
  });

  it('zeigt Ladefehler mit Retry statt eines leeren editierbaren Formulars', async () => {
    const env = makeEnvironment();
    env.loadError.set(new Error('Netzwerk'));
    env.companyProfile.set(null as never);
    env.fixture.detectChanges();
    const host = env.fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Unternehmensdaten konnten nicht geladen werden');
    expect(host.textContent).toContain('Erneut versuchen');

    await env.fixture.componentInstance.retryLoad();
    expect(env.load).toHaveBeenCalledWith('workspace-a');
  });

  it('zeigt Rechnungsbereitschaft als Status ohne das Speichern zu blockieren', () => {
    const env = makeEnvironment();
    env.readiness.set({
      complete: false,
      missingFields: ['legalName', 'street', 'taxIdentifier'],
    });
    env.fixture.componentInstance.form.controls.companyName.setValue('Speicherbar');
    env.fixture.detectChanges();
    const host = env.fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Rechnungsdaten unvollständig');
    expect(host.textContent).toContain('3 Angaben fehlen');
    expect(env.fixture.componentInstance.form.valid).toBe(true);
  });

  it('verwendet für Logos nur den versteckten Dateiupload und den Service', async () => {
    const env = makeEnvironment();
    const host = env.fixture.nativeElement as HTMLElement;
    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');

    expect(fileInput?.accept).toBe('image/png,image/jpeg,image/webp');
    expect(fileInput?.classList.contains('sr-only')).toBe(true);
    expect(host.textContent).toContain('Logo ändern');

    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(fileInput!, 'files', { value: [file], configurable: true });
    fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await env.fixture.whenStable();

    expect(env.replaceLogo).toHaveBeenCalledWith(file);
  });
});

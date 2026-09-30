import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaxMode } from '../models/flipbase.models';
import {
  CompanyProfileInput,
  CompanySettingsState,
  WorkspaceCompanyProfile,
  calculateCompanyReadiness,
} from '../models/company-profile.models';
import { SyncStatusService } from './sync-status.service';
import { CompanyProfileService } from './company-profile.service';

const workspaceA = '11111111-1111-4111-8111-111111111111';
const workspaceB = '22222222-2222-4222-8222-222222222222';

const profileRow = (workspaceId: string, overrides: Record<string, unknown> = {}) => ({
  workspace_id: workspaceId,
  company_name: 'Wiehen Store',
  legal_name: 'Grischa Tänzer',
  legal_form: 'sole_proprietorship',
  email: 'hello@example.test',
  phone: null,
  website: null,
  street: 'Testweg',
  house_number: '5',
  postal_code: '32289',
  city: 'Rödinghausen',
  country_code: 'DE',
  mailing_address_enabled: false,
  mailing_street: null,
  mailing_house_number: null,
  mailing_postal_code: null,
  mailing_city: null,
  mailing_country_code: null,
  tax_number: '123/456/789',
  vat_id: null,
  tax_office: null,
  federal_state: 'Nordrhein-Westfalen',
  bank_account_holder: 'Grischa Tänzer',
  bank_name: 'Testbank',
  iban: 'DE12345678901234567890',
  bic: 'ABCDDEFF',
  logo_path: null,
  created_at: '2026-09-30T10:00:00.000Z',
  updated_at: '2026-09-30T10:00:00.000Z',
  ...overrides,
});

function state(
  workspaceId: string,
  overrides: Record<string, unknown> = {},
  taxMode: TaxMode = 'kleinunternehmer_19',
  canEdit = true,
) {
  return {
    profile: profileRow(workspaceId, overrides),
    tax_mode: taxMode,
    can_edit: canEdit,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createService() {
  const currentWorkspace = signal<{ id: string } | null>({ id: workspaceA });
  const rpc = vi.fn();
  const upload = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const createSignedUrl = vi.fn(async (path: string) => ({
    data: { signedUrl: `https://signed.example/${path}` },
    error: null,
  }));
  const profile = signal<WorkspaceCompanyProfile | null>(null);
  const taxMode = signal<TaxMode>('diff_25a');
  const canEdit = signal(false);
  const loadedWorkspaceId = signal<string | null>(null);
  const isLoading = signal(false);
  const loadError = signal<Error | null>(null);
  const logoUrl = signal<string | null>(null);

  const service = Object.create(CompanyProfileService.prototype) as CompanyProfileService;
  Object.assign(service, {
    supabase: {
      client: {
        rpc,
        storage: {
          from: vi.fn(() => ({ upload, remove, createSignedUrl })),
        },
      },
    },
    syncStatus: new SyncStatusService(),
    workspaceService: { currentWorkspace },
    profile,
    taxMode,
    canEdit,
    loadedWorkspaceId,
    isLoading,
    loadError,
    logoUrl,
    loadVersion: 0,
    logoVersion: 0,
    readiness: computed(() => calculateCompanyReadiness(profile(), taxMode())),
  });

  return {
    service,
    currentWorkspace,
    rpc,
    upload,
    remove,
    createSignedUrl,
  };
}

function fullInput(overrides: Partial<CompanyProfileInput> = {}): CompanyProfileInput {
  return {
    companyName: 'Wiehen Store',
    legalName: 'Grischa Tänzer',
    legalForm: 'sole_proprietorship',
    email: 'hello@example.test',
    phone: '',
    website: '',
    street: 'Testweg',
    houseNumber: '5',
    postalCode: '32289',
    city: 'Rödinghausen',
    countryCode: 'de',
    mailingAddressEnabled: false,
    mailingStreet: '',
    mailingHouseNumber: '',
    mailingPostalCode: '',
    mailingCity: '',
    mailingCountryCode: '',
    taxNumber: '123/456/789',
    vatId: '',
    taxOffice: '',
    federalState: 'Nordrhein-Westfalen',
    bankAccountHolder: 'Grischa Tänzer',
    bankName: 'Testbank',
    iban: 'de12 3456 7890 1234 5678 90',
    bic: 'abcd de ff',
    ...overrides,
  };
}

describe('CompanyProfileService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lädt und mappt die Unternehmenseinstellungen des aktiven Workspace', async () => {
    const { service, rpc } = createService();
    rpc.mockResolvedValueOnce({ data: state(workspaceA), error: null });

    await service.load(workspaceA);

    expect(rpc).toHaveBeenCalledWith('get_workspace_company_settings', {
      p_workspace_id: workspaceA,
    });
    expect(service.loadedWorkspaceId()).toBe(workspaceA);
    expect(service.profile()).toMatchObject({
      workspaceId: workspaceA,
      companyName: 'Wiehen Store',
      legalName: 'Grischa Tänzer',
      countryCode: 'DE',
      iban: 'DE12345678901234567890',
    });
    expect(service.taxMode()).toBe('kleinunternehmer_19');
    expect(service.canEdit()).toBe(true);
  });

  it('leert A sofort und verwirft eine verspätete A-Antwort nach Wechsel zu B', async () => {
    const { service, currentWorkspace, rpc } = createService();
    const a = deferred<{ data: CompanySettingsState | null; error: null }>();
    rpc.mockImplementationOnce(() => a.promise);
    const loadA = service.load(workspaceA);

    currentWorkspace.set({ id: workspaceB });
    rpc.mockResolvedValueOnce({ data: state(workspaceB, { company_name: 'Firma B' }), error: null });
    const loadB = service.load(workspaceB);

    expect(service.profile()).toBeNull();
    await loadB;
    expect(service.profile()?.companyName).toBe('Firma B');

    a.resolve({ data: state(workspaceA) as unknown as CompanySettingsState, error: null });
    await loadA;

    expect(service.loadedWorkspaceId()).toBe(workspaceB);
    expect(service.profile()?.companyName).toBe('Firma B');
  });

  it('speichert nur über den atomaren RPC und übernimmt ausschließlich dessen bestätigte Antwort', async () => {
    const { service, rpc } = createService();
    rpc
      .mockResolvedValueOnce({ data: state(workspaceA), error: null })
      .mockResolvedValueOnce({
        data: state(workspaceA, { company_name: 'Bestätigter Name', iban: 'DE9999' }, 'regular_19'),
        error: null,
      });
    await service.load(workspaceA);

    const result = await service.save(
      fullInput({ companyName: ' Eingabe ', iban: 'de99 99' }),
      'regular_19',
    );

    expect(rpc).toHaveBeenLastCalledWith('update_workspace_company_settings', {
      p_workspace_id: workspaceA,
      p_profile: expect.objectContaining({
        company_name: 'Eingabe',
        country_code: 'DE',
        iban: 'DE9999',
        bic: 'ABCDDEFF',
      }),
      p_tax_mode: 'regular_19',
    });
    expect(result.error).toBeNull();
    expect(service.profile()?.companyName).toBe('Bestätigter Name');
    expect(service.taxMode()).toBe('regular_19');
  });

  it('weist Speichern ohne aktiven geladenen Workspace zurück und verändert lokal nichts', async () => {
    const { service, currentWorkspace, rpc } = createService();
    currentWorkspace.set(null);

    const result = await service.save(fullInput(), 'diff_25a');

    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('aktiver Workspace');
    expect(rpc).not.toHaveBeenCalled();
    expect(service.profile()).toBeNull();
  });

  it('bewahrt die serverseitige Schreibberechtigung für normale Mitglieder als false', async () => {
    const { service, rpc } = createService();
    rpc.mockResolvedValueOnce({ data: state(workspaceA, {}, 'diff_25a', false), error: null });

    await service.load(workspaceA);

    expect(service.canEdit()).toBe(false);
  });

  it('berechnet Rechnungsbereitschaft nur aus den festgelegten Pflichtangaben', async () => {
    const { service, rpc } = createService();
    rpc.mockResolvedValueOnce({
      data: state(workspaceA, {
        company_name: null,
        legal_name: null,
        street: null,
        house_number: null,
        postal_code: null,
        city: null,
        country_code: null,
        tax_number: null,
        vat_id: null,
        bank_name: null,
        iban: null,
        bic: null,
        logo_path: null,
      }),
      error: null,
    });
    await service.load(workspaceA);

    expect(service.readiness().complete).toBe(false);
    expect(service.readiness().missingFields).toEqual([
      'legalName',
      'street',
      'houseNumber',
      'postalCode',
      'city',
      'countryCode',
      'taxIdentifier',
    ]);

    rpc.mockResolvedValueOnce({ data: state(workspaceA), error: null });
    await service.load(workspaceA);
    expect(service.readiness()).toEqual({ complete: true, missingFields: [] });
  });

  it('lädt eine signierte Vorschau nur für den bestätigten Logo-Pfad des Workspace', async () => {
    const { service, rpc, createSignedUrl } = createService();
    const logoPath = `${workspaceA}/logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
    rpc.mockResolvedValueOnce({ data: state(workspaceA, { logo_path: logoPath }), error: null });

    await service.load(workspaceA);

    expect(createSignedUrl).toHaveBeenCalledWith(logoPath, 3600);
    expect(service.logoUrl()).toBe(`https://signed.example/${logoPath}`);
  });

  it('räumt nur den neuen Upload auf, wenn die Logo-Aktivierung fehlschlägt', async () => {
    const { service, rpc, remove } = createService();
    const oldLogo = `${workspaceA}/logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
    rpc
      .mockResolvedValueOnce({ data: state(workspaceA, { logo_path: oldLogo }), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Aktivierung fehlgeschlagen' } });
    await service.load(workspaceA);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })));

    const result = await service.replaceLogo(
      new File([new Uint8Array([1])], 'logo.webp', { type: 'image/webp' }),
    );

    expect(result.error).not.toBeNull();
    expect(remove).toHaveBeenCalledWith([
      expect.stringMatching(new RegExp(`^${workspaceA}/logos/[0-9a-f-]{36}\\.webp$`)),
    ]);
    expect(service.profile()?.logoPath).toBe(oldLogo);
  });

  it('aktiviert ein neues Logo ohne das alte Objekt zu löschen', async () => {
    const { service, rpc, remove } = createService();
    const oldLogo = `${workspaceA}/logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
    rpc
      .mockResolvedValueOnce({ data: state(workspaceA, { logo_path: oldLogo }), error: null })
      .mockImplementationOnce((_name: string, args: { p_logo_path: string }) =>
        Promise.resolve({
          data: state(workspaceA, { logo_path: args.p_logo_path }),
          error: null,
        }),
      );
    await service.load(workspaceA);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })));

    const result = await service.replaceLogo(
      new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' }),
    );

    expect(result.error).toBeNull();
    expect(service.profile()?.logoPath).toMatch(
      new RegExp(`^${workspaceA}/logos/[0-9a-f-]{36}\\.png$`),
    );
    expect(remove).not.toHaveBeenCalledWith([oldLogo]);
  });

  it('entfernt nur die aktive Logo-Zuordnung und lässt das historische Objekt bestehen', async () => {
    const { service, rpc, remove } = createService();
    const oldLogo = `${workspaceA}/logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
    rpc
      .mockResolvedValueOnce({ data: state(workspaceA, { logo_path: oldLogo }), error: null })
      .mockResolvedValueOnce({ data: state(workspaceA, { logo_path: null }), error: null });
    await service.load(workspaceA);

    const result = await service.removeLogo();

    expect(rpc).toHaveBeenLastCalledWith('set_workspace_company_logo', {
      p_workspace_id: workspaceA,
      p_logo_path: null,
    });
    expect(result.error).toBeNull();
    expect(service.profile()?.logoPath).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});

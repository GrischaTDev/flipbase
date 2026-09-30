import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { FulfillmentService } from './fulfillment.service';
import { CompanyProfileService } from './company-profile.service';
import { WorkspaceService } from './workspace.service';
import { SupabaseService } from './supabase.service';
import { companyProfileFixture } from '../../../test-support/company-document.fixture';

const legacy = {
  sender_name: 'Lager-Inhaber',
  sender_company: 'Lager',
  sender_street: 'Lagerweg',
  sender_house_number: '8',
  sender_postal_code: '54321',
  sender_city: 'Köln',
  sender_country: 'DE',
  sender_email: '',
  sender_phone: '',
  dhl_enabled: false,
  hermes_enabled: false,
  use_company_address: null as boolean | null,
};
function setup(config: typeof legacy | null = null) {
  const currentWorkspace = signal({ id: 'ws-1' });
  const profile = signal(companyProfileFixture());
  let written: Record<string, unknown> = {};
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data: [], error: null })),
    maybeSingle: vi.fn(async () => ({ data: config, error: null })),
    upsert: vi.fn((value: Record<string, unknown>) => {
      written = value;
      return query;
    }),
    single: vi.fn(async () => ({ data: { ...legacy, ...written }, error: null })),
  };
  const service = runInInjectionContext(
    Injector.create({
      providers: [
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: CompanyProfileService, useValue: { profile } },
        { provide: SupabaseService, useValue: { client: { from: () => query } } },
      ],
    }),
    () => new FulfillmentService(),
  );
  return { service, profile, currentWorkspace, written: () => written };
}

describe('Versand nutzt Unternehmen oder erhaltenen Override', () => {
  it('verwendet bei neuer Konfiguration die zentrale Unternehmensanschrift', async () => {
    const { service } = setup();
    await service.loadFromSupabase('ws-1');
    expect(service.carrierConfig().useCompanyAddress).toBe(true);
    expect(service.getSenderAddress()).toMatchObject({
      name: 'Anna Beispiel',
      street: 'Testweg',
      house_number: '1',
      city: 'Bonn',
    });
  });
  it('behält eine vollständige bisherige Versandadresse aktiv', async () => {
    const { service, profile } = setup(legacy);
    await service.loadFromSupabase('ws-1');
    expect(service.carrierConfig().useCompanyAddress).toBe(false);
    profile.update((value) => ({ ...value, street: 'Neue Geschäftsstraße' }));
    expect(service.getSenderAddress()).toMatchObject({ name: 'Lager-Inhaber', street: 'Lagerweg' });
  });
  it('aktualisiert zentrale Adressen und zeigt keine Adresse aus einem fremden Profil', async () => {
    const { service, profile, currentWorkspace } = setup({ ...legacy, use_company_address: true });
    await service.loadFromSupabase('ws-1');
    profile.update((value) => ({ ...value, street: 'Neue Geschäftsstraße' }));
    expect(service.getSenderAddress()?.street).toBe('Neue Geschäftsstraße');
    currentWorkspace.set({ id: 'ws-2' });
    expect(service.getSenderAddress()).toBeNull();
  });
  it('bewahrt den gespeicherten Override beim Umschalten und zurück', async () => {
    const { service, written } = setup(legacy);
    await service.loadFromSupabase('ws-1');
    await service.updateCarrierConfig({ useCompanyAddress: true });
    expect(written()).toMatchObject({
      use_company_address: true,
      sender_name: 'Lager-Inhaber',
      sender_street: 'Lagerweg',
    });
    expect(service.getSenderAddress()?.name).toBe('Anna Beispiel');
    await service.updateCarrierConfig({ useCompanyAddress: false });
    expect(service.getSenderAddress()?.name).toBe('Lager-Inhaber');
  });
  it('erfindet bei fehlenden zentralen Pflichtangaben keine Adresse', async () => {
    const { service, profile } = setup({ ...legacy, use_company_address: true });
    await service.loadFromSupabase('ws-1');
    profile.update((value) => ({ ...value, street: null }));
    expect(service.getSenderAddress()).toBeNull();
  });
});

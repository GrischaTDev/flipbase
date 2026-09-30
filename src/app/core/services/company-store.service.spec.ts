import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { StoreService } from './store.service';
import { CompanyProfileService } from './company-profile.service';
import { WorkspaceService } from './workspace.service';
import { SupabaseService } from './supabase.service';
import { companyProfileFixture } from '../../../test-support/company-document.fixture';
import { WorkspaceCompanyProfile } from '../models/company-profile.models';

function setup() {
  const currentWorkspace = signal({ id: 'ws-1' });
  const profile = signal<WorkspaceCompanyProfile>({
    ...companyProfileFixture(),
    bankAccountHolder: 'Anna Beispiel',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    bankName: 'Testbank',
  });
  const payments = {
    bankTransferEnabled: true,
    bankIban: 'DE12500105170648489890',
    bankAccountHolder: 'Alter Shop-Inhaber',
    futurePaymentOption: { enabled: true },
  };
  let written: Record<string, unknown> | null = null;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data: [], error: null })),
    maybeSingle: vi.fn(async () => ({
      data: { store_name: 'Shop', payments, imprint: { owner: 'Falscher Alt-Inhaber' } },
      error: null,
    })),
    upsert: vi.fn((value: Record<string, unknown>) => {
      written = value;
      return query;
    }),
    single: vi.fn(async () => ({ data: { payments: written?.['payments'] }, error: null })),
  };
  const service = runInInjectionContext(
    Injector.create({
      providers: [
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: CompanyProfileService, useValue: { profile } },
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: () => query,
              rpc: vi.fn(async () => ({
                data: null,
                error: new Error('Bestellung erreicht die Datenbank'),
              })),
            },
          },
        },
      ],
    }),
    () => new StoreService(),
  );
  return { service, profile, currentWorkspace, query, written: () => written };
}

describe('Shop liest Unternehmensdaten statt Legacy-Angaben', () => {
  it('zeigt aktuelles Unternehmenskonto und Impressum nach Änderungen', async () => {
    const { service, profile } = setup();
    await service.loadFromSupabase('ws-1');
    expect(service.companyBankAccount?.()).toMatchObject({
      accountHolder: 'Anna Beispiel',
      iban: 'DE89370400440532013000',
    });
    expect(service.companyImprint?.()).toMatchObject({
      owner: 'Anna Beispiel',
      city: '12345 Bonn',
    });
    profile.update((value) => ({
      ...value,
      legalName: 'Neue Inhaberin',
      iban: 'DE02500105170137075030',
    }));
    expect(service.companyImprint?.()?.owner).toBe('Neue Inhaberin');
    expect(service.companyBankAccount?.()?.iban).toBe('DE02500105170137075030');
  });

  it('zeigt nach Workspace-Wechsel keine bisherigen Unternehmensdaten', () => {
    const { service, currentWorkspace } = setup();
    currentWorkspace.set({ id: 'ws-2' });
    expect(service.companyBankAccount?.()).toBeNull();
    expect(service.companyImprint?.()).toBeNull();
    expect(service.canUseBankTransfer?.()).toBe(false);
  });

  it('bewahrt alte Zahlungsfelder ohne neue Unternehmenswerte zurückzuschreiben', async () => {
    const { service, written } = setup();
    await service.loadFromSupabase('ws-1');
    await service.updatePaymentsConfig({ stripeEnabled: false });
    expect(written()?.['payments']).toMatchObject({
      bankIban: 'DE12500105170648489890',
      bankAccountHolder: 'Alter Shop-Inhaber',
      futurePaymentOption: { enabled: true },
      stripeEnabled: false,
    });
    expect(written()).not.toHaveProperty('imprint');
  });

  it('weist Banküberweisung ohne aktuelles Unternehmenskonto vor Bestellanlage zurück', async () => {
    const { service, profile } = setup();
    profile.update((value) => ({ ...value, iban: null }));
    service.cart.set([
      {
        item: { kind: 'catalog_product', id: 'item', title: 'Jacke', availableQuantity: 1 },
        quantity: 1,
        unitPrice: 10,
      },
    ]);
    const result = await service.placeOrder(
      {
        firstName: 'Test',
        lastName: 'Kunde',
        email: 'test@example.com',
        street: 'Weg',
        houseNumber: '1',
        zip: '12345',
        city: 'Bonn',
        country: 'DE',
        shippingMethod: 'pickup',
        paymentMethod: 'bank_transfer',
      },
      { orderId: 'order', orderNumber: 'SHOP-1' },
    );
    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Unternehmenskonto');
    expect(service.orders()).toEqual([]);
  });

  it('verwirft Legacy-Vorschläge während des Ladens eines anderen Workspaces', async () => {
    const { service, currentWorkspace, query, profile } = setup();
    await service.loadFromSupabase('ws-1');
    expect(service.legacyBankAccount()?.accountHolder).toBe('Alter Shop-Inhaber');
    let finish!: (value: Awaited<ReturnType<typeof query.maybeSingle>>) => void;
    query.maybeSingle.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    currentWorkspace.set({ id: 'ws-2' });
    profile.update((value) => ({ ...value, workspaceId: 'ws-2' }));
    const loading = service.loadFromSupabase('ws-2');
    expect(service.legacyBankAccount()).toBeNull();
    expect(service.canUseBankTransfer()).toBe(false);
    finish({
      data: {
        store_name: 'B',
        payments: {
          bankTransferEnabled: true,
          bankIban: '',
          bankAccountHolder: '',
          futurePaymentOption: { enabled: false },
        },
        imprint: { owner: '' },
      },
      error: null,
    });
    await loading;
  });
});

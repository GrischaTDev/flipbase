import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceService } from './invoice.service';
import { Sale } from '../models/flipbase.models';
import { CompanyDocumentError } from '../models/company-document.models';

const sale: Sale = {
  id: 'sale',
  workspace_id: 'ws',
  inventory_item_id: null,
  sale_price: 25,
  sale_date: '2026-09-30',
  platform: 'cash',
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
};

describe('Rechnungen mit Unternehmensdaten', () => {
  it('erzeugt ohne Unternehmensdaten keinen lokalen Demo-Beleg', async () => {
    const service = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new InvoiceService(),
    );
    const result = await service.generateInvoiceForSale(sale);
    expect(result.error).toBeInstanceOf(CompanyDocumentError);
    expect(result.data).toBeNull();
    expect(service.invoices()).toEqual([]);
  });

  it('übernimmt einen serverseitigen Vollständigkeitsfehler strukturiert', async () => {
    const service = Object.create(InvoiceService.prototype) as InvoiceService;
    Object.assign(service, {
      workspaceService: { currentWorkspace: () => ({ id: 'ws' }) },
      invoices: signal([]),
      supabase: {
        client: {
          rpc: vi.fn(async () => ({
            data: null,
            error: {
              code: 'P0001',
              message: 'company_profile_incomplete',
              details: '["legalName","taxIdentifier"]',
            },
          })),
        },
      },
    });
    const result = await service.generateInvoiceForSale(sale);
    expect(result.error).toMatchObject({
      code: 'company_profile_incomplete',
      settingsPath: '/settings/company',
      missingFields: ['legalName', 'taxIdentifier'],
    });
  });
});

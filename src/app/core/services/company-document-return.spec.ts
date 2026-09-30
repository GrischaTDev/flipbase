import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { ReturnService } from './return.service';
import { ReturnRecord } from '../models/return.models';
import { Sale } from '../models/flipbase.models';

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
const record: ReturnRecord = {
  id: 'return',
  workspace_id: 'ws',
  sale_id: 'sale',
  inventory_item_id: null,
  credit_note_number: 'GS-1',
  return_date: '2026-09-30',
  reason: 'other',
  refund_amount: 25,
  is_full_refund: true,
  restock_action: 'keep_with_buyer',
  created_at: '',
};

describe('Gutschriften verwenden gespeicherte Unternehmensdaten', () => {
  const service = runInInjectionContext(
    Injector.create({ providers: [] }),
    () => new ReturnService(),
  );
  it('erfindet ohne Snapshot keinen Absender', () => {
    expect(service.generateCreditNoteInvoice(record, sale, null)).toBeNull();
  });
  it('bewahrt Originalabsender, Rechnungsnummer und Steuerhinweis', () => {
    const seller = {
      name: 'Alter Inhaber',
      street: 'Altweg 1',
      postalCode: '12345',
      city: 'Bonn',
      country: 'DE',
    };
    const invoice = service.generateCreditNoteInvoice(
      {
        ...record,
        credit_note_snapshot: {
          seller,
          buyer: seller,
          taxMode: 'regular_19',
          taxClause: 'Historischer Steuerhinweis',
          originalInvoiceNumber: 'RE-ALT-42',
        },
      },
      sale,
      null,
    );
    expect(invoice?.seller).toEqual(seller);
    expect(invoice?.taxMode).toBe('regular_19');
    expect(invoice?.taxClause).toContain('Historischer Steuerhinweis');
    expect(invoice?.items[0].title).toContain('RE-ALT-42');
  });
});

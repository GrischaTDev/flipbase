import { TestBed } from '@angular/core/testing';
import { BankReconciliationService } from './bank-reconciliation.service';
import { StoreService } from './store.service';
import { SalesService } from './sales.service';
import { PurchaseService } from './purchase.service';
import { InvoiceService } from './invoice.service';
import { describe, it, expect, beforeEach } from 'vitest';
import { BankTransaction } from '../models/bank-reconciliation.models';

describe('BankReconciliationService', () => {
  let service: BankReconciliationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        BankReconciliationService,
        StoreService,
        SalesService,
        PurchaseService,
        InvoiceService,
      ],
    });
    service = TestBed.inject(BankReconciliationService);
  });

  it('should be created and start with clean transactions or demo data', () => {
    expect(service).toBeTruthy();
    expect(Array.isArray(service.transactions())).toBe(true);
  });

  it('should parse German Sparkasse CSV format correctly', () => {
    const csvData = `Buchungstag;Beguenstigter/Zahlungspflichtiger;Verwendungszweck;Betrag
15.08.2026;Max Mustermann;Bestellung ORD-987654 Webshop;149,99
14.08.2026;DHL Paket GmbH;Portoabrechnung Geschäftskunde;-39,50`;

    const parsed = service.parseCsv(csvData);
    expect(parsed.length).toBe(2);

    expect(parsed[0].bookingDate).toBe('2026-08-15');
    expect(parsed[0].counterpartyName).toBe('Max Mustermann');
    expect(parsed[0].purpose).toBe('Bestellung ORD-987654 Webshop');
    expect(parsed[0].amount).toBe(149.99);

    expect(parsed[1].bookingDate).toBe('2026-08-14');
    expect(parsed[1].counterpartyName).toBe('DHL Paket GmbH');
    expect(parsed[1].amount).toBe(-39.50);
  });

  it('should parse MT940 statement text', () => {
    const mt940Data = `:20:START
:25:DE89370400440532013000
:28C:00001
:60F:C260801EUR1000,00
:61:2608150815CR120,50NTRFNONREF
:86:SEPA-GUTSCHRIFT?32Anna Schmidt?20Bestellung ORD-112233
:61:2608140814DR45,00NTRFNONREF
:86:SEPA-LASTSCHRIFT?32DHL Express?20Versandkosten`;

    const parsed = service.parseMt940(mt940Data);
    expect(parsed.length).toBe(2);

    expect(parsed[0].bookingDate).toBe('2026-08-15');
    expect(parsed[0].amount).toBe(120.5);
    expect(parsed[0].counterpartyName).toBe('Anna Schmidt');

    expect(parsed[1].bookingDate).toBe('2026-08-14');
    expect(parsed[1].amount).toBe(-45.0);
  });

  it('should match incoming bank payment with an existing store order and calculate 100% confidence', () => {
    const tx: BankTransaction = {
      id: 'test-tx-1',
      bookingDate: '2026-08-16',
      counterpartyName: 'Tobias Meyer',
      purpose: 'Zahlung fuer Bestellung ORD-100200',
      amount: 89.99,
      currency: 'EUR',
      status: 'pending',
    };

    // Inject a pending store order with matching number and amount
    const storeService = TestBed.inject(StoreService);
    storeService.orders.set([
      {
        id: 'ord-test-1',
        orderNumber: 'ORD-100200',
        createdAt: '2026-08-15T10:00:00Z',
        items: [],
        customer: {
          firstName: 'Tobias',
          lastName: 'Meyer',
          email: 'tobias@test.de',
          street: 'Teststr.',
          houseNumber: '1',
          zip: '10115',
          city: 'Berlin',
          country: 'Deutschland',
          shippingMethod: 'dhl_standard',
          paymentMethod: 'bank_transfer',
        },
        subtotal: 84.0,
        shippingCost: 5.99,
        total: 89.99,
        paymentStatus: 'pending',
        paymentMethod: 'bank_transfer',
      },
    ]);

    const matchedTx = service.runMatchingEngine(tx);
    expect(matchedTx.match).toBeTruthy();
    expect(matchedTx.match?.confidence).toBe(100);
    expect(matchedTx.match?.confidenceLabel).toBe('exact');
    expect(matchedTx.match?.targetReference).toBe('ORD-100200');
  });

  it('should load demo statements and calculate summary statistics', () => {
    service.loadDemoStatement();
    expect(service.transactions().length).toBeGreaterThanOrEqual(4);

    const summary = service.summary();
    expect(summary.totalCount).toBeGreaterThanOrEqual(4);
    expect(summary.totalIncome).toBeGreaterThan(0);
    expect(summary.totalExpense).toBeGreaterThan(0);
    expect(summary.autoMatchRate).toBeGreaterThanOrEqual(50);
  });

  it('should book transaction and update store order payment status', async () => {
    const storeService = TestBed.inject(StoreService);
    storeService.orders.set([
      {
        id: 'ord-book-1',
        orderNumber: 'ORD-BOOK-99',
        createdAt: '2026-08-15T10:00:00Z',
        items: [],
        customer: {
          firstName: 'Klaus',
          lastName: 'Mueller',
          email: 'klaus@test.de',
          street: 'Teststr.',
          houseNumber: '1',
          zip: '10115',
          city: 'Berlin',
          country: 'Deutschland',
          shippingMethod: 'dhl_standard',
          paymentMethod: 'bank_transfer',
        },
        subtotal: 50.0,
        shippingCost: 0,
        total: 50.0,
        paymentStatus: 'pending',
        paymentMethod: 'bank_transfer',
      },
    ]);

    const tx: BankTransaction = {
      id: 'tx-book-test',
      bookingDate: '2026-08-16',
      counterpartyName: 'Klaus Mueller',
      purpose: 'Bestellung ORD-BOOK-99',
      amount: 50.0,
      currency: 'EUR',
      status: 'pending',
    };

    const matched = service.runMatchingEngine(tx);
    service.transactions.set([matched]);

    const result = await service.bookTransaction('tx-book-test');
    expect(result.success).toBe(true);

    const updatedTx = service.transactions().find((t) => t.id === 'tx-book-test');
    expect(updatedTx?.status).toBe('booked');

    const updatedOrder = storeService.orders().find((o) => o.id === 'ord-book-1');
    expect(updatedOrder?.paymentStatus).toBe('paid');
  });
});

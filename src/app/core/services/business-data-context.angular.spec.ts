import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { BankReconciliationService, MAX_BANK_FILE_BYTES } from './bank-reconciliation.service';
import { PurchaseService } from './purchase.service';
import { SalesService } from './sales.service';
import { StoreService } from './store.service';
import { SupabaseService } from './supabase.service';
import { TaxAdvisorService } from './tax-advisor.service';
import { TaxEngineService } from './tax-engine.service';
import { WorkspaceService } from './workspace.service';
import { WebhookService } from './webhook.service';
import { WebPushService } from './web-push.service';

interface PendingRead {
  table: string;
  workspace: string;
  resolve: (response: { data: unknown; error: null }) => void;
}

describe('workspace and account isolation of finance data', () => {
  const workspace = signal<{ id: string } | null>(null);
  const currentUser = signal<{ id: string } | null>(null);
  let reads: PendingRead[];
  let rpc: ReturnType<typeof vi.fn>;
  let bank: BankReconciliationService;
  let advisor: TaxAdvisorService;
  beforeEach(() => {
    workspace.set({ id: 'workspace-a' });
    currentUser.set({ id: 'user-a' });
    reads = [];
    rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = (table: string) => {
      let requestedWorkspace = '';
      const response = () =>
        new Promise<{ data: unknown; error: null }>((resolve) =>
          reads.push({ table, workspace: requestedWorkspace, resolve }),
        );
      const query = {
        select: () => query,
        eq: (_column: string, identifier: string) => {
          requestedWorkspace = identifier;
          return query;
        },
        order: response,
        maybeSingle: response,
      };
      return query;
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { from, rpc } } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: AuthService, useValue: { currentUser } },
        { provide: StoreService, useValue: { orders: signal([]) } },
        { provide: SalesService, useValue: { sales: signal([]) } },
        { provide: PurchaseService, useValue: { purchases: signal([]) } },
        { provide: TaxEngineService, useValue: {} },
        { provide: WebhookService, useValue: {} },
        { provide: WebPushService, useValue: {} },
      ],
    });
    bank = TestBed.runInInjectionContext(() => new BankReconciliationService());
    advisor = TestBed.runInInjectionContext(() => new TaxAdvisorService());
    TestBed.tick();
  });
  afterEach(() => TestBed.resetTestingModule());
  const transactionRow = {
    id: 'transaction-a',
    booking_date: '2026-10-07',
    counterparty_name: 'Private A',
    purpose: 'Private payment A',
    amount: 10,
    currency: 'EUR',
    source_format: 'csv',
    status: 'pending',
  };
  async function finish(table: string, requestedWorkspace: string, data: unknown): Promise<void> {
    const read = reads.find(
      (request) => request.table === table && request.workspace === requestedWorkspace,
    );
    if (!read) throw new Error('Missing query');
    reads.splice(reads.indexOf(read), 1);
    read.resolve({ data, error: null });
    await Promise.resolve();
    await Promise.resolve();
  }

  it('clears loaded financial identities on workspace switch and logout', async () => {
    await finish('bank_transactions', 'workspace-a', [transactionRow]);
    await finish('tax_advisor_configs', 'workspace-a', {
      firm_name: 'Private advisor A',
      advisor_email: 'private-a@example.test',
    });
    expect(bank.transactions()[0]?.purpose).toBe('Private payment A');
    expect(advisor.advisorConfig().firmName).toBe('Private advisor A');
    bank.selectedTransaction.set(bank.transactions()[0] ?? null);
    workspace.set({ id: 'workspace-b' });
    TestBed.tick();
    expect(bank.transactions()).toEqual([]);
    expect(bank.selectedTransaction()).toBeNull();
    expect(advisor.advisorConfig().firmName).toBe('');
    await finish('bank_transactions', 'workspace-b', []);
    await finish('tax_advisor_configs', 'workspace-b', null);
    currentUser.set(null);
    TestBed.tick();
    expect(bank.transactions()).toEqual([]);
    expect(advisor.advisorConfig().advisorEmail).toBe('');
  });

  it('discards old server responses after a different account takes over the same workspace', async () => {
    currentUser.set({ id: 'user-b' });
    TestBed.tick();
    await finish('bank_transactions', 'workspace-a', [transactionRow]);
    await finish('tax_advisor_configs', 'workspace-a', { firm_name: 'Private advisor A' });
    expect(bank.transactions()).toEqual([]);
    expect(advisor.advisorConfig().firmName).toBe('');
    await finish('bank_transactions', 'workspace-a', []);
    await finish('tax_advisor_configs', 'workspace-a', null);
    expect(bank.transactions()).toEqual([]);
  });

  it('rejects oversized files before reading and never saves a file read in another context', async () => {
    const tooLarge = new File([], 'bank.csv');
    Object.defineProperty(tooLarge, 'size', { value: MAX_BANK_FILE_BYTES + 1 });
    Object.defineProperty(tooLarge, 'text', { value: vi.fn() });
    await expect(bank.importBankStatementFile(tooLarge)).resolves.toMatchObject({
      success: false,
      message: expect.stringMatching(/10 MiB/),
    });
    expect(tooLarge.text).not.toHaveBeenCalled();
    let completeRead: (content: string) => void = () => {
      throw new Error('Missing reader');
    };
    const file = new File([], 'bank.csv');
    Object.defineProperty(file, 'text', {
      value: () =>
        new Promise<string>((resolve) => {
          completeRead = resolve;
        }),
    });
    const pending = bank.importBankStatementFile(file);
    workspace.set({ id: 'workspace-b' });
    TestBed.tick();
    completeRead(
      'Buchungstag;Beguenstigter/Zahlungspflichtiger;Verwendungszweck;Betrag\n07.10.2026;Private A;Payment;10,00',
    );
    await pending;
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects excessive CSV, MT940 and CAMT rows and UTF-8 bytes without partial persistence', () => {
    expect(() =>
      bank.parseCsv(
        'Buchungstag;Beguenstigter/Zahlungspflichtiger;Verwendungszweck;Betrag\n' +
          '07.10.2026;Private A;Payment;10,00\n'.repeat(5001),
      ),
    ).toThrow(/5000/);
    expect(() =>
      bank.parseMt940(':61:2608150815CR120,50NTRFNONREF\n:86:Payment\n'.repeat(5001)),
    ).toThrow(/5000/);
    expect(() =>
      bank.parseCamt053Xml(
        '<Document>' + '<Ntry><Amt>10</Amt></Ntry>'.repeat(5001) + '</Document>',
      ),
    ).toThrow(/5000/);
    expect(() => bank.parseCsv('ä'.repeat(MAX_BANK_FILE_BYTES / 2 + 1))).toThrow(/10 MiB/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

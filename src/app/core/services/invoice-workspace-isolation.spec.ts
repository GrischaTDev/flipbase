import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Sale } from '../models/flipbase.models';
import { EmailConfirmation, Invoice } from '../models/invoice.models';
import { InvoiceService } from './invoice.service';
import { SyncStatusService } from './sync-status.service';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

interface QueryResponse {
  readonly data: unknown;
  readonly error: unknown | null;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

const workspaceA = { id: 'workspace-a', name: 'Workspace A' };
const workspaceB = { id: 'workspace-b', name: 'Workspace B' };

const invoiceA: Invoice = {
  id: 'invoice-a',
  invoiceNumber: 'RE-A',
  orderNumber: 'ORDER-A',
  invoiceDate: '2026-08-25',
  deliveryDate: '2026-08-25',
  seller: { name: 'A', street: '', postalCode: '', city: '', country: 'DE' },
  buyer: { name: 'Ada', street: '', postalCode: '', city: '', country: 'DE' },
  items: [{ title: 'Artikel A', quantity: 1, unitPrice: 50, totalPrice: 50 }],
  subtotal: 50,
  shippingCost: 0,
  total: 50,
  taxMode: 'diff_25a',
  taxClause: '',
  paymentMethod: 'test',
  paymentStatus: 'paid',
  sourceType: 'sale',
  sourceId: 'sale-a',
};

const emailA: EmailConfirmation = {
  id: 'email-a',
  to: 'a@example.com',
  recipientName: 'Ada',
  subject: 'A',
  sentAt: '2026-08-25T10:00:00Z',
  status: 'draft',
  invoiceNumber: invoiceA.invoiceNumber,
  orderNumber: invoiceA.orderNumber,
};

function rawInvoice(id: string, sourceId: string) {
  return {
    id,
    invoice_number: `RE-${id}`,
    order_number: `ORDER-${id}`,
    invoice_date: '2026-08-25',
    delivery_date: '2026-08-25',
    seller: invoiceA.seller,
    buyer: invoiceA.buyer,
    items: [
      {
        title: `Artikel ${id}`,
        quantity: 1,
        unit_price: 50,
        total_price: 50,
      },
    ],
    subtotal: 50,
    shipping_cost: 0,
    total: 50,
    tax_mode: 'diff_25a',
    tax_clause: '',
    payment_method: 'test',
    payment_status: 'paid',
    sale_id: sourceId,
    store_order_id: null,
  };
}

function rawEmail(id: string) {
  return {
    id,
    recipient_email: `${id}@example.com`,
    recipient_name: id,
    subject: id,
    sent_at: '2026-08-25T10:00:00Z',
    status: 'draft',
    invoice_number: `RE-${id}`,
    order_number: `ORDER-${id}`,
  };
}

function createService(
  currentWorkspace: ReturnType<typeof signal<typeof workspaceA>>,
  responses: Record<string, Record<string, Promise<QueryResponse>>>,
  rpc: ReturnType<typeof vi.fn> = vi.fn(),
) {
  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn((_column: string, workspaceId: string) => ({
          order: vi.fn(() => responses[table][workspaceId]),
        })),
      })),
    })),
    rpc,
  };
  const service = Object.create(InvoiceService.prototype) as InvoiceService;
  Object.assign(service, {
    loadVersion: 0,
    invoices: signal<Invoice[]>([invoiceA]),
    sentEmails: signal<EmailConfirmation[]>([emailA]),
    selectedInvoiceForView: signal<Invoice | null>(invoiceA),
    isInvoiceModalOpen: signal(true),
    isLoading: signal(false),
    workspaceService: { currentWorkspace },
    mockStore: { isDemoMode: () => false },
    syncStatus: new SyncStatusService(),
    logger: { error: vi.fn() },
    supabase: { client },
  });
  return service;
}

describe('InvoiceService – Workspace-Isolation', () => {
  it('entfernt Rechnungen, E-Mail-Vormerkungen und die Auswahl sofort beim Wechsel in ein leeres B', async () => {
    const currentWorkspace = signal(workspaceA);
    const service = createService(currentWorkspace, {
      invoices: { 'workspace-b': Promise.resolve({ data: [], error: null }) },
      email_confirmations: { 'workspace-b': Promise.resolve({ data: [], error: null }) },
    });

    currentWorkspace.set(workspaceB);
    const loadingB = service.loadFromSupabase(workspaceB.id);

    expect(service.invoices()).toEqual([]);
    expect(service.sentEmails()).toEqual([]);
    expect(service.selectedInvoiceForView()).toBeNull();

    await loadingB;

    expect(service.invoices()).toEqual([]);
    expect(service.sentEmails()).toEqual([]);
  });

  it('verwirft die verspätete Ladeantwort von A, nachdem B geladen wurde', async () => {
    const currentWorkspace = signal(workspaceA);
    const invoicesA = deferred<QueryResponse>();
    const emailsA = deferred<QueryResponse>();
    const service = createService(currentWorkspace, {
      invoices: {
        'workspace-a': invoicesA.promise,
        'workspace-b': Promise.resolve({ data: [rawInvoice('invoice-b', 'sale-b')], error: null }),
      },
      email_confirmations: {
        'workspace-a': emailsA.promise,
        'workspace-b': Promise.resolve({ data: [rawEmail('email-b')], error: null }),
      },
    });

    const loadingA = service.loadFromSupabase(workspaceA.id);
    currentWorkspace.set(workspaceB);
    await service.loadFromSupabase(workspaceB.id);

    invoicesA.resolve({ data: [rawInvoice('delayed-a', 'sale-a')], error: null });
    emailsA.resolve({ data: [rawEmail('delayed-a')], error: null });
    await loadingA;

    expect(service.invoices().map(({ id }) => id)).toEqual(['invoice-b']);
    expect(service.sentEmails().map(({ id }) => id)).toEqual(['email-b']);
  });

  it('verwirft eine alte Rechnungserstellung nach A zu B zu A trotz wieder gleicher Workspace-ID', async () => {
    const currentWorkspace = signal(workspaceA);
    const rpcResponse = deferred<{ data: unknown; error: null }>();
    const rpc = vi.fn(() => rpcResponse.promise);
    const service = createService(
      currentWorkspace,
      {
        invoices: {
          'workspace-a': Promise.resolve({ data: [], error: null }),
          'workspace-b': Promise.resolve({ data: [], error: null }),
        },
        email_confirmations: {
          'workspace-a': Promise.resolve({ data: [], error: null }),
          'workspace-b': Promise.resolve({ data: [], error: null }),
        },
      },
      rpc,
    );
    service.invoices.set([]);
    const sale: Sale = {
      id: 'sale-a',
      workspace_id: workspaceA.id,
      inventory_item_id: 'item-a',
      sale_price: 50,
      sale_date: '2026-08-25',
      platform: 'ebay',
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
    };

    const creatingA = service.generateInvoiceForSale(sale);
    currentWorkspace.set(workspaceB);
    await service.loadFromSupabase(workspaceB.id);
    currentWorkspace.set(workspaceA);
    await service.loadFromSupabase(workspaceA.id);
    rpcResponse.resolve({
      data: {
        invoice: rawInvoice('created-in-old-a', sale.id),
        items: rawInvoice('x', sale.id).items,
        created: true,
      },
      error: null,
    });

    const result = await creatingA;

    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('Workspace');
    expect(service.invoices()).toEqual([]);
  });

  it('übernimmt eine in A begonnene E-Mail-Vormerkung nach dem Wechsel zu B nicht mehr', async () => {
    const currentWorkspace = signal(workspaceA);
    const insertResponse = deferred<{ data: { id: string }; error: null }>();
    const sentEmails = signal<EmailConfirmation[]>([]);
    const service = Object.create(InvoiceService.prototype) as InvoiceService;
    Object.assign(service, {
      loadVersion: 0,
      sentEmails,
      workspaceService: { currentWorkspace },
      mockStore: { isDemoMode: () => false },
      syncStatus: new SyncStatusService(),
      supabase: {
        client: {
          from: () => ({
            insert: () => ({
              select: () => ({ maybeSingle: () => insertResponse.promise }),
            }),
          }),
        },
      },
    });

    const preparingA = service.prepareConfirmationEmail(invoiceA);
    currentWorkspace.set(workspaceB);
    insertResponse.resolve({ data: { id: 'persisted-email-a' }, error: null });

    const result = await preparingA;

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Workspace');
    expect(sentEmails()).toEqual([]);
  });
});

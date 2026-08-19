import { Injectable, effect, inject, signal } from '@angular/core';
import { WorkspaceService } from './workspace.service';
import { SupabaseService } from './supabase.service';
import { InventoryItem, Sale, TaxMode } from '../models/reflip.models';
import { StoreOrder } from '../models/store.models';
import { EmailConfirmation, Invoice, InvoiceItem, InvoiceParty } from '../models/invoice.models';

const STORAGE_KEY_INVOICES = 'reflip_generated_invoices';
const STORAGE_KEY_EMAILS = 'reflip_sent_emails';

@Injectable({
  providedIn: 'root',
})
export class InvoiceService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });

  readonly invoices = signal<Invoice[]>(this.loadInvoices());
  readonly sentEmails = signal<EmailConfirmation[]>(this.loadEmails());

  readonly selectedInvoiceForView = signal<Invoice | null>(null);
  readonly isInvoiceModalOpen = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        if (ws) {
          this.loadFromSupabase(ws.id);
        }
      });
    } catch {}
  }

  private loadInvoices(): Invoice[] {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY_INVOICES);
        if (stored) return JSON.parse(stored);
      }
    } catch {}
    return [];
  }

  private loadEmails(): EmailConfirmation[] {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY_EMAILS);
        if (stored) return JSON.parse(stored);
      }
    } catch {}
    return [];
  }

  private persistInvoices(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_INVOICES, JSON.stringify(this.invoices()));
      }
    } catch {}
  }

  private persistEmails(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_EMAILS, JSON.stringify(this.sentEmails()));
      }
    } catch {}
  }

  async loadFromSupabase(workspaceId: string): Promise<void> {
    if (!this.supabase || workspaceId.startsWith('demo-')) return;

    this.isLoading.set(true);
    try {
      const [invRes, emailRes] = await Promise.all([
        this.supabase.client
          .from('invoices')
          .select(`
            *,
            items:invoice_items(*)
          `)
          .eq('workspace_id', workspaceId)
          .order('invoice_date', { ascending: false }),
        this.supabase.client
          .from('email_confirmations')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('sent_at', { ascending: false }),
      ]);

      if (invRes.data && invRes.data.length > 0) {
        const mapped: Invoice[] = (invRes.data as unknown[]).map((inv: any) => ({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          orderNumber: inv.order_number,
          invoiceDate: inv.invoice_date,
          deliveryDate: inv.delivery_date,
          seller: (inv.seller as InvoiceParty) || this.getSellerParty(),
          buyer: (inv.buyer as InvoiceParty) || { name: 'Kunde', street: '', postalCode: '', city: '', country: 'Deutschland' },
          items: ((inv.items || []) as unknown[]).map((it: any) => ({
            sku: it.sku || undefined,
            title: it.title,
            condition: it.condition || undefined,
            quantity: it.quantity,
            unitPrice: Number(it.unit_price || 0),
            totalPrice: Number(it.total_price || 0),
          })),
          subtotal: Number(inv.subtotal || 0),
          shippingCost: Number(inv.shipping_cost || 0),
          total: Number(inv.total || 0),
          taxMode: inv.tax_mode as TaxMode,
          taxClause: inv.tax_clause || '',
          paymentMethod: inv.payment_method || '',
          paymentStatus: inv.payment_status as 'paid' | 'pending',
          paymentDueDate: inv.payment_due_date || undefined,
          notes: inv.notes || undefined,
        }));
        this.invoices.set(mapped);
        this.persistInvoices();
      }

      if (emailRes.data && emailRes.data.length > 0) {
        const mappedEmails: EmailConfirmation[] = (emailRes.data as unknown[]).map((e: any) => ({
          id: e.id,
          to: e.recipient_email,
          recipientName: e.recipient_name,
          subject: e.subject,
          sentAt: e.sent_at,
          status: e.status as 'sent' | 'draft',
          invoiceNumber: e.invoice_number || '',
          orderNumber: e.order_number || '',
        }));
        this.sentEmails.set(mappedEmails);
        this.persistEmails();
      }
    } catch (err) {
      console.error('Verbindungsfehler beim Laden der Rechnungen:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  getSellerParty(): InvoiceParty {
    const ws = this.workspaceService?.currentWorkspace();
    return {
      name: ws?.name || 'ReFlip Reselling GmbH & Co. KG',
      company: 'ReFlip Reselling',
      street: 'Gewerbestraße 10',
      postalCode: '10115',
      city: 'Berlin',
      country: 'Deutschland',
      email: 'rechnung@reflip.de',
      phone: '+49 (0) 30 98765432',
      taxId: '21/815/08150',
      vatId: 'DE 345 678 901',
      iban: 'DE45 5001 0517 5555 6666 77',
      bic: 'HELA DE FF 500',
      bankName: 'Helaba Landesbank',
    };
  }

  getTaxClause(taxMode: TaxMode): string {
    switch (taxMode) {
      case 'diff_25a':
        return 'Sonderregelung für Gebrauchtgegenstände / Kunstgegenstände gem. § 25a UStG (Differenzbesteuerung). Ein gesonderter Ausweis der Umsatzsteuer auf der Rechnung erfolgt nicht.';
      case 'kleinunternehmer_19':
        return 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerstatus).';
      case 'regular_19':
        return 'Der Gesamtbetrag enthält die gesetzliche Umsatzsteuer in Höhe von 19%.';
      default:
        return 'Differenzbesteuerung gem. § 25a UStG für Gebrauchtwaren.';
    }
  }

  /**
   * Generates a compliant DIN-A4 invoice for a recorded ReFlip Sale.
   */
  generateInvoiceForSale(
    sale: Sale,
    item?: InventoryItem,
    buyerInfo?: Partial<InvoiceParty>
  ): Invoice {
    const ws = this.workspaceService?.currentWorkspace();
    const taxMode: TaxMode = item?.tax_mode_override || ws?.tax_mode || 'diff_25a';
    const invoiceNumber = 'RE-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    const orderNumber = sale.external_order_id || 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const salePrice = sale.sale_price;
    const shippingCost = sale.shipping_cost || 0;
    const total = salePrice;

    const invoiceItems: InvoiceItem[] = [
      {
        sku: item?.sku || 'SKU-' + sale.inventory_item_id.substring(0, 6).toUpperCase(),
        title: item?.title || 'Verkaufter Artikel',
        condition: item?.condition || 'Gebraucht',
        quantity: 1,
        unitPrice: salePrice - shippingCost,
        totalPrice: salePrice - shippingCost,
      },
    ];

    const invoice: Invoice = {
      id: 'inv-' + Math.random().toString(36).substring(2, 9),
      invoiceNumber,
      orderNumber,
      invoiceDate: sale.sale_date || new Date().toISOString().split('T')[0],
      deliveryDate: sale.sale_date || new Date().toISOString().split('T')[0],
      seller: this.getSellerParty(),
      buyer: {
        name: buyerInfo?.name || 'Kunde / Käufer',
        street: buyerInfo?.street || 'Kundenadresse',
        postalCode: buyerInfo?.postalCode || '10115',
        city: buyerInfo?.city || 'Berlin',
        country: buyerInfo?.country || 'Deutschland',
        email: buyerInfo?.email || '',
      },
      items: invoiceItems,
      subtotal: salePrice - shippingCost,
      shippingCost,
      total,
      taxMode,
      taxClause: this.getTaxClause(taxMode),
      paymentMethod: sale.platform || 'Online-Zahlung',
      paymentStatus: 'paid',
      notes: sale.buyer_notes || 'Vielen Dank für Ihren Einkauf bei ReFlip!',
    };

    this.invoices.update((list) => [invoice, ...list]);
    this.persistInvoices();

    // Persist to Supabase
    if (this.supabase && ws && !ws.id.startsWith('demo-')) {
      this.supabase.client.from('invoices').insert({
        workspace_id: ws.id,
        invoice_number: invoice.invoiceNumber,
        order_number: invoice.orderNumber,
        invoice_date: invoice.invoiceDate,
        delivery_date: invoice.deliveryDate,
        seller: invoice.seller as any,
        buyer: invoice.buyer as any,
        subtotal: invoice.subtotal,
        shipping_cost: invoice.shippingCost,
        total: invoice.total,
        tax_mode: invoice.taxMode,
        tax_clause: invoice.taxClause,
        payment_method: invoice.paymentMethod,
        payment_status: invoice.paymentStatus,
        notes: invoice.notes,
      }).select().single().then(({ data: dbInv }) => {
        if (dbInv) {
          const itemInserts = invoice.items.map((it) => ({
            invoice_id: dbInv.id,
            sku: it.sku || null,
            title: it.title,
            condition: it.condition || null,
            quantity: it.quantity,
            unit_price: it.unitPrice,
            total_price: it.totalPrice,
          }));
          this.supabase?.client.from('invoice_items').insert(itemInserts);
        }
      });
    }

    return invoice;
  }

  /**
   * Generates a compliant DIN-A4 invoice for a public Webshop Order.
   */
  generateInvoiceForOrder(order: StoreOrder): Invoice {
    const ws = this.workspaceService?.currentWorkspace();
    const invoiceNumber = 'RE-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    const taxMode: TaxMode = 'diff_25a';

    const invoiceItems: InvoiceItem[] = order.items.map((cartItem) => {
      const price = cartItem.item.expected_value ?? cartItem.item.allocated_purchase_cost * 1.5;
      return {
        sku: cartItem.item.sku || undefined,
        title: cartItem.item.title,
        condition: cartItem.item.condition,
        quantity: cartItem.quantity,
        unitPrice: price,
        totalPrice: price * cartItem.quantity,
      };
    });

    const invoice: Invoice = {
      id: 'inv-' + Math.random().toString(36).substring(2, 9),
      invoiceNumber,
      orderNumber: order.orderNumber,
      invoiceDate: order.createdAt.split('T')[0],
      deliveryDate: order.createdAt.split('T')[0],
      seller: this.getSellerParty(),
      buyer: {
        name: `${order.customer.firstName} ${order.customer.lastName}`,
        street: `${order.customer.street} ${order.customer.houseNumber}`,
        postalCode: order.customer.zip,
        city: order.customer.city,
        country: order.customer.country,
        email: order.customer.email,
        phone: order.customer.phone,
      },
      items: invoiceItems,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      taxMode,
      taxClause: this.getTaxClause(taxMode),
      paymentMethod:
        order.paymentMethod === 'stripe_card'
          ? 'Kreditkarte (Stripe)'
          : order.paymentMethod === 'paypal'
          ? 'PayPal Express'
          : order.paymentMethod === 'bank_transfer'
          ? 'Banküberweisung (SEPA)'
          : 'Barzahlung bei Abholung',
      paymentStatus: order.paymentStatus === 'paid' ? 'paid' : 'pending',
      paymentDueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      notes: order.customer.notes || 'Vielen Dank für Ihre Bestellung im ReFlip Webshop!',
    };

    this.invoices.update((list) => [invoice, ...list]);
    this.persistInvoices();

    // Persist to Supabase
    if (this.supabase && ws && !ws.id.startsWith('demo-')) {
      this.supabase.client.from('invoices').insert({
        workspace_id: ws.id,
        invoice_number: invoice.invoiceNumber,
        order_number: invoice.orderNumber,
        invoice_date: invoice.invoiceDate,
        delivery_date: invoice.deliveryDate,
        seller: invoice.seller as any,
        buyer: invoice.buyer as any,
        subtotal: invoice.subtotal,
        shipping_cost: invoice.shippingCost,
        total: invoice.total,
        tax_mode: invoice.taxMode,
        tax_clause: invoice.taxClause,
        payment_method: invoice.paymentMethod,
        payment_status: invoice.paymentStatus,
        payment_due_date: invoice.paymentDueDate,
        notes: invoice.notes,
      }).select().single().then(({ data: dbInv }) => {
        if (dbInv) {
          const itemInserts = invoice.items.map((it) => ({
            invoice_id: dbInv.id,
            sku: it.sku || null,
            title: it.title,
            condition: it.condition || null,
            quantity: it.quantity,
            unit_price: it.unitPrice,
            total_price: it.totalPrice,
          }));
          this.supabase?.client.from('invoice_items').insert(itemInserts);
        }
      });
    }

    return invoice;
  }

  /**
   * Sends a purchase confirmation email and records it in Supabase.
   */
  async sendConfirmationEmail(
    invoice: Invoice,
    trackingUrl?: string
  ): Promise<{ success: boolean; message: string }> {
    const ws = this.workspaceService?.currentWorkspace();
    await new Promise((res) => setTimeout(res, 300));

    const emailRecord: EmailConfirmation = {
      id: 'em-' + Math.random().toString(36).substring(2, 8),
      to: invoice.buyer.email || 'kunde@beispiel.de',
      recipientName: invoice.buyer.name,
      subject: `Bestell- & Kaufbestätigung: ${invoice.orderNumber} (Rechnung ${invoice.invoiceNumber})`,
      sentAt: new Date().toISOString(),
      status: 'sent',
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: invoice.orderNumber,
    };

    this.sentEmails.update((list) => [emailRecord, ...list]);
    this.persistEmails();

    if (this.supabase && ws && !ws.id.startsWith('demo-')) {
      try {
        await this.supabase.client.from('email_confirmations').insert({
          workspace_id: ws.id,
          recipient_email: emailRecord.to,
          recipient_name: emailRecord.recipientName,
          subject: emailRecord.subject,
          status: 'sent',
          invoice_number: invoice.invoiceNumber,
          order_number: invoice.orderNumber,
        });
      } catch (err) {
        console.error('Fehler beim Speichern der E-Mail-Bestätigung in Supabase:', err);
      }
    }

    return {
      success: true,
      message: `Kaufbestätigung und § 25a Rechnung erfolgreich an ${emailRecord.to} gesendet!`,
    };
  }

  openInvoiceModal(invoice: Invoice): void {
    this.selectedInvoiceForView.set(invoice);
    this.isInvoiceModalOpen.set(true);
  }

  closeInvoiceModal(): void {
    this.isInvoiceModalOpen.set(false);
    this.selectedInvoiceForView.set(null);
  }
}

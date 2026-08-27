import { Injectable, effect, inject, signal } from '@angular/core';
import { WorkspaceService } from './workspace.service';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { InventoryItem, Sale, SaleLine, TaxMode } from '../models/flipbase.models';
import { StoreOrder } from '../models/store.models';
import { EmailConfirmation, Invoice, InvoiceItem, InvoiceParty } from '../models/invoice.models';
import { Json } from '../models/supabase.types';
import { LoggerService } from './logger.service';
import { SyncStatusService } from './sync-status.service';

const STORAGE_KEY_INVOICES = 'flipbase_generated_invoices';
const STORAGE_KEY_EMAILS = 'flipbase_sent_emails';

export interface EmailConfirmationResult {
  readonly success: boolean;
  readonly message: string;
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
}

export interface InvoiceGenerationResult {
  readonly data: Invoice | null;
  readonly error: Error | null;
  readonly created: boolean;
  readonly reportedBySyncStatus: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class InvoiceService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true });
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });

  readonly invoices = signal<Invoice[]>(this.loadInvoices());
  readonly sentEmails = signal<EmailConfirmation[]>(this.loadEmails());

  readonly selectedInvoiceForView = signal<Invoice | null>(null);
  readonly isInvoiceModalOpen = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  private loadVersion = 0;

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        void this.loadFromSupabase(ws?.id ?? '');
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
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
    const requestedWorkspaceId = workspaceId.trim();
    if (!requestedWorkspaceId) {
      this.loadVersion++;
      this.resetWorkspaceData();
      this.isLoading.set(false);
      return;
    }
    if (!this.isCurrentWorkspace(requestedWorkspaceId)) return;
    if (!this.supabase || this.mockStore?.isDemoMode()) return;

    const loadVersion = ++this.loadVersion;
    this.resetWorkspaceData();

    this.isLoading.set(true);
    try {
      const [invRes, emailRes] = await Promise.all([
        this.supabase.client
          .from('invoices')
          .select(
            `
            *,
            items:invoice_items(*)
          `,
          )
          .eq('workspace_id', workspaceId)
          .order('invoice_date', { ascending: false }),
        this.supabase.client
          .from('email_confirmations')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('sent_at', { ascending: false }),
      ]);

      if (!this.isCurrentRequest(requestedWorkspaceId, loadVersion)) return;

      const mapped: Invoice[] = ((invRes.data ?? []) as unknown[]).map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        orderNumber: inv.order_number,
        invoiceDate: inv.invoice_date,
        deliveryDate: inv.delivery_date,
        seller: (inv.seller as InvoiceParty) || this.getSellerParty(),
        buyer: (inv.buyer as InvoiceParty) || {
          name: 'Kunde',
          street: '',
          postalCode: '',
          city: '',
          country: 'Deutschland',
        },
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
        sourceType: inv.sale_id ? 'sale' : inv.store_order_id ? 'store_order' : undefined,
        sourceId: inv.sale_id || inv.store_order_id || undefined,
      }));
      this.invoices.set(mapped);
      this.persistInvoices();

      const mappedEmails: EmailConfirmation[] = ((emailRes.data ?? []) as unknown[]).map(
        (e: any) => ({
          id: e.id,
          to: e.recipient_email,
          recipientName: e.recipient_name,
          subject: e.subject,
          sentAt: e.sent_at,
          status: e.status as 'sent' | 'draft',
          invoiceNumber: e.invoice_number || '',
          orderNumber: e.order_number || '',
        }),
      );
      this.sentEmails.set(mappedEmails);
      this.persistEmails();
    } catch (err) {
      if (this.isCurrentRequest(requestedWorkspaceId, loadVersion)) {
        this.logger.error('Verbindungsfehler beim Laden der Rechnungen:', err);
      }
    } finally {
      if (this.isCurrentRequest(requestedWorkspaceId, loadVersion)) {
        this.isLoading.set(false);
      }
    }
  }

  private resetWorkspaceData(): void {
    this.invoices.set([]);
    this.sentEmails.set([]);
    this.selectedInvoiceForView.set(null);
  }

  private isCurrentWorkspace(workspaceId: string): boolean {
    return !this.workspaceService || this.workspaceService.currentWorkspace()?.id === workspaceId;
  }

  private isCurrentRequest(workspaceId: string, requestVersion: number): boolean {
    return (this.loadVersion ?? 0) === requestVersion && this.isCurrentWorkspace(workspaceId);
  }

  getSellerParty(): InvoiceParty {
    const ws = this.workspaceService?.currentWorkspace();
    return {
      name: ws?.name || 'Flipbase Reselling GmbH & Co. KG',
      company: 'Flipbase Reselling',
      street: 'Gewerbestraße 10',
      postalCode: '10115',
      city: 'Berlin',
      country: 'Deutschland',
      email: 'rechnung@flipbase.de',
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
   * Generates a compliant DIN-A4 invoice for a recorded Flipbase Sale.
   */
  async generateInvoiceForSale(
    sale: Sale,
    item?: InventoryItem,
    buyerInfo?: Partial<InvoiceParty>,
  ): Promise<InvoiceGenerationResult> {
    if (!this.istPersistenterModus()) {
      const vorhandeneRechnung = this.invoices().find(
        (invoice) => invoice.sourceType === 'sale' && invoice.sourceId === sale.id,
      );
      if (vorhandeneRechnung) return this.rechnungserfolg(vorhandeneRechnung, false);
    }
    const ws = this.workspaceService?.currentWorkspace();
    const persistedLines = sale.has_persisted_lines === false ? [] : (sale.lines ?? []);
    const taxMode: TaxMode =
      persistedLines[0]?.tax_mode || item?.tax_mode_override || ws?.tax_mode || 'diff_25a';
    const invoiceNumber =
      'RE-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    const orderNumber =
      sale.external_order_id || 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const salePrice = sale.sale_price;
    const shippingCost = sale.shipping_cost || 0;
    const total = salePrice;

    const invoiceItems: InvoiceItem[] =
      persistedLines.length > 0
        ? this.invoiceItemsForPersistedLines(sale, item, persistedLines)
        : [
            {
              sku:
                item?.sku ||
                'SKU-' + (sale.inventory_item_id ?? sale.id).substring(0, 6).toUpperCase(),
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
      notes: sale.buyer_notes || 'Vielen Dank für Ihren Einkauf bei Flipbase!',
      sourceType: 'sale',
      sourceId: sale.id,
    };
    return this.speichereOderLeseRechnung(invoice, sale.id, null, ws?.id);
  }

  private invoiceItemsForPersistedLines(
    sale: Sale,
    item: InventoryItem | undefined,
    lines: readonly SaleLine[],
  ): InvoiceItem[] {
    const subtotal = sale.sale_price - (sale.shipping_cost || 0);
    return lines.flatMap((line, index) => {
      const lineSubtotalCents = this.toCents(this.invoiceLineSubtotal(subtotal, lines, index));
      const groups = this.quantityPriceGroups(lineSubtotalCents, line.quantity);
      const sku =
        line.inventory_item_id ||
        line.catalog_product_id ||
        `SKU-${sale.id.substring(0, 6).toUpperCase()}`;
      return groups.map((group, groupIndex) => ({
        sku,
        title:
          groups.length === 1
            ? line.title_snapshot
            : `${line.title_snapshot} (Preisgruppe ${groupIndex + 1})`,
        condition: line.inventory_item_id === sale.inventory_item_id ? item?.condition : undefined,
        quantity: group.quantity,
        unitPrice: group.unitPriceCents / 100,
        totalPrice: (group.unitPriceCents * group.quantity) / 100,
      }));
    });
  }

  /** Teilt Rest-Cents auf höchstens zwei nichtnegative Preisgruppen derselben Position auf. */
  private quantityPriceGroups(
    totalCents: number,
    quantity: number,
  ): readonly { quantity: number; unitPriceCents: number }[] {
    const baseUnitPriceCents = Math.floor(totalCents / quantity);
    const higherPriceQuantity = totalCents % quantity;
    const lowerPriceQuantity = quantity - higherPriceQuantity;
    const groups: { quantity: number; unitPriceCents: number }[] = [];
    if (lowerPriceQuantity > 0) {
      groups.push({ quantity: lowerPriceQuantity, unitPriceCents: baseUnitPriceCents });
    }
    if (higherPriceQuantity > 0) {
      groups.push({ quantity: higherPriceQuantity, unitPriceCents: baseUnitPriceCents + 1 });
    }
    return groups;
  }

  private invoiceLineSubtotal(subtotal: number, lines: readonly SaleLine[], index: number): number {
    const subtotalCents = this.toCents(subtotal);
    const totalLineValueCents = lines.reduce((sum, line) => sum + this.toCents(line.line_total), 0);
    if (totalLineValueCents <= 0) return index === lines.length - 1 ? subtotalCents / 100 : 0;
    if (index === lines.length - 1) {
      const earlier = lines
        .slice(0, index)
        .reduce(
          (sum, line) =>
            sum + Math.round((subtotalCents * this.toCents(line.line_total)) / totalLineValueCents),
          0,
        );
      return (subtotalCents - earlier) / 100;
    }
    return (
      Math.round((subtotalCents * this.toCents(lines[index].line_total)) / totalLineValueCents) /
      100
    );
  }

  private toCents(value: number): number {
    return Math.round(value * 100);
  }

  /**
   * Generates a compliant DIN-A4 invoice for a public Webshop Order.
   */
  async generateInvoiceForOrder(order: StoreOrder): Promise<InvoiceGenerationResult> {
    if (!this.istPersistenterModus()) {
      const vorhandeneRechnung = this.invoices().find(
        (invoice) => invoice.sourceType === 'store_order' && invoice.sourceId === order.id,
      );
      if (vorhandeneRechnung) return this.rechnungserfolg(vorhandeneRechnung, false);
    }
    const ws = this.workspaceService?.currentWorkspace();
    const invoiceNumber =
      'RE-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
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
      notes: order.customer.notes || 'Vielen Dank für Ihre Bestellung im Flipbase Webshop!',
      sourceType: 'store_order',
      sourceId: order.id,
    };
    return this.speichereOderLeseRechnung(invoice, null, order.id, ws?.id);
  }

  private async speichereOderLeseRechnung(
    entwurf: Invoice,
    saleId: string | null,
    storeOrderId: string | null,
    workspaceId: string | undefined,
  ): Promise<InvoiceGenerationResult> {
    const persistenterModus = this.istPersistenterModus();
    const requestVersion = this.loadVersion ?? 0;
    if (persistenterModus && !workspaceId) {
      return this.rechnungsfehler(new Error('Kein aktiver Workspace.'));
    }

    if (persistenterModus) {
      try {
        const { data, error } = await (
          this.supabase!.client as unknown as {
            rpc(
              name: 'create_or_get_invoice',
              args: Record<string, unknown>,
            ): Promise<{ data: unknown; error: unknown | null }>;
          }
        ).rpc('create_or_get_invoice', {
          p_workspace_id: workspaceId,
          p_sale_id: saleId,
          p_store_order_id: storeOrderId,
          p_invoice: {
            invoice_number: entwurf.invoiceNumber,
            order_number: entwurf.orderNumber,
            invoice_date: entwurf.invoiceDate,
            delivery_date: entwurf.deliveryDate,
            seller: entwurf.seller,
            buyer: entwurf.buyer,
            subtotal: entwurf.subtotal,
            shipping_cost: entwurf.shippingCost,
            total: entwurf.total,
            tax_mode: entwurf.taxMode,
            tax_clause: entwurf.taxClause,
            payment_method: entwurf.paymentMethod,
            payment_status: entwurf.paymentStatus,
            payment_due_date: entwurf.paymentDueDate ?? null,
            notes: entwurf.notes ?? null,
          } as unknown as Json,
          p_items: entwurf.items.map((item) => ({
            sku: item.sku ?? null,
            title: item.title,
            condition: item.condition ?? null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
          })) as unknown as Json,
        });
        if (error || !data) {
          return this.rechnungsfehler(
            error ?? new Error('Die Datenbank hat keine Rechnung zurückgegeben.'),
          );
        }
        const gespeichert = this.leseRpcRechnung(data);
        if (!gespeichert) {
          return this.rechnungsfehler(
            new Error('Die Datenbank hat keine vollständige Rechnung zurückgegeben.'),
          );
        }
        if (!this.isCurrentRequest(workspaceId!, requestVersion)) {
          return this.veralteteRechnungsanfrage();
        }
        this.invoices.update((list) => [
          gespeichert.invoice,
          ...list.filter((invoice) => invoice.id !== gespeichert.invoice.id),
        ]);
        this.persistInvoices();
        return this.rechnungserfolg(gespeichert.invoice, gespeichert.created);
      } catch (ursache: unknown) {
        return this.rechnungsfehler(ursache);
      }
    }

    this.invoices.update((list) => [entwurf, ...list]);
    this.persistInvoices();
    return this.rechnungserfolg(entwurf, true);
  }

  private leseRpcRechnung(data: unknown): { invoice: Invoice; created: boolean } | null {
    if (typeof data !== 'object' || data === null || !('invoice' in data) || !('items' in data)) {
      return null;
    }
    const payload = data as { invoice: Record<string, unknown>; items: unknown; created?: unknown };
    const db = payload.invoice;
    if (typeof db?.['id'] !== 'string' || !Array.isArray(payload.items)) return null;
    const items: InvoiceItem[] = payload.items.map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        sku: typeof item['sku'] === 'string' ? item['sku'] : undefined,
        title: String(item['title'] ?? ''),
        condition: typeof item['condition'] === 'string' ? item['condition'] : undefined,
        quantity: Number(item['quantity'] ?? 0),
        unitPrice: Number(item['unit_price'] ?? 0),
        totalPrice: Number(item['total_price'] ?? 0),
      };
    });
    if (items.length === 0 || items.some((item) => !item.title || item.quantity < 1)) return null;
    const invoice: Invoice = {
      id: db['id'],
      invoiceNumber: String(db['invoice_number'] ?? ''),
      orderNumber: String(db['order_number'] ?? ''),
      invoiceDate: String(db['invoice_date'] ?? ''),
      deliveryDate: String(db['delivery_date'] ?? ''),
      seller: db['seller'] as unknown as InvoiceParty,
      buyer: db['buyer'] as unknown as InvoiceParty,
      items,
      subtotal: Number(db['subtotal'] ?? 0),
      shippingCost: Number(db['shipping_cost'] ?? 0),
      total: Number(db['total'] ?? 0),
      taxMode: String(db['tax_mode'] ?? 'diff_25a') as TaxMode,
      taxClause: String(db['tax_clause'] ?? ''),
      paymentMethod: String(db['payment_method'] ?? ''),
      paymentStatus: db['payment_status'] === 'pending' ? 'pending' : 'paid',
      paymentDueDate:
        typeof db['payment_due_date'] === 'string' ? db['payment_due_date'] : undefined,
      notes: typeof db['notes'] === 'string' ? db['notes'] : undefined,
      sourceType: db['sale_id'] ? 'sale' : 'store_order',
      sourceId: String(db['sale_id'] ?? db['store_order_id'] ?? ''),
    };
    if (!invoice.invoiceNumber || !invoice.sourceId) return null;
    return { invoice, created: payload.created === true };
  }

  private rechnungserfolg(invoice: Invoice, created: boolean): InvoiceGenerationResult {
    return { data: invoice, error: null, created, reportedBySyncStatus: false };
  }

  private istPersistenterModus(): boolean {
    return Boolean(this.supabase && !this.mockStore?.isDemoMode());
  }

  private rechnungsfehler(ursache: unknown): InvoiceGenerationResult {
    const error =
      this.syncStatus?.melde('Erstellen der Rechnung', ursache) ??
      (ursache instanceof Error ? ursache : new Error(String(ursache)));
    return {
      data: null,
      error,
      created: false,
      reportedBySyncStatus: this.syncStatus?.istZentralGemeldet(error) ?? false,
    };
  }

  private veralteteRechnungsanfrage(): InvoiceGenerationResult {
    return {
      data: null,
      error: new Error('Der Workspace wurde während der Rechnungserstellung gewechselt.'),
      created: false,
      reportedBySyncStatus: false,
    };
  }

  /**
   * Bereitet eine Kaufbestätigung vor und protokolliert sie in Supabase.
   * Ein tatsächlicher Versand findet ohne angebundenen E-Mail-Provider nicht statt.
   */
  async prepareConfirmationEmail(
    invoice: Invoice,
    _trackingUrl?: string,
  ): Promise<EmailConfirmationResult> {
    const ws = this.workspaceService?.currentWorkspace();
    const requestVersion = this.loadVersion ?? 0;
    if (this.supabase && !this.mockStore?.isDemoMode() && !ws) {
      return {
        success: false,
        message: '',
        error:
          this.syncStatus?.melde(
            'Speichern der E-Mail-Bestätigung',
            new Error('Kein aktiver Workspace.'),
          ) ?? new Error('Kein aktiver Workspace.'),
        reportedBySyncStatus: Boolean(this.syncStatus),
      };
    }

    const emailRecord: EmailConfirmation = {
      id: 'em-' + Math.random().toString(36).substring(2, 8),
      to: invoice.buyer.email || 'kunde@beispiel.de',
      recipientName: invoice.buyer.name,
      subject: `Bestell- & Kaufbestätigung: ${invoice.orderNumber} (Rechnung ${invoice.invoiceNumber})`,
      sentAt: new Date().toISOString(),
      status: 'draft',
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: invoice.orderNumber,
    };

    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      try {
        const { data, error } = await this.supabase.client
          .from('email_confirmations')
          .insert({
            workspace_id: ws.id,
            recipient_email: emailRecord.to,
            recipient_name: emailRecord.recipientName,
            subject: emailRecord.subject,
            status: 'draft',
            invoice_number: invoice.invoiceNumber,
            order_number: invoice.orderNumber,
          })
          .select('id')
          .maybeSingle();
        if (error || !data) {
          return {
            success: false,
            message: '',
            error:
              this.syncStatus?.melde(
                'Speichern der E-Mail-Bestätigung',
                error ?? new Error('Die Datenbank hat keine E-Mail-Bestätigung zurückgegeben.'),
              ) ?? new Error('Die E-Mail-Bestätigung konnte nicht gespeichert werden.'),
            reportedBySyncStatus: Boolean(this.syncStatus),
          };
        }
        if (!this.isCurrentRequest(ws.id, requestVersion)) {
          return {
            success: false,
            message: '',
            error: new Error(
              'Der Workspace wurde während des Speicherns der E-Mail-Bestätigung gewechselt.',
            ),
            reportedBySyncStatus: false,
          };
        }
      } catch (ursache: unknown) {
        const error =
          ursache instanceof Error && this.syncStatus?.istZentralGemeldet(ursache)
            ? ursache
            : (this.syncStatus?.melde('Speichern der E-Mail-Bestätigung', ursache) ??
              (ursache instanceof Error
                ? ursache
                : new Error('Die E-Mail-Bestätigung konnte nicht gespeichert werden.')));
        return {
          success: false,
          message: '',
          error,
          reportedBySyncStatus: this.syncStatus?.istZentralGemeldet(error) ?? false,
        };
      }
    }

    this.sentEmails.update((list) => [emailRecord, ...list]);
    this.persistEmails();

    return {
      success: true,
      message: `Kaufbestätigung und § 25a Rechnung wurden für ${emailRecord.to} vorbereitet.`,
      error: null,
      reportedBySyncStatus: false,
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

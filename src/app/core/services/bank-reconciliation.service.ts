import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { StoreService } from './store.service';
import { SalesService } from './sales.service';
import { PurchaseService } from './purchase.service';
import { InvoiceService } from './invoice.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { LoggerService } from './logger.service';
import { SyncStatusService } from './sync-status.service';
import { Json } from '../models/supabase.types';
import {
  BankFormatType,
  BankReconciliationMatch,
  BankReconciliationSummary,
  BankStatementImportResult,
  BankTransaction,
} from '../models/bank-reconciliation.models';

/**
 * Kennung fuer eine Bankbewegung.
 *
 * Muss eine UUID sein, weil die Spalte `id` in der Datenbank eine ist -
 * frueher standen hier Zeichenketten wie "tx-csv-3-lz9", die dort nie haetten
 * ankommen koennen.
 */
function neueKennung(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0');
}

const STORAGE_KEY_BANK_TRANSACTIONS = 'flipbase_bank_transactions';

@Injectable({
  providedIn: 'root',
})
export class BankReconciliationService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true });
  private readonly storeService = inject(StoreService);
  private readonly salesService = inject(SalesService);
  private readonly purchaseService = inject(PurchaseService);
  private readonly invoiceService = inject(InvoiceService);

  readonly transactions = signal<BankTransaction[]>(this.loadStoredTransactions());
  readonly isProcessing = signal<boolean>(false);
  readonly selectedTransaction = signal<BankTransaction | null>(null);

  constructor() {
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        if (ws) {
          this.loadFromSupabase(ws.id);
        }
      });
    } catch {
      // Ignored in unit testing environments without ChangeDetectionScheduler
    }
  }

  async loadFromSupabase(workspaceId: string): Promise<void> {
    if (!this.supabase || this.mockStore?.isDemoMode()) return;

    try {
      const { data, error } = await this.supabase.client
        .from('bank_transactions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('booking_date', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: BankTransaction[] = (data as unknown[]).map((t: any) => ({
          id: t.id,
          bookingDate: t.booking_date,
          valueDate: t.value_date || undefined,
          counterpartyName: t.counterparty_name,
          counterpartyIban: t.counterparty_iban || undefined,

          purpose: t.purpose,
          amount: Number(t.amount),
          currency: t.currency,
          sourceFormat: t.source_format as BankFormatType,
          status: t.status,
          match: (t.match_json as BankReconciliationMatch) || undefined,
          bookedAt: t.booked_at || undefined,
        }));
        this.transactions.set(mapped);
        this.persistTransactions();
      }
    } catch (err) {
      this.logger.error('Verbindungsfehler beim Laden der Banktransaktionen:', err);
    }
  }

  readonly summary = computed<BankReconciliationSummary>(() => {
    const list = this.transactions();
    let totalIncome = 0;
    let totalExpense = 0;
    let matchedCount = 0;
    let bookedCount = 0;
    let openCount = 0;

    for (const tx of list) {
      if (tx.amount > 0) {
        totalIncome += tx.amount;
      } else {
        totalExpense += Math.abs(tx.amount);
      }

      if (tx.status === 'booked') {
        bookedCount++;
      } else if (tx.status === 'matched') {
        matchedCount++;
      } else if (tx.status === 'pending') {
        openCount++;
      }
    }

    const totalActive = list.filter((t) => t.status !== 'ignored').length;
    const matchableCount = matchedCount + bookedCount;
    const autoMatchRate = totalActive > 0 ? Math.round((matchableCount / totalActive) * 100) : 0;

    return {
      totalCount: list.length,
      totalIncome,
      totalExpense,
      matchedCount,
      bookedCount,
      openCount,
      autoMatchRate,
    };
  });

  private loadStoredTransactions(): BankTransaction[] {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY_BANK_TRANSACTIONS);
        if (stored) return JSON.parse(stored);
      }
    } catch {}
    return [];
  }

  /**
   * Sichert die Bankbewegungen - im Browser **und** in der Datenbank.
   *
   * Die Datenbankhaelfte fehlte komplett: Die Tabelle `bank_transactions` wurde
   * nur gelesen, nie beschrieben. Der gesamte Kontenabgleich - importierte
   * Auszuege, Zuordnungen, gebuchte Vorgaenge - lag damit allein im
   * Browser-Speicher eines einzigen Geraets. Ein anderer Rechner zeigte nichts,
   * ein geleerter Browser loeschte alles, und die naechtliche Sicherung
   * erfasste nichts davon. Fuer Buchhaltungsdaten ist das der falsche Ort.
   *
   * Der Browser-Speicher bleibt als schneller Zwischenspeicher bestehen.
   */
  private persistTransactions(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_BANK_TRANSACTIONS, JSON.stringify(this.transactions()));
      }
    } catch {
      // Ohne Browser-Speicher bleibt die Datenbank die Quelle.
    }

    void this.speichereInDatenbank();
  }

  /**
   * Schreibt den aktuellen Stand in die Datenbank.
   *
   * Erst schreiben, dann entfernen, was es nicht mehr gibt: So entsteht kein
   * Moment, in dem der Bestand leer ist, falls das Schreiben scheitert.
   */
  private async speichereInDatenbank(): Promise<void> {
    const ws = this.workspaceService?.currentWorkspace();
    if (!this.supabase || !ws || this.mockStore?.isDemoMode()) return;

    const liste = this.transactions();

    try {
      if (liste.length > 0) {
        const { error } = await this.supabase.client.from('bank_transactions').upsert(
          liste.map((t) => ({
            id: t.id,
            workspace_id: ws.id,
            booking_date: t.bookingDate,
            value_date: t.valueDate || null,
            counterparty_name: t.counterpartyName,
            counterparty_iban: t.counterpartyIban || null,
            purpose: t.purpose,
            amount: t.amount,
            currency: t.currency,
            source_format: t.sourceFormat,
            status: t.status,
            // Der Treffer ist ein eigener Typ; die Spalte nimmt beliebiges JSON.
            match_json: (t.match ?? null) as unknown as Json,
            booked_at: t.bookedAt || null,
          })),
          { onConflict: 'id' },
        );
        if (error) {
          this.syncStatus?.melde('Speichern der Banktransaktionen', error);
          return;
        }
      }

      const vorhandene = liste.map((t) => t.id);
      const loeschen = this.supabase.client
        .from('bank_transactions')
        .delete()
        .eq('workspace_id', ws.id);
      const { error: loeschFehler } = await (vorhandene.length > 0
        ? loeschen.not('id', 'in', `(${vorhandene.join(',')})`)
        : loeschen);
      if (loeschFehler) {
        this.syncStatus?.melde('Aufräumen der Banktransaktionen', loeschFehler);
      }
    } catch (e: unknown) {
      this.syncStatus?.melde('Speichern der Banktransaktionen', e);
    }
  }

  /**
   * Primary File Import Dispatcher. Auto-detects whether file is CSV, MT940 or CAMT.053 XML.
   */
  async importBankStatementFile(file: File): Promise<BankStatementImportResult> {
    this.isProcessing.set(true);
    try {
      const text = await file.text();
      const fileName = file.name.toLowerCase();

      let parsed: BankTransaction[] = [];
      let format: BankFormatType = 'csv_auto';

      if (fileName.endsWith('.xml') || text.includes('<?xml') || text.includes('<Document')) {
        format = 'camt053';
        parsed = this.parseCamt053Xml(text);
      } else if (
        fileName.endsWith('.sta') ||
        fileName.endsWith('.940') ||
        text.includes(':20:') ||
        text.includes(':61:')
      ) {
        format = 'mt940';
        parsed = this.parseMt940(text);
      } else {
        format = 'csv_auto';
        parsed = this.parseCsv(text);
      }

      if (parsed.length === 0) {
        return {
          success: false,
          formatDetected: format,
          fileName: file.name,
          transactionCount: 0,
          totalIncome: 0,
          totalExpense: 0,
          matchedCount: 0,
          message: 'Keine gültigen Banktransaktionen in der Datei gefunden.',
        };
      }

      // Run automatic matching for all imported transactions
      const matched = parsed.map((tx) => this.runMatchingEngine(tx));

      // Append or set
      this.transactions.set(matched);
      this.persistTransactions();

      const matchedCount = matched.filter((t) => t.match && t.match.confidence >= 80).length;
      let totalIncome = 0;
      let totalExpense = 0;
      for (const t of matched) {
        if (t.amount > 0) totalIncome += t.amount;
        else totalExpense += Math.abs(t.amount);
      }

      return {
        success: true,
        formatDetected: format,
        fileName: file.name,
        transactionCount: matched.length,
        totalIncome,
        totalExpense,
        matchedCount,
        message: `${matched.length} Transaktionen (${format.toUpperCase()}) erfolgreich importiert und abgeglichen.`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        formatDetected: 'csv_auto',
        fileName: file.name,
        transactionCount: 0,
        totalIncome: 0,
        totalExpense: 0,
        matchedCount: 0,
        message:
          'Fehler beim Lesen der Bankdatei: ' +
          (err instanceof Error ? err.message : 'Unbekanntes Format'),
      };
    } finally {
      this.isProcessing.set(false);
    }
  }

  /**
   * Parses German bank CSV formats (Sparkasse, DKB, Volksbank, N26, Commerzbank, PayPal).
   */
  public parseCsv(content: string): BankTransaction[] {
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) return [];

    // Detect delimiter
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const headers = this.parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase().trim());

    // Detect column indexes
    let dateIdx = headers.findIndex(
      (h) =>
        h.includes('datum') ||
        h.includes('buchungstag') ||
        h.includes('wertstellung') ||
        h.includes('date'),
    );
    let purposeIdx = headers.findIndex(
      (h) =>
        h.includes('verwendungszweck') ||
        h.includes('buchungstext') ||
        h.includes('beschreibung') ||
        h.includes('description') ||
        h.includes('details'),
    );
    let nameIdx = headers.findIndex(
      (h) =>
        h.includes('beguenstigter') ||
        h.includes('begünstigter') ||
        h.includes('zahlungsempfänger') ||
        h.includes('zahlungspflichtiger') ||
        h.includes('auftraggeber') ||
        h.includes('name') ||
        h.includes('partner'),
    );
    const ibanIdx = headers.findIndex((h) => h.includes('iban') || h.includes('kontonummer'));
    let amountIdx = headers.findIndex(
      (h) =>
        h.includes('betrag') || h.includes('umsatz') || h.includes('amount') || h.includes('wert'),
    );

    // Fallbacks if header matching fails
    if (dateIdx === -1) dateIdx = 0;
    if (nameIdx === -1) nameIdx = 1;
    if (purposeIdx === -1) purposeIdx = 2;
    if (amountIdx === -1) amountIdx = headers.length - 1;

    const results: BankTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCsvLine(lines[i], delimiter);
      if (row.length <= 1) continue;

      const rawDate = row[dateIdx] || '';
      const rawPurpose = row[purposeIdx] || '';
      const rawName = row[nameIdx] || 'Unbekannter Partner';
      const rawIban = ibanIdx !== -1 ? row[ibanIdx] : undefined;
      const rawAmount = row[amountIdx] || '0';

      const bookingDate = this.normalizeDate(rawDate);
      const amount = this.normalizeAmount(rawAmount);

      if (!bookingDate || isNaN(amount)) continue;

      results.push({
        id: neueKennung(),
        bookingDate,
        counterpartyName: rawName.trim(),
        counterpartyIban: rawIban?.trim(),
        purpose: rawPurpose.trim(),
        amount,
        currency: 'EUR',
        sourceFormat: 'csv_sparkasse',
        status: 'pending',
      });
    }

    return results;
  }

  /**
   * Parses standard MT940 SWIFT bank statement text files.
   */
  public parseMt940(content: string): BankTransaction[] {
    const results: BankTransaction[] = [];
    const blocks = content.split(':61:');

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const lines = block.split(/\r?\n/);
      const headerLine = lines[0];

      // Parse :61: YYMMDD[MMDD]C/D Amount
      // Example: 2608150815CR149,99NTRFNONREF
      const dateMatch = headerLine.match(/^(\d{6})/);
      let bookingDate = new Date().toISOString().split('T')[0];
      if (dateMatch) {
        const yy = '20' + dateMatch[1].substring(0, 2);
        const mm = dateMatch[1].substring(2, 4);
        const dd = dateMatch[1].substring(4, 6);
        bookingDate = `${yy}-${mm}-${dd}`;
      }

      const isCredit = headerLine.includes('CR') || headerLine.includes('C');
      const amountMatch = headerLine.match(/[CD]R?([0-9]+[,.][0-9]{2})/);
      let amount = 0;
      if (amountMatch) {
        amount = parseFloat(amountMatch[1].replace(',', '.'));
        if (!isCredit) amount = -amount;
      }

      // Parse :86: Purpose and counterparty
      let purpose = '';
      let counterpartyName = 'SEPA Überweisung';

      const tag86Idx = block.indexOf(':86:');
      if (tag86Idx !== -1) {
        const raw86 = block
          .substring(tag86Idx + 4)
          .replace(/\r?\n/g, ' ')
          .trim();
        purpose = raw86;

        // Try extracting sub-tags (e.g. ?20, ?32)
        const nameMatch = raw86.match(/\?32([^?]+)/) || raw86.match(/NAME:([^,]+)/);
        if (nameMatch) {
          counterpartyName = nameMatch[1].trim();
        }
      }

      results.push({
        id: neueKennung(),
        bookingDate,
        counterpartyName,
        purpose,
        amount,
        currency: 'EUR',
        sourceFormat: 'mt940',
        status: 'pending',
      });
    }

    return results;
  }

  /**
   * Parses CAMT.053 XML standard ISO 20022 bank statements.
   */
  public parseCamt053Xml(xmlString: string): BankTransaction[] {
    const results: BankTransaction[] = [];
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      const entries = xmlDoc.getElementsByTagName('Ntry');

      for (const ntry of Array.from(entries)) {
        // Date
        const dtElement = ntry.getElementsByTagName('Dt')[0];
        const rawDate = dtElement?.textContent || new Date().toISOString().split('T')[0];

        // Amount & Indicator
        const amtElement = ntry.getElementsByTagName('Amt')[0];
        const cdtDbtInd = ntry.getElementsByTagName('CdtDbtInd')[0]?.textContent || 'CRDT';
        let amount = parseFloat(amtElement?.textContent || '0');
        if (cdtDbtInd === 'DBIT') amount = -amount;

        // Currency
        const currency = amtElement?.getAttribute('Ccy') || 'EUR';

        // Counterparty & Purpose
        const dbtrNm = ntry
          .getElementsByTagName('Dbtr')[0]
          ?.getElementsByTagName('Nm')[0]?.textContent;
        const cdtrNm = ntry
          .getElementsByTagName('Cdtr')[0]
          ?.getElementsByTagName('Nm')[0]?.textContent;
        const counterpartyName = (amount > 0 ? dbtrNm : cdtrNm) || 'Bankkunde';

        const iban = ntry.getElementsByTagName('IBAN')[0]?.textContent;
        const ustrd = ntry.getElementsByTagName('Ustrd')[0]?.textContent || 'SEPA Zahlung';

        results.push({
          id: neueKennung(),
          bookingDate: rawDate,
          counterpartyName,
          counterpartyIban: iban,
          purpose: ustrd,
          amount,
          currency,
          sourceFormat: 'camt053',
          status: 'pending',
        });
      }
    } catch {}

    return results;
  }

  /**
   * Intelligent Matching Engine: Correlates a Bank Transaction with Webshop Orders, Sales, and Purchases.
   */
  public runMatchingEngine(tx: BankTransaction): BankTransaction {
    const purposeLower = (tx.purpose || '').toLowerCase();
    const counterpartyLower = (tx.counterpartyName || '').toLowerCase();
    const absAmount = Math.abs(tx.amount);

    // 1. Positive Amount -> Matching incoming customer payments (Store Orders / Sales)
    if (tx.amount > 0) {
      // Check Store Orders (SEPA Vorkasse or direct)
      const storeOrders = this.storeService.orders();
      for (const ord of storeOrders) {
        const ordNumberLower = ord.orderNumber.toLowerCase();
        const custLastLower = ord.customer.lastName.toLowerCase();
        const isExactAmount = Math.abs(ord.total - absAmount) < 0.02;

        // Perfect Match: Order Number + Exact Amount
        if (purposeLower.includes(ordNumberLower) && isExactAmount) {
          return {
            ...tx,
            status: ord.paymentStatus === 'paid' ? 'booked' : 'matched',
            match: {
              targetType: 'store_order',
              targetId: ord.id,
              targetReference: ord.orderNumber,
              targetName: `${ord.customer.firstName} ${ord.customer.lastName}`,
              targetAmount: ord.total,
              confidence: 100,
              confidenceLabel: 'exact',
              reason: `Exakter Treffer für Webshop-Bestellung ${ord.orderNumber} (Betrag & Bestellnummer stimmen 100% überein)`,
              order: ord,
            },
          };
        }

        // High Confidence: Customer Last Name + Exact Amount
        if (
          custLastLower.length > 2 &&
          (purposeLower.includes(custLastLower) || counterpartyLower.includes(custLastLower)) &&
          isExactAmount
        ) {
          return {
            ...tx,
            status: ord.paymentStatus === 'paid' ? 'booked' : 'matched',
            match: {
              targetType: 'store_order',
              targetId: ord.id,
              targetReference: ord.orderNumber,
              targetName: `${ord.customer.firstName} ${ord.customer.lastName}`,
              targetAmount: ord.total,
              confidence: 95,
              confidenceLabel: 'high',
              reason: `Kundenname "${ord.customer.lastName}" und Rechnungsbetrag (${ord.total.toFixed(2)} €) stimmen überein`,
              order: ord,
            },
          };
        }

        // Probable Match: Exact Amount only for pending store order
        if (isExactAmount && ord.paymentStatus === 'pending') {
          return {
            ...tx,
            status: 'matched',
            match: {
              targetType: 'store_order',
              targetId: ord.id,
              targetReference: ord.orderNumber,
              targetName: `${ord.customer.firstName} ${ord.customer.lastName}`,
              targetAmount: ord.total,
              confidence: 80,
              confidenceLabel: 'probable',
              reason: `Offener Bestellbetrag (${ord.total.toFixed(2)} €) stimmt exakt überein`,
              order: ord,
            },
          };
        }
      }

      // Check Sales records (e.g. eBay Payout, Kleinanzeigen direct transfer)
      const sales = this.salesService.sales();
      for (const sale of sales) {
        const extOrder = (sale.external_order_id || '').toLowerCase();
        const isExactSalePrice = Math.abs(sale.sale_price - absAmount) < 0.02;

        if (extOrder && purposeLower.includes(extOrder) && isExactSalePrice) {
          return {
            ...tx,
            status: 'matched',
            match: {
              targetType: 'sale',
              targetId: sale.id,
              targetReference: sale.external_order_id || 'Verkauf',
              targetName: sale.platform || 'Online-Verkauf',
              targetAmount: sale.sale_price,
              confidence: 95,
              confidenceLabel: 'high',
              reason: `Verkauf auf ${sale.platform} (${sale.external_order_id}) zugeordnet`,
              sale,
            },
          };
        }
      }
    }

    // 2. Negative Amount -> Matching Outgoing Expenses (Purchases & OPEX)
    if (tx.amount < 0) {
      // Check Purchases (Wareneinkauf / Ankäufe)
      const purchases = this.purchaseService.purchases();
      for (const pur of purchases) {
        const isExactCost = Math.abs(pur.purchase_price - absAmount) < 0.05;
        const batchNameLower = (pur.title || '').toLowerCase();
        const sellerLower = (pur.supplier?.name || pur.source?.name || '').toLowerCase();

        if (
          (purposeLower.includes(batchNameLower) || counterpartyLower.includes(sellerLower)) &&
          isExactCost
        ) {
          return {
            ...tx,
            status: 'matched',
            match: {
              targetType: 'purchase',
              targetId: pur.id,
              targetReference: pur.title || 'Ankauf',
              targetName: pur.supplier?.name || 'Lieferant / Verkäufer',
              targetAmount: pur.purchase_price,
              confidence: 95,
              confidenceLabel: 'high',
              reason: `Wareneinkauf "${pur.title}" zugeordnet (${pur.purchase_price.toFixed(2)} €)`,
              purchase: pur,
            },
          };
        }

        if (isExactCost) {
          return {
            ...tx,
            status: 'matched',
            match: {
              targetType: 'purchase',
              targetId: pur.id,
              targetReference: pur.title || 'Ankauf',
              targetName: pur.supplier?.name || 'Lieferant',
              targetAmount: pur.purchase_price,
              confidence: 80,
              confidenceLabel: 'probable',
              reason: `Einkaufsbetrag (${pur.purchase_price.toFixed(2)} €) passt zu Ankauf "${pur.title}"`,
              purchase: pur,
            },
          };
        }
      }

      // Check Operating Expenses (DHL Paketmarken, eBay Gebühren, Verpackung)
      if (
        purposeLower.includes('dhl') ||
        counterpartyLower.includes('dhl') ||
        purposeLower.includes('hermes')
      ) {
        return {
          ...tx,
          status: 'matched',
          match: {
            targetType: 'operating_expense',
            targetId: 'opex-shipping',
            targetReference: 'DHL / Versandmarken',
            targetName: 'DHL Paket GmbH',
            targetAmount: absAmount,
            confidence: 95,
            confidenceLabel: 'high',
            reason: 'Betriebsausgabe: Porto & Versandmarken',
          },
        };
      }

      if (purposeLower.includes('ebay') || counterpartyLower.includes('ebay')) {
        return {
          ...tx,
          status: 'matched',
          match: {
            targetType: 'operating_expense',
            targetId: 'opex-fees',
            targetReference: 'eBay Plattformgebühren',
            targetName: 'eBay GmbH',
            targetAmount: absAmount,
            confidence: 95,
            confidenceLabel: 'high',
            reason: 'Betriebsausgabe: Marktplatz-Gebühren',
          },
        };
      }
    }

    // No match found
    return {
      ...tx,
      status: 'pending',
    };
  }

  /**
   * Books a single matched transaction. Updates StoreOrder or generates invoice if applicable.
   */
  async bookTransaction(txId: string): Promise<{ success: boolean; message: string }> {
    const list = this.transactions();
    const tx = list.find((t) => t.id === txId);
    if (!tx || !tx.match) {
      return { success: false, message: 'Transaktion oder Zuordnung nicht gefunden.' };
    }

    // If matching a Store Order, update order payment status to 'paid'
    if (tx.match.targetType === 'store_order' && tx.match.order) {
      const order = tx.match.order;
      this.storeService.orders.update((orders) =>
        orders.map((o) => (o.id === order.id ? { ...o, paymentStatus: 'paid' as const } : o)),
      );

      // Also ensure § 25a invoice exists
      const existingInvoices = this.invoiceService.invoices();
      const hasInvoice = existingInvoices.some((inv) => inv.orderNumber === order.orderNumber);
      if (!hasInvoice) {
        this.invoiceService.generateInvoiceForOrder({ ...order, paymentStatus: 'paid' });
      }
    }

    const now = new Date().toISOString();
    this.transactions.update((all) =>
      all.map((t) => (t.id === txId ? { ...t, status: 'booked' as const, bookedAt: now } : t)),
    );
    this.persistTransactions();

    return {
      success: true,
      message: `Transaktion "${tx.purpose}" erfolgreich gebucht und mit ${tx.match.targetReference} abgeglichen.`,
    };
  }

  /**
   * Batch books all transactions with high confidence (>= 90%).
   */
  async bookAllExactMatches(): Promise<{ bookedCount: number; message: string }> {
    const list = this.transactions();
    const toBook = list.filter(
      (t) => t.status === 'matched' && t.match && t.match.confidence >= 90,
    );

    for (const tx of toBook) {
      await this.bookTransaction(tx.id);
    }

    return {
      bookedCount: toBook.length,
      message: `${toBook.length} exakte Treffer erfolgreich automatisch gebucht.`,
    };
  }

  /**
   * Manually assigns an unmatched transaction.
   */
  manualAssign(txId: string, match: BankReconciliationMatch): void {
    this.transactions.update((list) =>
      list.map((t) =>
        t.id === txId
          ? {
              ...t,
              status: 'matched' as const,
              match: { ...match, confidence: 100, confidenceLabel: 'manual' as const },
            }
          : t,
      ),
    );
    this.persistTransactions();
  }

  /**
   * Ignores a transaction from reconciliation.
   */
  ignoreTransaction(txId: string): void {
    this.transactions.update((list) =>
      list.map((t) => (t.id === txId ? { ...t, status: 'ignored' as const } : t)),
    );
    this.persistTransactions();
  }

  /**
   * Resets all loaded transactions.
   */
  resetStatement(): void {
    this.transactions.set([]);
    this.persistTransactions();
  }

  /**
   * Loads realistic pre-configured Sparkasse statement data matching demo store orders and purchases.
   */
  loadDemoStatement(): void {
    const orders = this.storeService.orders();
    const firstOrder = orders.length > 0 ? orders[0] : null;
    const purchases = this.purchaseService.purchases();
    const firstPurchase = purchases.length > 0 ? purchases[0] : null;

    const demoTx: BankTransaction[] = [
      {
        id: 'tx-demo-1',
        bookingDate: '2026-08-16',
        counterpartyName: firstOrder
          ? `${firstOrder.customer.firstName} ${firstOrder.customer.lastName}`
          : 'Maximilian Weber',
        counterpartyIban: 'DE89 1005 0000 1234 5678 90',
        purpose: firstOrder
          ? `Bestellung ${firstOrder.orderNumber} Webshop Einkauf`
          : 'Bestellung ORD-748291 Webshop Einkauf',
        amount: firstOrder ? firstOrder.total : 149.99,
        currency: 'EUR',
        sourceFormat: 'csv_sparkasse',
        status: 'pending',
      },
      {
        id: 'tx-demo-2',
        bookingDate: '2026-08-15',
        counterpartyName: 'eBay Payments S.a.r.l.',
        counterpartyIban: 'LU12 0000 9876 5432 1000',
        purpose: 'eBay Auszahlung Verkaufserlöse ID: EBAY-849204',
        amount: 389.5,
        currency: 'EUR',
        sourceFormat: 'csv_sparkasse',
        status: 'pending',
      },
      {
        id: 'tx-demo-3',
        bookingDate: '2026-08-14',
        counterpartyName: firstPurchase?.supplier?.name || 'Insolvenzverwerter Nord',
        counterpartyIban: 'DE44 2004 0000 8888 9999 00',
        purpose: `Rechnung Wareneinkauf ${firstPurchase?.title || 'Elektronik Konvolut'}`,
        amount: -(firstPurchase?.purchase_price || 250.0),
        currency: 'EUR',
        sourceFormat: 'csv_sparkasse',
        status: 'pending',
      },
      {
        id: 'tx-demo-4',
        bookingDate: '2026-08-14',
        counterpartyName: 'DHL Paket GmbH',
        counterpartyIban: 'DE02 1001 0010 0123 4567 89',
        purpose: 'Portoabrechnung Geschäftskunden Juli/August 2026',
        amount: -45.9,
        currency: 'EUR',
        sourceFormat: 'csv_sparkasse',
        status: 'pending',
      },
      {
        id: 'tx-demo-5',
        bookingDate: '2026-08-12',
        counterpartyName: 'Sandra Lehmann',
        counterpartyIban: 'DE21 5005 0000 5555 4444 33',
        purpose: 'Vorauskasse Shop Artikel Audio Verstärker Lehmann',
        amount: 89.0,
        currency: 'EUR',
        sourceFormat: 'csv_sparkasse',
        status: 'pending',
      },
      {
        id: 'tx-demo-6',
        bookingDate: '2026-08-10',
        counterpartyName: 'VerpackungsPlus GmbH',
        counterpartyIban: 'DE33 3003 0000 1111 2222 33',
        purpose: 'Kartonagen & Luftpolsterfolie 50x Faltkarton',
        amount: -32.5,
        currency: 'EUR',
        sourceFormat: 'csv_sparkasse',
        status: 'pending',
      },
    ];

    const matched = demoTx.map((tx) => this.runMatchingEngine(tx));
    this.transactions.set(matched);
    this.persistTransactions();
  }

  // --- Helper Methods ---

  private parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  private normalizeDate(dateStr: string): string {
    const clean = dateStr.replace(/['"]/g, '').trim();
    // Format: DD.MM.YYYY or DD.MM.YY
    const deMatch = clean.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (deMatch) {
      const day = deMatch[1].padStart(2, '0');
      const month = deMatch[2].padStart(2, '0');
      let year = deMatch[3];
      if (year.length === 2) year = '20' + year;
      return `${year}-${month}-${day}`;
    }

    // Format: YYYY-MM-DD
    const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return clean;

    return '';
  }

  private normalizeAmount(amountStr: string): number {
    const clean = amountStr.replace(/['"€\s]/g, '').trim();

    // Check if format is German: 1.234,56
    if (clean.includes(',') && !clean.includes('.')) {
      return parseFloat(clean.replace(',', '.'));
    }
    if (clean.includes('.') && clean.includes(',')) {
      // 1.234,56 -> 1234.56
      return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    }
    return parseFloat(clean);
  }
}

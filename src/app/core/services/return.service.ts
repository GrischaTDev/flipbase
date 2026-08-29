import { Injectable, effect, inject, signal } from '@angular/core';
import { RestockAction, ReturnReason, ReturnRecord } from '../models/return.models';
import { Invoice } from '../models/invoice.models';
import { InventoryItem, Sale, Workspace } from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
import { WorkspaceService } from './workspace.service';
import { WebhookService } from './webhook.service';
import { WebPushService } from './web-push.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SalesService } from './sales.service';
import { Tables } from '../models/supabase.types';

const STORAGE_KEY_RETURNS = 'flipbase_saved_returns';

export interface ProcessReturnResult {
  readonly status: 'success' | 'partial' | 'error';
  readonly data: ReturnRecord | null;
  readonly error: Error | null;
  readonly problems: readonly ReturnFollowUpProblem[];
}

export type ReturnFollowUpKind = 'inventory_status' | 'sale_return_status';

export interface ReturnFollowUpProblem {
  readonly kind: ReturnFollowUpKind;
  readonly error: Error;
  readonly reportedBySyncStatus: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ReturnService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true })!;
  private readonly inventoryService = inject(InventoryService, { optional: true });
  private readonly salesService = inject(SalesService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly webhookService = inject(WebhookService, { optional: true });
  private readonly webPushService = inject(WebPushService, { optional: true });

  readonly returns = signal<ReturnRecord[]>(this.loadPersistedReturns());
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        if (ws) {
          this.loadReturns(ws.id);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  private loadPersistedReturns(): ReturnRecord[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY_RETURNS);
        if (stored) return JSON.parse(stored);
      }
    } catch {}

    return [
      {
        id: 'ret-1',
        workspace_id: 'ws-1',
        sale_id: 'sale-demo-1',
        inventory_item_id: 'item-demo-1',
        credit_note_number: 'GS-2026-0001',
        return_date: '2026-08-14',
        reason: 'buyer_remorse',
        refund_amount: 89.0,
        is_full_refund: true,
        restock_action: 'restock_ready',
        buyer_name: 'Kunde Michael B.',
        notes: 'Widerruf innerhalb 14 Tagen. Originalverpackt und ungeöffnet zurückerhalten.',
        created_at: '2026-08-14T11:00:00Z',
      },
    ];
  }

  private persistReturns(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_RETURNS, JSON.stringify(this.returns()));
      }
    } catch {}
  }

  async loadReturns(workspaceId: string): Promise<void> {
    if (!this.supabase || this.mockStore?.isDemoMode()) return;

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('returns')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('return_date', { ascending: false });

      if (error) {
        this.syncStatus.melde('Laden der Retouren', error);
      } else if (data && data.length > 0) {
        const mapped: ReturnRecord[] = (data as Tables<'returns'>[]).map((r) => ({
          ...r,
          reason: r.reason as ReturnReason,
          restock_action: r.restock_action as RestockAction,
          refund_amount: Number(r.refund_amount || 0),
          buyer_name: r.buyer_name || undefined,
          notes: r.notes || undefined,
        }));
        this.returns.set(mapped);
        this.persistReturns();
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Retouren', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Stellt den Belegzustand nach einer bereits atomar gebuchten Retoure lokal
   * bereit. Diese Methode schreibt bewusst nicht in die Datenbank: Die
   * Datenbankbuchung wurde zuvor vollständig durch `record_sale_return`
   * bestätigt und darf nicht ein zweites Mal ausgelöst werden.
   */
  materializeConfirmedReturn(input: {
    sale: Sale;
    reason: ReturnReason;
    refundAmount: number;
    isFullRefund: boolean;
    restockAction: RestockAction;
    notes?: string;
  }): ReturnRecord {
    const existing = this.returns().find((entry) => entry.sale_id === input.sale.id);
    if (existing) return existing;

    const workspace = this.workspaceService?.currentWorkspace() ?? null;
    const returnDate =
      input.sale.returned_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const returnRecord: ReturnRecord = {
      id: `atomic-return-${input.sale.id}`,
      workspace_id: input.sale.workspace_id,
      sale_id: input.sale.id,
      inventory_item_id: input.sale.inventory_item_id ?? null,
      credit_note_number: `GS-${returnDate.slice(0, 4)}-${(this.returns().length + 1).toString().padStart(4, '0')}`,
      return_date: returnDate,
      reason: input.reason,
      refund_amount: Number(input.refundAmount.toFixed(2)),
      is_full_refund: input.isFullRefund,
      restock_action: input.restockAction,
      buyer_name: input.sale.buyer_notes || 'Kunde',
      notes: input.notes,
      created_at: input.sale.returned_at ?? new Date().toISOString(),
      sale: input.sale,
      inventory_item: input.sale.inventory_item,
    };
    returnRecord.creditNoteInvoice = this.generateCreditNoteInvoice(
      returnRecord,
      input.sale,
      workspace,
    );
    this.uebernehmeRetoureLokal(returnRecord);
    return returnRecord;
  }

  /**
   * Processes a return / refund, updates inventory stock accordingly, and generates a credit note.
   */
  async processReturn(payload: {
    sale: Sale;
    item?: InventoryItem;
    reason: ReturnReason;
    refundAmount: number;
    isFullRefund: boolean;
    restockAction: RestockAction;
    buyerName?: string;
    notes?: string;
  }): Promise<ProcessReturnResult> {
    if (!this.salesService) {
      return {
        status: 'error',
        data: null,
        error: this.syncStatus.melde('Speichern der Retoure', new Error('Verkaufsservice fehlt.')),
        problems: [],
      };
    }

    const restock =
      payload.isFullRefund &&
      (payload.restockAction === 'restock_ready' || payload.restockAction === 'restock_repair');
    const booking = await this.salesService.recordReturn({
      saleId: payload.sale.id,
      refundAmount: payload.refundAmount,
      restock,
      restockAction: payload.restockAction,
      reason: payload.reason,
      notes: payload.notes ?? null,
      buyerName: payload.buyerName ?? null,
    });
    if (booking.error || !booking.data) {
      return { status: 'error', data: null, error: booking.error, problems: [] };
    }

    const confirmedSale: Sale = {
      ...payload.sale,
      ...booking.data.sale,
      inventory_item: booking.data.sale.inventory_item ?? payload.sale.inventory_item,
    };
    const gespeicherteRetoure = booking.data.returnRecord
      ? this.materializePersistedReturn(booking.data.returnRecord, confirmedSale)
      : this.materializeConfirmedReturn({
          sale: confirmedSale,
          reason: payload.reason,
          refundAmount: payload.refundAmount,
          isFullRefund: payload.isFullRefund,
          restockAction: payload.restockAction,
          notes: payload.notes,
        });

    // 5. Notifications
    if (this.webPushService) {
      this.webPushService.sendNotification(
        `↩️ Retoure erfasst: ${gespeicherteRetoure.credit_note_number}`,
        {
          body: `Erstattung von ${payload.refundAmount.toFixed(2)} € gebucht für ${payload.item?.title || 'Artikel'}.`,
          tag: `return-${gespeicherteRetoure.id}`,
        },
      );
    }

    if (this.webhookService) {
      this.webhookService.addNotification({
        title: `↩️ Retoure & Gutschrift ${gespeicherteRetoure.credit_note_number}`,
        message: `${payload.refundAmount.toFixed(2)} € Erstattung (${payload.reason}) für ${payload.item?.title || 'Artikel'}.`,
        type: 'alert',
      });
    }

    return { status: 'success', data: gespeicherteRetoure, error: null, problems: [] };
  }

  private meldeFehler(vorgang: string, ursache: unknown): Error {
    if (ursache instanceof Error && this.syncStatus?.istZentralGemeldet(ursache)) return ursache;
    return this.syncStatus?.melde(vorgang, ursache) ?? this.alsError(ursache);
  }

  private alsError(ursache: unknown): Error {
    return ursache instanceof Error ? ursache : new Error('Die Aktion ist fehlgeschlagen.');
  }

  private erstelleProblem(kind: ReturnFollowUpKind, error: Error): ReturnFollowUpProblem {
    return {
      kind,
      error,
      reportedBySyncStatus: this.syncStatus?.istZentralGemeldet(error) ?? false,
    };
  }

  private uebernehmeRetoureLokal(retoure: ReturnRecord): void {
    this.returns.update((list) => [
      retoure,
      ...list.filter((eintrag) => eintrag.id !== retoure.id),
    ]);
    this.persistReturns();
  }

  /** Ergänzt eine vom RPC erzeugte Retoure nur noch um die lokale Belegansicht. */
  private materializePersistedReturn(returnRecord: ReturnRecord, sale: Sale): ReturnRecord {
    const existing = this.returns().find((entry) => entry.id === returnRecord.id);
    if (existing) return existing;
    const materialized: ReturnRecord = {
      ...returnRecord,
      sale,
      inventory_item: sale.inventory_item,
    };
    materialized.creditNoteInvoice = this.generateCreditNoteInvoice(
      materialized,
      sale,
      this.workspaceService?.currentWorkspace() ?? null,
    );
    this.uebernehmeRetoureLokal(materialized);
    return materialized;
  }

  /**
   * Generates a formal § 25a UStG Credit Note (Gutschrift) matching the DIN-A4 Invoice layout.
   */
  generateCreditNoteInvoice(
    returnRecord: ReturnRecord,
    sale: Sale,
    workspace: Workspace | null,
  ): Invoice {
    const wsName = workspace?.name || 'Flipbase Reselling HQ';
    const originalInvoiceNumber = sale.external_order_id
      ? `RE-${sale.external_order_id}`
      : `RE-${sale.id.substring(0, 8)}`;

    return {
      id: returnRecord.id,
      invoiceNumber: returnRecord.credit_note_number,
      orderNumber: sale.external_order_id || sale.id,
      invoiceDate: returnRecord.return_date,
      deliveryDate: returnRecord.return_date,
      seller: {
        name: wsName,
        company: 'Flipbase E-Commerce Einzelunternehmen',
        street: 'Gewerbestraße 10',
        postalCode: '10115',
        city: 'Berlin',
        country: 'Deutschland',
        email: 'kontakt@flipbase.de',
        phone: '+49 30 98765432',
        taxId: '34/234/56789',
        vatId: 'DE345678901',
        iban: 'DE44500105175407324931',
        bic: 'HELAADEF100',
        bankName: 'Berliner Sparkasse',
      },
      buyer: {
        name: returnRecord.buyer_name || 'Kunde',
        street: 'Lieferanschrift wie Bestellung',
        postalCode: '10115',
        city: 'Berlin',
        country: 'Deutschland',
      },
      items: [
        {
          sku: sale.inventory_item_id || 'ART-RET',
          title: `GUTSCHRIFT zu Rechnung ${originalInvoiceNumber}: ${sale.inventory_item?.title || 'Artikel'}`,
          condition: sale.inventory_item?.condition || 'Gebraucht',
          quantity: 1,
          unitPrice: -returnRecord.refund_amount,
          totalPrice: -returnRecord.refund_amount,
        },
      ],
      subtotal: -returnRecord.refund_amount,
      shippingCost: 0,
      total: -returnRecord.refund_amount,
      taxMode: 'diff_25a',
      taxClause:
        'Gutschriftsbeleg: Sonderregelung für Gebrauchtgegenstände nach § 25a UStG (Differenzbesteuerung). Ausweis der Umsatzsteuer ist nicht möglich. Rechnungsberichtigung.',
      paymentMethod: `Erstattung via ${sale.platform}`,
      paymentStatus: 'paid',
      notes: `Grund: ${this.getReasonLabel(returnRecord.reason)}. ${returnRecord.notes || ''}`,
    };
  }

  getReasonLabel(reason: ReturnReason): string {
    switch (reason) {
      case 'buyer_remorse':
        return 'Widerruf / Nichtgefallen (14 Tage)';
      case 'defective':
        return 'Artikel defekt / Transportschaden';
      case 'not_as_described':
        return 'Zustand weicht von Beschreibung ab';
      case 'wrong_item':
        return 'Falscher Artikel geliefert';
      case 'lost_in_transit':
        return 'Sendungsverlust';
      default:
        return 'Sonstiger Grund / Kulanz';
    }
  }
}

import { Injectable, effect, inject, signal } from '@angular/core';
import { RestockAction, ReturnReason, ReturnRecord } from '../models/return.models';
import { Invoice } from '../models/invoice.models';
import { InventoryItem, ItemStatus, Sale, Workspace } from '../models/reflip.models';
import { InventoryService } from './inventory.service';
import { WorkspaceService } from './workspace.service';
import { WebhookService } from './webhook.service';
import { WebPushService } from './web-push.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';

const STORAGE_KEY_RETURNS = 'reflip_saved_returns';

@Injectable({
  providedIn: 'root',
})
export class ReturnService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true })!;
  private readonly inventoryService = inject(InventoryService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly webhookService = inject(WebhookService, { optional: true });
  private readonly webPushService = inject(WebPushService, { optional: true });

  readonly returns = signal<ReturnRecord[]>(this.loadPersistedReturns());
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung in Phase 8 auf TestBed mit jsdom
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
    if (!this.supabase || workspaceId.startsWith('demo-')) return;

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
        const mapped: ReturnRecord[] = (data as unknown[]).map((r: any) => ({
          ...r,
          reason: r.reason as ReturnReason,
          restock_action: r.restock_action as RestockAction,
          refund_amount: Number(r.refund_amount || 0),
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
  }): Promise<ReturnRecord> {
    const ws = this.workspaceService?.currentWorkspace();
    const count = this.returns().length + 1;
    const creditNoteNumber = `GS-2026-${count.toString().padStart(4, '0')}`;

    const newReturn: ReturnRecord = {
      id: `ret-${Date.now()}`,
      workspace_id: ws?.id || 'ws-1',
      sale_id: payload.sale.id,
      inventory_item_id: payload.sale.inventory_item_id,
      credit_note_number: creditNoteNumber,
      return_date: new Date().toISOString().split('T')[0],
      reason: payload.reason,
      refund_amount: Number(payload.refundAmount.toFixed(2)),
      is_full_refund: payload.isFullRefund,
      restock_action: payload.restockAction,
      buyer_name: payload.buyerName || payload.sale.buyer_notes || 'Kunde',
      notes: payload.notes,
      created_at: new Date().toISOString(),
      sale: payload.sale,
      inventory_item: payload.item,
    };

    // 1. Generate credit note invoice
    const creditInvoice = this.generateCreditNoteInvoice(newReturn, payload.sale, ws || null);
    newReturn.creditNoteInvoice = creditInvoice;

    // 2. Synchronize Inventory Stock based on restockAction
    if (this.inventoryService && payload.sale.inventory_item_id) {
      let targetStatus: ItemStatus = 'ready';
      let statusLog = `Retoure erfasst (${creditNoteNumber})`;

      if (payload.restockAction === 'restock_ready') {
        targetStatus = 'ready';
        statusLog = `Wieder eingelagert als verkaufsbereit nach Retoure (${creditNoteNumber})`;
      } else if (payload.restockAction === 'restock_repair') {
        targetStatus = 'needs_review';
        statusLog = `In Reparatur / Aufbereitung übergeben nach Retoure (${creditNoteNumber})`;
      } else if (payload.restockAction === 'write_off') {
        targetStatus = 'defective';
        statusLog = `Als Defekt / Verlust abgeschrieben nach Retoure (${creditNoteNumber})`;
      }

      if (payload.restockAction !== 'keep_with_buyer') {
        await this.inventoryService.updateItemStatus(
          payload.sale.inventory_item_id,
          targetStatus,
          statusLog,
        );
      }
    }

    // 3. Save to state & local storage
    this.returns.update((prev) => [newReturn, ...prev]);
    this.persistReturns();

    // 4. Save to Supabase
    if (this.supabase && ws && !ws.id.startsWith('demo-')) {
      try {
        const { data: dbReturn, error } = await this.supabase.client
          .from('returns')
          .insert({
            workspace_id: ws.id,
            sale_id: payload.sale.id,
            inventory_item_id: payload.sale.inventory_item_id,
            credit_note_number: creditNoteNumber,
            return_date: newReturn.return_date,
            reason: payload.reason,
            refund_amount: newReturn.refund_amount,
            is_full_refund: payload.isFullRefund,
            restock_action: payload.restockAction,
            buyer_name: newReturn.buyer_name,
            notes: payload.notes || null,
          })
          .select()
          .single();

        if (error) {
          this.syncStatus.melde('Speichern der Retoure', error);
        } else if (dbReturn) {
          const finalReturn: ReturnRecord = { ...newReturn, id: dbReturn.id };
          this.returns.update((list) => [
            finalReturn,
            ...list.filter((r) => r.id !== newReturn.id),
          ]);
          this.persistReturns();
        }
      } catch (err) {
        this.syncStatus.melde('Speichern der Retoure', err);
      }
    }

    // 5. Notifications
    if (this.webPushService) {
      this.webPushService.sendNotification(`↩️ Retoure erfasst: ${creditNoteNumber}`, {
        body: `Erstattung von ${payload.refundAmount.toFixed(2)} € gebucht für ${payload.item?.title || 'Artikel'}.`,
        tag: `return-${newReturn.id}`,
      });
    }

    if (this.webhookService) {
      this.webhookService.addNotification({
        title: `↩️ Retoure & Gutschrift ${creditNoteNumber}`,
        message: `${payload.refundAmount.toFixed(2)} € Erstattung (${payload.reason}) für ${payload.item?.title || 'Artikel'}.`,
        type: 'alert',
      });
    }

    return newReturn;
  }

  /**
   * Generates a formal § 25a UStG Credit Note (Gutschrift) matching the DIN-A4 Invoice layout.
   */
  generateCreditNoteInvoice(
    returnRecord: ReturnRecord,
    sale: Sale,
    workspace: Workspace | null,
  ): Invoice {
    const wsName = workspace?.name || 'ReFlip Reselling HQ';
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
        company: 'ReFlip E-Commerce Einzelunternehmen',
        street: 'Gewerbestraße 10',
        postalCode: '10115',
        city: 'Berlin',
        country: 'Deutschland',
        email: 'kontakt@reflip.de',
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

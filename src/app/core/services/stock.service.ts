import { Injectable, inject, signal } from '@angular/core';
import { PurchaseLine, StockLot, StockMovement, StockPosition } from '../models/flipbase.models';
import { MutationResult } from '../models/mutation-result.model';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';
import { hasSellableLotCost } from '../utils/stock-availability';
import { createLocalDemoId } from '../utils/client-identity';

export interface ReceivePurchaseLineInput {
  readonly purchaseLineId: string;
  readonly receivedQuantity: number;
  readonly receivedAt?: string;
}

export interface ReceivePurchaseResult {
  readonly purchaseLines: readonly PurchaseLine[];
  readonly stockLots: readonly StockLot[];
}

@Injectable({ providedIn: 'root' })
export class StockService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly positions = signal<StockPosition[]>([]);
  /**
   * Lose bleiben bewusst Provenienzdaten. Die Bestandsansicht zeigt sie nur
   * auf Nachfrage unter der einen aggregierten Artikelposition.
   */
  readonly lots = signal<StockLot[]>([]);
  readonly movements = signal<StockMovement[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal<Error | null>(null);
  readonly loadedWorkspaceId = signal<string | null>(null);
  private loadRequestId = 0;
  private readonly pendingReceipts = new Map<
    string,
    { requestId: string; lines: readonly ReceivePurchaseLineInput[] }
  >();

  async loadPositions(workspaceId: string): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      if (this.mockStore.isDemoMode()) {
        const purchases = this.mockStore.getPurchases();
        const lots = this.mockStore.getStockLots(workspaceId).map((lot) => ({
          ...lot,
          purchase: purchases.find(
            (purchase) => purchase.id === lot.purchase_id && purchase.workspace_id === workspaceId,
          ),
        }));
        if (!this.isCurrentLoad(requestId, workspaceId)) return;
        this.lots.set(lots);
        this.movements.set(this.mockStore.getStockMovements(workspaceId));
        this.positions.set(
          this.aggregateLots(lots, this.mockStore.getCatalogProducts(workspaceId)),
        );
        this.loadedWorkspaceId.set(workspaceId);
        return;
      }

      const [lotResult, movementResult] = await Promise.all([
        this.supabase.client
          .from('stock_lots')
          .select(
            '*, purchase:purchases!stock_lots_purchase_id_fkey(*), catalog_product:catalog_products!stock_lots_catalog_product_id_fkey(id, title, is_public_store)',
          )
          .eq('workspace_id', workspaceId)
          .order('received_at', { ascending: true })
          .order('id', { ascending: true }),
        this.supabase.client
          .from('stock_movements')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false }),
      ]);
      if (!this.isCurrentLoad(requestId, workspaceId)) return;
      const error = lotResult.error ?? movementResult.error;
      if (error) {
        this.loadError.set(this.syncStatus.melde('Laden der Bestandspositionen', error));
        return;
      }
      const lots = (lotResult.data ?? []) as StockLot[];
      this.lots.set(lots);
      this.movements.set((movementResult.data ?? []) as StockMovement[]);
      this.positions.set(this.aggregateLots(lots));
      this.loadedWorkspaceId.set(workspaceId);
    } catch (error: unknown) {
      if (!this.isCurrentLoad(requestId, workspaceId)) return;
      this.loadError.set(this.syncStatus.melde('Laden der Bestandspositionen', error));
    } finally {
      if (requestId === this.loadRequestId) this.isLoading.set(false);
    }
  }

  async receivePurchaseLines(
    purchaseId: string,
    lines: readonly ReceivePurchaseLineInput[],
    requestId?: string,
  ): Promise<MutationResult<ReceivePurchaseResult>> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId)
      return this.failure('Wareneingang buchen', new Error('Kein aktiver Workspace'));
    const key = JSON.stringify([workspaceId, purchaseId, requestId ?? null, lines]);
    const pending = this.pendingReceipts.get(key) ?? {
      requestId: requestId ?? createLocalDemoId('receipt'),
      lines: lines.map((line) => ({
        ...line,
        receivedAt: line.receivedAt ?? new Date().toISOString(),
      })),
    };
    this.pendingReceipts.set(key, pending);

    if (this.mockStore.isDemoMode()) {
      const result = this.mockStore.receivePurchaseLines(
        workspaceId,
        purchaseId,
        pending.lines,
        pending.requestId,
      );
      if (result.error) return this.failure('Wareneingang buchen', result.error);
      this.pendingReceipts.delete(key);
      await this.loadPositions(workspaceId);
      return {
        data: { purchaseLines: result.purchaseLines, stockLots: result.stockLots },
        error: null,
        reportedBySyncStatus: false,
      };
    }

    try {
      const { data, error } = await this.supabase.client.rpc('receive_purchase_lines_idempotent', {
        p_workspace_id: workspaceId,
        p_purchase_id: purchaseId,
        p_request_id: pending.requestId,
        p_lines: pending.lines.map((line) => ({
          purchase_line_id: line.purchaseLineId,
          received_quantity: line.receivedQuantity,
          received_at: line.receivedAt ?? new Date().toISOString(),
        })),
      });
      if (error || !data || typeof data !== 'object') {
        return this.failure(
          'Wareneingang buchen',
          error ?? new Error('Der Wareneingang wurde nicht zurückgegeben.'),
        );
      }
      const result = this.mapReceiveResult(data as Record<string, unknown>);
      this.pendingReceipts.delete(key);
      await this.loadPositions(workspaceId);
      return { data: result, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.failure('Wareneingang buchen', error);
    }
  }

  private mapReceiveResult(value: Record<string, unknown>): ReceivePurchaseResult {
    return {
      purchaseLines: this.asArray<PurchaseLine>(value['purchase_lines']),
      stockLots: this.asArray<StockLot>(value['stock_lots']),
    };
  }

  private aggregateLots(
    lots: readonly unknown[],
    products: readonly { id: string; title: string; is_public_store: boolean }[] = [],
  ): StockPosition[] {
    const positions = new Map<string, StockPosition>();
    for (const rawLot of lots) {
      const lot = rawLot as StockLot & {
        catalog_product?: { id: string; title: string; is_public_store: boolean } | null;
      };
      if (lot.remaining_quantity <= 0) continue;
      const product =
        lot.catalog_product ?? products.find((entry) => entry.id === lot.catalog_product_id);
      const existing = positions.get(lot.catalog_product_id);
      const sellable = hasSellableLotCost(lot);
      positions.set(lot.catalog_product_id, {
        catalog_product_id: lot.catalog_product_id,
        title: product?.title ?? existing?.title ?? 'Unbekannter Artikel',
        available_quantity:
          (existing?.available_quantity ?? 0) + (sellable ? lot.remaining_quantity : 0),
        reserved_quantity: existing?.reserved_quantity ?? 0,
        on_hand_quantity: (existing?.on_hand_quantity ?? 0) + lot.remaining_quantity,
        oldest_available_unit_cost:
          existing?.oldest_available_unit_cost ?? (sellable ? lot.unit_cost : null),
        is_public_store: product?.is_public_store ?? existing?.is_public_store ?? false,
      });
    }
    return [...positions.values()];
  }

  private asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private isCurrentLoad(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.loadRequestId &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }

  private failure<T>(operation: string, cause: unknown): MutationResult<T> {
    const error = this.syncStatus.melde(operation, cause);
    return { data: null, error, reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error) };
  }
}

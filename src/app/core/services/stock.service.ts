import { Injectable, inject, signal } from '@angular/core';
import { PurchaseLine, StockLot, StockMovement, StockPosition } from '../models/flipbase.models';
import { MutationResult } from './catalog.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

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
  readonly movements = signal<StockMovement[]>([]);

  async loadPositions(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) {
      this.positions.set(
        this.aggregateLots(
          this.mockStore.getStockLots(workspaceId),
          this.mockStore.getCatalogProducts(workspaceId),
        ),
      );
      return;
    }

    try {
      const { data, error } = await this.supabase.client
        .from('stock_lots')
        .select('*, catalog_product:catalog_products(id, title, is_public_store)')
        .eq('workspace_id', workspaceId)
        .gt('remaining_quantity', 0)
        .order('received_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) {
        this.syncStatus.melde('Laden der Bestandspositionen', error);
        return;
      }
      this.positions.set(this.aggregateLots(data ?? []));
    } catch (error: unknown) {
      this.syncStatus.melde('Laden der Bestandspositionen', error);
    }
  }

  async receivePurchaseLines(
    purchaseId: string,
    lines: readonly ReceivePurchaseLineInput[],
  ): Promise<MutationResult<ReceivePurchaseResult>> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId)
      return this.failure('Wareneingang buchen', new Error('Kein aktiver Workspace'));

    if (this.mockStore.isDemoMode()) {
      const result = this.mockStore.receivePurchaseLines(workspaceId, purchaseId, lines);
      if (result.error) return this.failure('Wareneingang buchen', result.error);
      await this.loadPositions(workspaceId);
      return {
        data: { purchaseLines: result.purchaseLines, stockLots: result.stockLots },
        error: null,
        reportedBySyncStatus: false,
      };
    }

    try {
      const { data, error } = await this.supabase.client.rpc('receive_purchase_lines', {
        p_workspace_id: workspaceId,
        p_purchase_id: purchaseId,
        p_lines: lines.map((line) => ({
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
      positions.set(lot.catalog_product_id, {
        catalog_product_id: lot.catalog_product_id,
        title: product?.title ?? existing?.title ?? 'Unbekannter Artikel',
        available_quantity: (existing?.available_quantity ?? 0) + lot.remaining_quantity,
        reserved_quantity: existing?.reserved_quantity ?? 0,
        on_hand_quantity: (existing?.on_hand_quantity ?? 0) + lot.remaining_quantity,
        oldest_available_unit_cost: existing?.oldest_available_unit_cost ?? lot.unit_cost,
        is_public_store: product?.is_public_store ?? existing?.is_public_store ?? false,
      });
    }
    return [...positions.values()];
  }

  private asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private failure<T>(operation: string, cause: unknown): MutationResult<T> {
    const error = this.syncStatus.melde(operation, cause);
    return { data: null, error, reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error) };
  }
}

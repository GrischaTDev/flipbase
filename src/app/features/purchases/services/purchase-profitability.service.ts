import { effect, inject, Injectable, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { InventoryItem, Sale, SaleLine } from '../../../core/models/flipbase.models';

type PurchaseLinkedItem = InventoryItem & {
  readonly purchase_line?: { readonly purchase_id: string } | null;
};

function purchaseLinkedItem(item: PurchaseLinkedItem | undefined): InventoryItem | undefined {
  return item
    ? { ...item, purchase_id: item.purchase_id ?? item.purchase_line?.purchase_id ?? null }
    : undefined;
}

@Injectable({ providedIn: 'root' })
export class PurchaseProfitabilityService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private activeWorkspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
  private requestId = 0;
  readonly sales = signal<readonly Sale[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal<Error | null>(null);
  readonly loadedWorkspaceId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
      if (workspaceId === this.activeWorkspaceId) return;
      this.activeWorkspaceId = workspaceId;
      this.requestId++;
      this.sales.set([]);
      this.isLoading.set(false);
      this.loadError.set(null);
      this.loadedWorkspaceId.set(null);
    });
  }

  async loadSales(workspaceId: string): Promise<void> {
    if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
    this.activeWorkspaceId = workspaceId;
    const requestId = ++this.requestId;
    this.isLoading.set(true);
    this.loadError.set(null);
    this.loadedWorkspaceId.set(null);
    this.sales.set([]);
    const sales: Sale[] = [];
    const seen = new Set<string>();
    let expectedCount: number | null = null;
    try {
      // Alle Seiten laden: eine begrenzte erste Antwort ist keine vollständige Auswertung.
      while (true) {
        const { data, error, count } = await this.supabase.client
          .from('sales')
          .select(
            `
          *, inventory_item:inventory_items!sales_inventory_item_id_fkey(*, purchase_line:purchase_lines!inventory_items_purchase_line_id_fkey(purchase_id)),
          sale_lines:sale_lines!sale_lines_sale_id_fkey(
            *, inventory_item:inventory_items!sale_lines_inventory_item_id_fkey(*, purchase_line:purchase_lines!inventory_items_purchase_line_id_fkey(purchase_id)),
            lot_allocations:sale_line_lot_allocations!sale_line_lot_allocations_sale_line_id_fkey(
              *, stock_lot:stock_lots!sale_line_lot_allocations_stock_lot_id_fkey(*)
            )
          ), cost_entries:sale_cost_entries!sale_cost_entries_sale_id_fkey(*)
        `,
            { count: 'exact' },
          )
          .eq('workspace_id', workspaceId)
          .order('id')
          .range(sales.length, sales.length + 199);
        if (!this.isCurrent(requestId, workspaceId)) return;
        if (error) throw error;
        if (!data || count === null || (expectedCount !== null && count !== expectedCount))
          throw new Error(
            'Die Verkaufsdaten haben sich während des Ladens geändert. Bitte erneut versuchen.',
          );
        expectedCount = count;
        for (const raw of data as unknown as (Sale & { sale_lines?: SaleLine[] })[]) {
          if (seen.has(raw.id))
            throw new Error('Die Verkaufsdaten konnten nicht vollständig geladen werden.');
          seen.add(raw.id);
          sales.push({
            ...raw,
            inventory_item: purchaseLinkedItem(raw.inventory_item),
            lines: (raw.sale_lines ?? []).map((line) => ({
              ...line,
              inventory_item: purchaseLinkedItem(line.inventory_item),
            })),
            has_persisted_lines: !!raw.sale_lines?.length,
          });
        }
        if (sales.length === count) break;
        if (data.length === 0 || sales.length > count)
          throw new Error('Die Verkaufsdaten konnten nicht vollständig geladen werden.');
      }
      this.sales.set(sales);
      this.loadedWorkspaceId.set(workspaceId);
    } catch (error: unknown) {
      if (this.isCurrent(requestId, workspaceId))
        this.loadError.set(
          error instanceof Error
            ? error
            : new Error('Die Verkaufsdaten konnten nicht geladen werden.'),
        );
    } finally {
      if (this.isCurrent(requestId, workspaceId)) this.isLoading.set(false);
    }
  }

  private isCurrent(requestId: number, workspaceId: string): boolean {
    return (
      requestId === this.requestId && this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }
}

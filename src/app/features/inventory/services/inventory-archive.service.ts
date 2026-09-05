import { Injectable, inject, signal } from '@angular/core';
import { InventoryItem } from '../../../core/models/flipbase.models';
import { InventoryService } from '../../../core/services/inventory.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../core/services/auth.service';
import { MockDataStoreService } from '../../../core/services/mock-data-store.service';

export function isArchivedInventoryItem(item: InventoryItem): boolean {
  return item.status === 'archived' || (!!item.archived_at && item.sale_state === 'sold');
}
@Injectable({ providedIn: 'root' })
export class InventoryArchiveService {
  private readonly supabase = inject(SupabaseService);
  private readonly inventory = inject(InventoryService);
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly mockStore = inject(MockDataStoreService);
  readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  async setArchived(workspaceId: string, itemId: string, archived: boolean): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    const demo = this.auth.isDemoMode();
    if (this.workspace.currentWorkspace()?.id !== workspaceId)
      throw new Error('Der Workspace hat sich geändert.');
    if (this.pendingIds().has(itemId)) throw new Error('Die Archivaktion läuft bereits.');
    this.pendingIds.update((ids) => new Set([...ids, itemId]));
    try {
      let metadata: Pick<InventoryItem, 'archived_at' | 'archived_by'>;
      if (demo) {
        const item =
          this.inventory
            .items()
            .find((value) => value.id === itemId && value.workspace_id === workspaceId) ??
          this.inventory.selectedItem();
        if (!item || item.id !== itemId || item.workspace_id !== workspaceId)
          throw new Error('Artikel nicht gefunden.');
        if (
          archived &&
          (item.sale_state !== 'sold' || item.active_sale_count !== 1 || !item.active_sale_id)
        )
          throw new Error('Nur eindeutig verkaufte Einzelartikel können archiviert werden.');
        metadata = this.mockStore.setItemArchived(workspaceId, itemId, archived, userId ?? 'demo');
      } else {
        const { data, error } = await this.supabase.client.rpc('set_inventory_item_archived', {
          p_workspace_id: workspaceId,
          p_item_id: itemId,
          p_archived: archived,
        });
        if (error) throw new Error(error.message);
        if (!data || data.id !== itemId || data.workspace_id !== workspaceId)
          throw new Error('Ungültige Antwort der Archivaktion.');
        metadata = { archived_at: data.archived_at, archived_by: data.archived_by };
      }
      if (
        this.workspace.currentWorkspace()?.id !== workspaceId ||
        this.auth.currentUser()?.id !== userId ||
        this.auth.isDemoMode() !== demo
      )
        throw new Error('Der Anmeldekontext hat sich geändert.');
      this.inventory.applyArchiveMetadata(workspaceId, itemId, metadata);
    } finally {
      this.pendingIds.update((ids) => {
        const next = new Set(ids);
        next.delete(itemId);
        return next;
      });
    }
  }
}

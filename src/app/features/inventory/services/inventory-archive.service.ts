import { Injectable, inject, signal } from '@angular/core';
import { InventoryItem } from '../../../core/models/flipbase.models';
import { InventoryService } from '../../../core/services/inventory.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../core/services/auth.service';

export function isArchivedInventoryItem(item: InventoryItem): boolean {
  return item.status === 'archived' || !!item.archived_at;
}
@Injectable({ providedIn: 'root' })
export class InventoryArchiveService {
  private readonly supabase = inject(SupabaseService);
  private readonly inventory = inject(InventoryService);
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  async setArchived(workspaceId: string, itemId: string, archived: boolean): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    if (this.workspace.currentWorkspace()?.id !== workspaceId)
      throw new Error('Der Workspace hat sich geändert.');
    if (this.pendingIds().has(itemId)) throw new Error('Die Archivaktion läuft bereits.');
    this.pendingIds.update((ids) => new Set([...ids, itemId]));
    try {
      const { data, error } = await this.supabase.client.rpc('set_inventory_item_archived', {
        p_workspace_id: workspaceId,
        p_item_id: itemId,
        p_archived: archived,
      });
      if (error) throw new Error(error.message);
      if (!data || data.id !== itemId || data.workspace_id !== workspaceId)
        throw new Error('Ungültige Antwort der Archivaktion.');
      const metadata: Pick<InventoryItem, 'archived_at' | 'archived_by'> = {
        archived_at: data.archived_at,
        archived_by: data.archived_by,
      };
      if (
        this.workspace.currentWorkspace()?.id !== workspaceId ||
        this.auth.currentUser()?.id !== userId
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

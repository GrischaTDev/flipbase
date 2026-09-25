import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { ArticleKind } from '../models/article-row';

@Injectable({ providedIn: 'root' })
export class ArticleLifecycleService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  readonly pendingIds = signal<ReadonlySet<string>>(new Set());

  async setArchived(
    workspaceId: string,
    kind: ArticleKind,
    id: string,
    archived: boolean,
  ): Promise<void> {
    const userId = this.checkContext(workspaceId);
    const key = `${kind}:${id}`;
    this.begin(key);
    try {
      const result =
        kind === 'catalog'
          ? await this.supabase.client.rpc('set_catalog_product_archived', {
              p_workspace_id: workspaceId,
              p_product_id: id,
              p_archived: archived,
            })
          : await this.supabase.client.rpc('set_inventory_item_archived', {
              p_workspace_id: workspaceId,
              p_item_id: id,
              p_archived: archived,
            });
      if (result.error) throw new Error(result.error.message);
      if (!result.data || result.data.id !== id || result.data.workspace_id !== workspaceId)
        throw new Error('Ungültige Antwort der Archivaktion.');
      this.checkResponseContext(workspaceId, userId);
    } finally {
      this.end(key);
    }
  }

  async deleteUnused(workspaceId: string, kind: ArticleKind, id: string): Promise<void> {
    const userId = this.checkContext(workspaceId);
    const key = `${kind}:${id}`;
    this.begin(key);
    try {
      const { data, error } = await this.supabase.client.rpc('delete_unused_article', {
        p_workspace_id: workspaceId,
        p_article_kind: kind,
        p_article_id: id,
      });
      if (error) throw new Error(error.message);
      if (
        typeof data !== 'object' ||
        data === null ||
        Array.isArray(data) ||
        data['deleted'] !== true
      )
        throw new Error('Ungültige Antwort der Löschaktion.');
      this.checkResponseContext(workspaceId, userId);
    } finally {
      this.end(key);
    }
  }

  private checkContext(workspaceId: string): string {
    const userId = this.auth.currentUser()?.id;
    if (!userId || this.workspace.currentWorkspace()?.id !== workspaceId)
      throw new Error('Der Workspace oder die Anmeldung hat sich geändert.');
    return userId;
  }

  private checkResponseContext(workspaceId: string, userId: string): void {
    if (
      this.workspace.currentWorkspace()?.id !== workspaceId ||
      this.auth.currentUser()?.id !== userId
    )
      throw new Error('Der Workspace oder die Anmeldung hat sich geändert. Bitte neu laden.');
  }

  private begin(key: string): void {
    if (this.pendingIds().has(key)) throw new Error('Die Artikelaktion läuft bereits.');
    this.pendingIds.update((ids) => new Set([...ids, key]));
  }

  private end(key: string): void {
    this.pendingIds.update((ids) => {
      const next = new Set(ids);
      next.delete(key);
      return next;
    });
  }
}

import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

export interface ArticleCleanupStatus {
  readonly completed: number;
  readonly pending: number;
  readonly failed: number;
}

function isStatus(value: unknown): value is ArticleCleanupStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return ['completed', 'pending', 'failed'].every(
    (key) => typeof data[key] === 'number' && Number.isSafeInteger(data[key]) && data[key] >= 0,
  );
}

@Injectable({ providedIn: 'root' })
export class ArticleMediaCleanupService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspace = inject(WorkspaceService);
  readonly status = signal<ArticleCleanupStatus | null>(null);
  readonly error = signal<string | null>(null);

  async retry(workspaceId: string, force = false): Promise<ArticleCleanupStatus> {
    if (this.workspace.currentWorkspace()?.id !== workspaceId)
      throw new Error('Der Workspace hat sich geändert.');
    this.error.set(null);
    const { data, error } = await this.supabase.client.functions.invoke<ArticleCleanupStatus>(
      'article-media-cleanup',
      { body: { workspaceId, force } },
    );
    if (this.workspace.currentWorkspace()?.id !== workspaceId)
      throw new Error('Der Workspace hat sich geändert.');
    if (error) {
      this.error.set(error.message);
      throw new Error(error.message);
    }
    if (!isStatus(data)) throw new Error('Ungültige Antwort der Bildbereinigung.');
    this.status.set(data);
    return data;
  }
}

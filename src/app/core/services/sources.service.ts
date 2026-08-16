import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { Source } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class SourcesService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly sources = signal<Source[]>(this.mockStore.demoSources);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const currentWs = this.workspaceService.currentWorkspace();
      if (currentWs) {
        this.loadSources(currentWs.id);
      } else {
        this.sources.set([]);
      }
    });
  }

  async loadSources(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode() || workspaceId.startsWith('demo-')) {
      this.sources.set(this.mockStore.demoSources);
      return;
    }

    this.isLoading.set(true);
    try {
      const queryPromise = this.supabase.client
        .from('sources')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      const res: any = await this.mockStore.withTimeout(queryPromise, { data: null, error: new Error('Timeout') }, 800);

      if (res && !res.error && res.data && res.data.length > 0) {
        this.sources.set(res.data as Source[]);
      } else {
        this.sources.set(this.mockStore.demoSources);
      }
    } catch (err) {
      this.sources.set(this.mockStore.demoSources);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createSource(name: string, isDefault = false): Promise<{ data: Source | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace ausgewählt') };

    const newSrc: Source = {
      id: `src-${Date.now()}`,
      workspace_id: ws.id,
      name: name.trim(),
      is_default: isDefault,
      is_active: true,
      type: 'online_marketplace',
    };

    this.sources.update((list) => [...list, newSrc]);

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('sources').insert({
          workspace_id: ws.id,
          name: name.trim(),
          is_default: isDefault,
        });
      } catch (e) {
        // ignore
      }
    }

    return { data: newSrc, error: null };
  }

  async deleteSource(sourceId: string): Promise<{ error: Error | null }> {
    this.sources.update((list) => list.filter((s) => s.id !== sourceId));
    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('sources').delete().eq('id', sourceId);
      } catch (e) {
        // ignore
      }
    }
    return { error: null };
  }
}

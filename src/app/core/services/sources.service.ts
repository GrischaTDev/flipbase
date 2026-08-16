import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { Source } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class SourcesService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly sources = signal<Source[]>([]);
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
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('sources')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (!error && data) {
        this.sources.set(data as Source[]);
      }
    } catch (err) {
      console.error('Error loading sources:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createSource(name: string, isDefault = false): Promise<{ data: Source | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace ausgewählt') };

    try {
      const { data, error } = await this.supabase.client
        .from('sources')
        .insert({
          workspace_id: ws.id,
          name: name.trim(),
          is_default: isDefault,
        })
        .select()
        .single();

      if (error) return { data: null, error };

      const newSource = data as Source;
      this.sources.update((list) => [...list, newSource]);
      return { data: newSource, error: null };
    } catch (err: unknown) {
      return { data: null, error: err as Error };
    }
  }

  async deleteSource(sourceId: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('sources')
        .delete()
        .eq('id', sourceId);

      if (error) return { error };

      this.sources.update((list) => list.filter((s) => s.id !== sourceId));
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }
}

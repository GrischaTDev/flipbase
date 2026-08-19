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

  readonly sources = signal<Source[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    try {
      effect(() => {
        const currentWs = this.workspaceService.currentWorkspace();
        if (currentWs) {
          this.loadSources(currentWs.id);
        } else {
          this.sources.set([]);
        }
      });
    } catch {}
  }

  async loadSources(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) {
      const local = this.mockStore.getSources(workspaceId);
      this.sources.set(local);
      return;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('sources')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (error) {
        console.error('Fehler beim Laden der Quellen aus Supabase:', error);
        this.sources.set([]);
      } else if (data) {
        this.sources.set(data as Source[]);
      }
    } catch (err) {
      console.error('Verbindungsfehler beim Laden der Quellen:', err);
      this.sources.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createSource(name: string, isDefault = false, type = 'online_marketplace'): Promise<{ data: Source | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace ausgewählt') };

    const newSrc: Source = {
      id: `src-${Date.now()}`,
      workspace_id: ws.id,
      name: name.trim(),
      is_default: isDefault,
      is_active: true,
      type,
    };

    this.mockStore.saveSource(newSrc);
    this.sources.update((list) => [...list, newSrc]);

    if (!this.mockStore.isDemoMode() && !ws.id.startsWith('demo-')) {
      try {
        const { data: dbSrc, error: dbError } = await this.supabase.client.from('sources').insert({
          workspace_id: ws.id,
          name: name.trim(),
          is_default: isDefault,
          is_active: true,
          type,
        }).select().single();

        if (dbError) {
          console.error('Fehler beim Speichern der Quelle in Supabase:', dbError);
        } else if (dbSrc) {
          const finalSrc: Source = { ...newSrc, id: dbSrc.id };
          this.mockStore.saveSource(finalSrc);
          this.sources.update((list) => [finalSrc, ...list.filter((s) => s.id !== newSrc.id)]);
          return { data: finalSrc, error: null };
        }
      } catch (e) {
        console.error('Verbindungsfehler beim Anlegen der Quelle:', e);
      }
    }

    return { data: newSrc, error: null };
  }

  async deleteSource(sourceId: string): Promise<{ error: Error | null }> {
    this.mockStore.deleteSource(sourceId);
    this.sources.update((list) => list.filter((s) => s.id !== sourceId));
    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client.from('sources').delete().eq('id', sourceId);
        if (error) {
          console.error('Fehler beim Löschen der Quelle in Supabase:', error);
          return { error: new Error(error.message) };
        }
      } catch (e: any) {
        console.error('Verbindungsfehler beim Löschen der Quelle:', e);
      }
    }
    return { error: null };
  }
}

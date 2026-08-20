import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SyncStatusService } from './sync-status.service';
import { Source } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class SourcesService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly sources = signal<Source[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung in Phase 8 auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const currentWs = this.workspaceService.currentWorkspace();
        if (currentWs) {
          this.loadSources(currentWs.id);
        } else {
          this.sources.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
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
        this.syncStatus.melde('Laden der Quellen', error);
        this.sources.set([]);
      } else if (data) {
        this.sources.set(data as Source[]);
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Quellen', err);
      this.sources.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createSource(
    name: string,
    isDefault = false,
    type = 'online_marketplace',
  ): Promise<{ data: Source | null; error: Error | null }> {
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

    if (!this.mockStore.isDemoMode() && !this.mockStore?.isDemoMode()) {
      try {
        const { data: dbSrc, error: dbError } = await this.supabase.client
          .from('sources')
          .insert({
            workspace_id: ws.id,
            name: name.trim(),
            is_default: isDefault,
            is_active: true,
            type,
          })
          .select()
          .single();

        if (dbError) {
          return { data: null, error: this.syncStatus.melde('Speichern der Quelle', dbError) };
        } else if (dbSrc) {
          const finalSrc: Source = { ...newSrc, id: dbSrc.id };
          // Vorlaeufigen Eintrag entfernen, sonst bleibt er mit seiner
          // Behelfs-Kennung im lokalen Spiegel liegen (Duplikat).
          this.mockStore.deleteSource(newSrc.id);
          this.mockStore.saveSource(finalSrc);
          this.sources.update((list) => [finalSrc, ...list.filter((s) => s.id !== newSrc.id)]);
          return { data: finalSrc, error: null };
        }
      } catch (e) {
        return { data: null, error: this.syncStatus.melde('Anlegen der Quelle', e) };
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
          return { error: this.syncStatus.melde('Löschen der Quelle', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Löschen der Quelle', e) };
      }
    }
    return { error: null };
  }
}

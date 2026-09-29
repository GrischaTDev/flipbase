import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { SyncStatusService } from './sync-status.service';
import { Source } from '../models/flipbase.models';
import { nurAktive } from './master-data-filter';

@Injectable({
  providedIn: 'root',
})
export class SourcesService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly sources = signal<Source[]>([]);
  readonly isLoading = signal<boolean>(false);
  private sourceVersion = 0;

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const currentWs = this.workspaceService.currentWorkspace();
        if (currentWs) {
          this.loadSources(currentWs.id);
        } else {
          this.sourceVersion++;
          this.sources.set([]);
          this.isLoading.set(false);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  /**
   * Ob auch archivierte Quellen geladen werden.
   *
   * Der Filter sitzt bewusst nur hier und nicht in den Komponenten: Wird er
   * an einer Stelle vergessen, tauchen archivierte Eintraege in Auswahllisten
   * wieder auf - der haeufigste Fehler bei dieser Bauweise.
   */
  readonly zeigeArchivierte = signal<boolean>(false);

  /** Nur waehlbare Quellen - fuer Auswahllisten in Formularen. */
  readonly aktiveSources = computed<Source[]>(() => nurAktive(this.sources()));

  async loadSources(workspaceId: string): Promise<void> {
    const version = ++this.sourceVersion;
    this.isLoading.set(true);
    const stillCurrent = () =>
      version === this.sourceVersion &&
      this.workspaceService.currentWorkspace()?.id === workspaceId;
    try {
      let query = this.supabase.client.from('sources').select('*').eq('workspace_id', workspaceId);
      if (!this.zeigeArchivierte()) query = query.eq('is_active', true);
      const { data, error } = await query
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });
      if (!stillCurrent()) return;
      if (error) throw error;
      this.sources.set((data ?? []) as Source[]);
    } catch (error: unknown) {
      if (stillCurrent()) {
        this.syncStatus.melde('Laden der Quellen', error);
        this.sources.set([]);
      }
    } finally {
      if (version === this.sourceVersion) this.isLoading.set(false);
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
      }
      if (!dbSrc) return { data: null, error: new Error('Quelle wurde nicht zurückgegeben') };

      const finalSrc: Source = { ...newSrc, id: dbSrc.id };
      if (this.workspaceService.currentWorkspace()?.id === ws.id) {
        this.sourceVersion++;
        this.isLoading.set(false);
        this.sources.update((list) => [
          finalSrc,
          ...list.filter((s) => s.id !== finalSrc.id && s.workspace_id === ws.id),
        ]);
      }
      return { data: finalSrc, error: null };
    } catch (e) {
      return { data: null, error: this.syncStatus.melde('Anlegen der Quelle', e) };
    }
  }

  /**
   * Ändert Name, Art oder Standard-Kennzeichen einer Quelle.
   *
   * Unkritisch: Einkäufe verweisen über die unveränderliche Kennung, nicht
   * über den Namen. Eine Umbenennung erscheint deshalb überall sofort, ohne
   * dass eine Verknüpfung verlorengeht.
   */
  async updateSource(
    sourceId: string,
    aenderungen: Partial<Pick<Source, 'name' | 'type' | 'is_default'>>,
  ): Promise<{ error: Error | null }> {
    const changes = {
      ...aenderungen,
      ...(aenderungen.name !== undefined ? { name: aenderungen.name.trim() } : {}),
    };
    if (changes.name !== undefined && !changes.name) {
      return { error: new Error('Der Name darf nicht leer sein') };
    }
    return this.persistSourceUpdate(sourceId, changes, 'Ändern der Quelle');
  }

  async setSourceArchiviert(
    sourceId: string,
    archiviert: boolean,
  ): Promise<{ error: Error | null }> {
    return this.persistSourceUpdate(sourceId, { is_active: !archiviert }, 'Archivieren der Quelle');
  }

  /**
   * Separate Lesesicht der Verwaltung. Archivierte Einträge werden NICHT in
   * den globalen Auswahlcache geladen; Einkaufsformulare behalten aktive Quellen.
   */
  async getManagementSources(): Promise<{ data: readonly Source[]; error: Error | null }> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) return { data: [], error: new Error('Kein aktiver Workspace ausgewählt') };
    const pageSize = 1000;
    const rows: Source[] = [];
    try {
      for (let offset = 0; ;) {
        const { data, error } = await this.supabase.client
          .from('sources')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('name')
          .order('id')
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        if (this.workspaceService.currentWorkspace()?.id !== workspaceId) {
          throw new Error('Der Workspace wurde während des Ladens gewechselt.');
        }
        const page = (data ?? []) as Source[];
        if (page.length === 0) return { data: rows, error: null };
        if (page.some((source) => source.workspace_id !== workspaceId)) {
          throw new Error('Die Quellen gehören nicht zum ausgewählten Workspace.');
        }
        rows.push(...page);
        // Nicht bei einer kurzen Seite abbrechen: Serverlimits können niedriger sein.
        offset += page.length;
      }
    } catch (error: unknown) {
      return { data: [], error: this.syncStatus.melde('Laden der Stammdatenquellen', error) };
    }
  }

  private async persistSourceUpdate(
    sourceId: string,
    changes: Partial<Pick<Source, 'name' | 'type' | 'is_default' | 'is_active'>>,
    action: string,
  ): Promise<{ error: Error | null }> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) return { error: new Error('Kein aktiver Workspace ausgewählt') };
    try {
      const { data, error } = await this.supabase.client
        .from('sources')
        .update(changes)
        .eq('workspace_id', workspaceId)
        .eq('id', sourceId)
        .select('*')
        .single();
      if (error) throw error;
      if (!data || data.id !== sourceId || data.workspace_id !== workspaceId) {
        throw new Error('Die Quellenänderung wurde nicht bestätigt.');
      }
      const saved = data as Source;
      if (this.workspaceService.currentWorkspace()?.id === workspaceId) {
        this.sourceVersion++;
        this.isLoading.set(false);
        this.sources.update((list) => {
          const remaining = list.filter(
            (source) => source.id !== sourceId && source.workspace_id === workspaceId,
          );
          return this.zeigeArchivierte() || saved.is_active !== false
            ? [...remaining, saved]
            : remaining;
        });
      }
      return { error: null };
    } catch (error: unknown) {
      return { error: this.syncStatus.melde(action, error) };
    }
  }

  /** Zählt die Einkäufe, die auf diese Quelle verweisen. */
  async zaehleVerknuepfteEinkaeufe(
    sourceId: string,
  ): Promise<{ count: number | null; error: Error | null }> {
    try {
      const { count, error } = await this.supabase.client
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', sourceId);
      if (error) {
        return {
          count: null,
          error: this.syncStatus.melde('Prüfen der verknüpften Einkäufe', error),
        };
      }
      return { count: count ?? 0, error: null };
    } catch (e) {
      return {
        count: null,
        error: this.syncStatus.melde('Prüfen der verknüpften Einkäufe', e),
      };
    }
  }

  /**
   * Löscht eine Quelle endgültig - aber nur, wenn kein Einkauf darauf verweist.
   *
   * Ohne diese Sperre setzt die Datenbank `purchases.source_id` beim Löschen
   * stillschweigend auf leer (ON DELETE SET NULL). Der Einkauf bliebe zwar
   * bestehen, verlöre aber die Angabe seiner Herkunft - rückgängig nur über
   * die Sicherung.
   */
  async deleteSource(sourceId: string): Promise<{ error: Error | null }> {
    const pruefung = await this.zaehleVerknuepfteEinkaeufe(sourceId);
    if (pruefung.error) return { error: pruefung.error };
    const verknuepft = pruefung.count ?? 0;

    if (verknuepft > 0) {
      return {
        error: new Error(
          `An dieser Quelle ${verknuepft === 1 ? 'hängt 1 Einkauf' : `hängen ${verknuepft} Einkäufe`}. ` +
            'Endgültiges Löschen würde die Herkunftsangabe dort entfernen. Archiviere die Quelle stattdessen.',
        ),
      };
    }

    try {
      const { error } = await this.supabase.client.from('sources').delete().eq('id', sourceId);
      if (error) {
        return { error: this.syncStatus.melde('Löschen der Quelle', error) };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Löschen der Quelle', e) };
    }
    this.sources.update((list) => list.filter((s) => s.id !== sourceId));
    return { error: null };
  }

  /**
   * Laedt Quellen des aktiven Workspace neu.
   *
   * Noetig nach dem Umschalten von `zeigeArchivierte`, weil der Filter in der
   * Datenbankabfrage sitzt und nicht in der Anzeige.
   */
  async neuLaden(): Promise<void> {
    const ws = this.workspaceService.currentWorkspace();
    if (ws) await this.loadSources(ws.id);
  }
}

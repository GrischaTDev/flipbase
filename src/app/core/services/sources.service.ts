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
          this.sources.set([]);
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
    this.isLoading.set(true);
    try {
      let abfrage = this.supabase.client
        .from('sources')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (!this.zeigeArchivierte()) {
        abfrage = abfrage.eq('is_active', true);
      }

      const { data, error } = await abfrage
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
      this.sources.update((list) => [finalSrc, ...list.filter((s) => s.id !== finalSrc.id)]);
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
    const bereinigt = {
      ...aenderungen,
      ...(aenderungen.name !== undefined ? { name: aenderungen.name.trim() } : {}),
    };

    if (bereinigt.name !== undefined && bereinigt.name.length === 0) {
      return { error: new Error('Der Name darf nicht leer sein') };
    }

    const lokalAnwenden = () => {
      this.sources.update((list) =>
        list.map((s) => (s.id === sourceId ? { ...s, ...bereinigt } : s)),
      );
    };

    try {
      const { error } = await this.supabase.client
        .from('sources')
        .update(bereinigt)
        .eq('id', sourceId);
      if (error) {
        return { error: this.syncStatus.melde('Ändern der Quelle', error) };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Ändern der Quelle', e) };
    }
    lokalAnwenden();
    return { error: null };
  }

  /**
   * Archiviert eine Quelle oder holt sie zurück.
   *
   * Archivieren statt Löschen, weil Einkäufe darauf verweisen und diese
   * Verweise nachvollziehbar bleiben müssen. Der Eintrag verschwindet nur aus
   * den Auswahllisten und bleibt in vorhandenen Einkäufen sichtbar.
   */
  async setSourceArchiviert(
    sourceId: string,
    archiviert: boolean,
  ): Promise<{ error: Error | null }> {
    const neuerWert = !archiviert;

    const lokalAnwenden = () => {
      this.sources.update((list) =>
        this.zeigeArchivierte()
          ? list.map((s) => (s.id === sourceId ? { ...s, is_active: neuerWert } : s))
          : list.filter((s) => s.id !== sourceId),
      );
    };

    try {
      const { error } = await this.supabase.client
        .from('sources')
        .update({ is_active: neuerWert })
        .eq('id', sourceId);
      if (error) {
        return { error: this.syncStatus.melde('Archivieren der Quelle', error) };
      }
    } catch (e: unknown) {
      return { error: this.syncStatus.melde('Archivieren der Quelle', e) };
    }
    lokalAnwenden();
    return { error: null };
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

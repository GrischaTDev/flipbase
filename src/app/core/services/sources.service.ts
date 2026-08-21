import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SyncStatusService } from './sync-status.service';
import { Source } from '../models/flipbase.models';
import { nurAktive } from './stammdaten-filter';

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
    if (this.mockStore.isDemoMode()) {
      const local = this.mockStore.getSources(workspaceId);
      this.sources.set(this.zeigeArchivierte() ? local : nurAktive(local));
      return;
    }

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

    this.mockStore.saveSource(newSrc);
    this.sources.update((list) => [...list, newSrc]);

    if (!this.mockStore.isDemoMode()) {
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

    this.sources.update((list) =>
      list.map((s) => (s.id === sourceId ? { ...s, ...bereinigt } : s)),
    );
    const vorhanden = this.sources().find((s) => s.id === sourceId);
    if (vorhanden) this.mockStore.saveSource(vorhanden);

    if (!this.mockStore.isDemoMode()) {
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
    }
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

    // Erst den geaenderten Eintrag im lokalen Spiegel sichern, dann die
    // Anzeige anpassen. Andersherum waere er aus dem Signal verschwunden,
    // bevor er gespeichert werden konnte - im Demo-Modus haette das
    // Archivieren dann nach dem naechsten Laden nicht mehr gegolten.
    const geaendert = this.sources().find((s) => s.id === sourceId);
    if (geaendert) this.mockStore.saveSource({ ...geaendert, is_active: neuerWert });

    this.sources.update((list) =>
      this.zeigeArchivierte()
        ? list.map((s) => (s.id === sourceId ? { ...s, is_active: neuerWert } : s))
        : list.filter((s) => s.id !== sourceId),
    );

    if (!this.mockStore.isDemoMode()) {
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
    }
    return { error: null };
  }

  /** Zählt die Einkäufe, die auf diese Quelle verweisen. */
  async zaehleVerknuepfteEinkaeufe(sourceId: string): Promise<number> {
    if (this.mockStore.isDemoMode()) {
      return this.mockStore.getPurchases().filter((p) => p.source_id === sourceId).length;
    }
    try {
      const { count, error } = await this.supabase.client
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', sourceId);
      if (error) {
        this.syncStatus.melde('Prüfen der verknüpften Einkäufe', error);
        // Im Zweifel als verknüpft behandeln - lieber das Löschen verweigern,
        // als eine Herkunftsangabe unwiederbringlich zu verlieren.
        return -1;
      }
      return count ?? 0;
    } catch (e) {
      this.syncStatus.melde('Prüfen der verknüpften Einkäufe', e);
      return -1;
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
    const verknuepft = await this.zaehleVerknuepfteEinkaeufe(sourceId);

    if (verknuepft === -1) {
      return { error: new Error('Die verknüpften Einkäufe liessen sich nicht prüfen') };
    }

    if (verknuepft > 0) {
      return {
        error: new Error(
          `An dieser Quelle ${verknuepft === 1 ? 'hängt 1 Einkauf' : `hängen ${verknuepft} Einkäufe`}. ` +
            'Endgültiges Löschen würde die Herkunftsangabe dort entfernen. Archiviere die Quelle stattdessen.',
        ),
      };
    }

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

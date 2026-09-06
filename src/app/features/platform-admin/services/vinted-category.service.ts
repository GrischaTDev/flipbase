import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CategorySyncStatus, VintedCategory } from '../models/vinted-category.model';

/**
 * Zeilen je Anfrage. Hoeher als `max_rows` in supabase/config.toml zu gehen
 * bringt nichts - PostgREST kuerzt trotzdem auf diesen Wert.
 */
const PAGE_SIZE = 1000;

/**
 * Liest den Kategoriebaum und seinen Auffrischungsstand.
 *
 * Geschrieben wird hier nur ein einziges Feld: `requested_at`. Alles andere
 * setzt der Sniper-Dienst mit Dienstschluessel. Die Datenbank laesst es auch
 * gar nicht anders zu - angemeldete Konten haben nur auf diese eine Spalte ein
 * Schreibrecht.
 */
@Injectable({ providedIn: 'root' })
export class VintedCategoryService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Nur Blaetter: Eine Zwischenkategorie als Sammelauftrag waere zu breit, und
   * der Waehler soll gar nicht erst dazu einladen.
   *
   * Wird geblaettert, weil PostgREST jede Antwort auf `max_rows` aus
   * supabase/config.toml kuerzt - derzeit 1000 Zeilen, bei rund 2500
   * Blattkategorien. Und zwar **ohne Fehler**: Wer nicht blaettert, bekommt
   * eine gueltig aussehende, stillschweigend unvollstaendige Liste, und dem
   * Kategoriewaehler fehlte ein Teil des Baums, ohne dass es jemandem auffiele.
   *
   * Abgebrochen wird erst bei einer leeren Seite, und der Versatz waechst um
   * die tatsaechlich gelieferte Zeilenzahl. Eine volle Seite als Abbruch-
   * kriterium zu nehmen waere derselbe Fehler eine Ebene hoeher: Sinkt
   * `max_rows` einmal unter die hier angefragte Seitengroesse, kaeme schon die
   * erste Seite unvollstaendig zurueck und der Lauf endete zu frueh.
   *
   * Sortiert wird zusaetzlich nach `id`. `path` allein ist nicht eindeutig -
   * ohne einen eindeutigen zweiten Schluessel darf die Datenbank Zeilen mit
   * gleichem Pfad zwischen zwei Seiten unterschiedlich anordnen, und dann
   * taucht eine doppelt auf, waehrend eine andere ganz fehlt.
   */
  async listLeaves(): Promise<VintedCategory[]> {
    const leaves: VintedCategory[] = [];

    for (let offset = 0; ;) {
      const { data, error } = await this.supabase.client
        .from('vinted_categories')
        .select('id, parent_id, title, path')
        .eq('is_leaf', true)
        .order('path', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);

      const page = data ?? [];
      if (page.length === 0) return leaves;

      for (const row of page) {
        leaves.push({
          id: row.id as number,
          parentId: (row.parent_id as number | null) ?? null,
          title: row.title as string,
          path: row.path as string,
        });
      }

      offset += page.length;
    }
  }

  async readStatus(): Promise<CategorySyncStatus> {
    const { data, error } = await this.supabase.client
      .from('vinted_category_syncs')
      .select('refreshed_at, requested_at, last_attempt_at, category_count, last_error')
      .eq('id', 1)
      .single();

    if (error) throw new Error(error.message);

    return {
      refreshedAt: (data?.['refreshed_at'] as string | null) ?? null,
      requestedAt: (data?.['requested_at'] as string | null) ?? null,
      lastAttemptAt: (data?.['last_attempt_at'] as string | null) ?? null,
      categoryCount: (data?.['category_count'] as number | null) ?? 0,
      lastError: (data?.['last_error'] as string | null) ?? null,
    };
  }

  /**
   * Fordert ein erneutes Einlesen an.
   *
   * Der mitgeschickte Zeitstempel ist gleichgueltig: Ein Trigger auf
   * `vinted_category_syncs` ersetzt ihn durch `now()` der Datenbank. Er steht
   * hier nur, weil PostgREST einen Wert fuer die Spalte braucht.
   *
   * Und das ist wichtig so. Der Dienst vergleicht `requested_at` gegen
   * `refreshed_at`, das er aus seiner eigenen Uhr schreibt. Kaeme der eine
   * Wert aus dem Browser und der andere vom Server, entschiede der Gangfehler
   * zwischen beiden Uhren mit: Geht die Uhr des Betreibers vor, gaelte die
   * Anforderung stundenlang als offen und der Dienst liest bei jedem Takt neu
   * ein. Eine gemeinsame Uhr hat den Streit gar nicht erst.
   */
  async requestRefresh(): Promise<void> {
    const { error } = await this.supabase.client
      .from('vinted_category_syncs')
      .update({ requested_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) throw new Error(error.message);
  }
}

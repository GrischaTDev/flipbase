import type { SupabaseClient } from '@supabase/supabase-js';

import type { CategorySyncState } from '../runtime/category-refresh.js';
import type { VintedCategory } from '../vinted/categories.js';

/**
 * Schreibt den Kategoriebaum und fuehrt den Auffrischungsstand.
 *
 * `replaceAll` ersetzt vollstaendig statt zusammenzufuehren: Eine Kategorie,
 * die Vinted entfernt hat, soll auch bei uns verschwinden. Ein Zusammenfuehren
 * liesse Karteileichen stehen, und die tauchten spaeter im Kategoriewaehler
 * auf, ohne je Funde zu liefern.
 *
 * Ein Fehlschlag loescht nichts. Der letzte gute Stand bleibt benutzbar, und
 * die Administration sieht am Fehlertext, dass er alt ist. Deshalb schreibt
 * `replaceAll` markieren-und-nachraeumen statt erst-leeren-dann-schreiben:
 * Bricht das Schreiben mitten in einem Block ab, ist noch keine Zeile geloescht
 * worden - der alte Baum steht unveraendert weiter.
 *
 * Diese Zusicherung gilt fuer **einen** Lauf zur Zeit. Liefen zwei
 * `replaceAll` gleichzeitig, koennte das Nachraeumen des schnelleren die
 * Zeilen des langsameren wegwerfen - beide waeren erfolgreich, das Ergebnis
 * trotzdem unvollstaendig. Der Dienst ruft die Auffrischung aus seiner einen
 * Taktschleife auf, also tritt das nicht ein; wer den Aufruf einmal
 * nebenlaeufig macht, muss ihn vorher serialisieren.
 */
export class CategoryStore {
  constructor(private readonly client: SupabaseClient) {}

  async readSyncState(): Promise<CategorySyncState> {
    const { data, error } = await this.client
      .from('vinted_category_syncs')
      .select('refreshed_at, requested_at, last_attempt_at')
      .eq('id', 1)
      .single();

    if (error) throw new Error(error.message);

    return {
      refreshedAt: (data?.['refreshed_at'] as string | null) ?? null,
      requestedAt: (data?.['requested_at'] as string | null) ?? null,
      // Wird fuer den Rueckzug nach einem Fehlschlag gebraucht: `markFailed`
      // ruehrt `refreshed_at` nicht an, ohne diesen Wert waere die
      // Auffrischung nach jedem Fehlschlag sofort wieder faellig.
      lastAttemptAt: (data?.['last_attempt_at'] as string | null) ?? null,
    };
  }

  async replaceAll(categories: VintedCategory[]): Promise<void> {
    if (categories.length === 0 || categories.length > 10000)
      throw new Error('Ungültige Kategorienmenge');
    const identifiers = new Set<number>();
    for (const category of categories) {
      if (
        !Number.isSafeInteger(category.id) ||
        category.id <= 0 ||
        identifiers.has(category.id) ||
        typeof category.title !== 'string' ||
        !category.title.trim() ||
        category.title.length > 200 ||
        typeof category.slug !== 'string' ||
        !category.slug ||
        category.slug.length > 2048 ||
        typeof category.path !== 'string' ||
        !category.path ||
        category.path.length > 8000 ||
        typeof category.isLeaf !== 'boolean'
      )
        throw new Error('Ungültige Kategorie');
      identifiers.add(category.id);
    }
    // Markieren und nachraeumen statt erst-leeren-dann-schreiben: Ein
    // Zeitstempel fuer den ganzen Lauf wird auf jede geschriebene Zeile
    // gesetzt. Erst wenn wirklich alle Bloecke durch sind, verschwinden die
    // Zeilen, die dieser Lauf nicht angefasst hat - das sind genau die
    // Kategorien, die Vinted nicht mehr liefert. Bricht das Schreiben
    // vorher ab (Zeitueberschreitung, Fremdschluesselverletzung, ...),
    // laeuft das Aufraeumen nie und der alte Baum bleibt vollstaendig
    // stehen, so wie es der Kopfkommentar verspricht.
    const runAt = new Date().toISOString();

    // Die Eltern stehen im selben Schwung wie die Kinder - deshalb muss die
    // Reihenfolge stimmen, damit der Fremdschluessel auf dieselbe Tabelle
    // nicht anschlaegt. Die Tiefe kommt aus der Elternkette (parentId), nicht
    // aus dem Anzeigetext `path`: Ein Kategorietitel, der selbst " > "
    // enthaelt, wuerde die aus dem Pfad gezaehlte Tiefe verfaelschen und die
    // Reihenfolge kaputt machen.
    const byId = new Map(categories.map((category) => [category.id, category] as const));
    const depthCache = new Map<number, number>();
    const visiting = new Set<number>();

    const depthOf = (category: VintedCategory): number => {
      const cached = depthCache.get(category.id);
      if (cached !== undefined) return cached;

      // Kreise müssen vor dem ersten Schreibblock auffallen.
      if (visiting.has(category.id)) throw new Error('Kreis im Kategoriebaum');
      visiting.add(category.id);

      let depth = 0;
      if (category.parentId !== null) {
        const parent = byId.get(category.parentId);
        // Auch einzelne Knoten brauchen ihren Elternteil im vollständigen Baum.
        if (!parent) throw new Error('Elternkategorie fehlt');
        depth = 1 + depthOf(parent);
      }
      if (depth > 32) throw new Error('Der Kategoriebaum ist zu tief');
      visiting.delete(category.id);
      depthCache.set(category.id, depth);
      return depth;
    };

    const ordered = [...categories].sort((left, right) => depthOf(left) - depthOf(right));
    for (const category of ordered) depthOf(category);

    // Ein drastischer Rückgang ist kein verlässlich vollständiger neuer Bestand.
    const { count, error: countError } = await this.client
      .from('vinted_categories')
      .select('id', { count: 'exact', head: true });
    if (countError || count === null) throw new Error('Vorheriger Kategorieumfang nicht verfügbar');
    const { data: sync, error: syncError } = await this.client
      .from('vinted_category_syncs')
      .select('category_count_high_water')
      .eq('id', 1)
      .single();
    const highWater = sync?.['category_count_high_water'];
    if (syncError || !Number.isSafeInteger(highWater) || highWater < 0)
      throw new Error('Vorheriger Kategorieumfang nicht verfügbar');
    const previousMaximum = Math.max(count, highWater);
    if (previousMaximum >= 100 && categories.length < previousMaximum / 2)
      throw new Error('Kategoriebaum unerwartet unvollständig; bisheriger Bestand bleibt erhalten');

    // Der Referenzumfang darf auch über Neustarts und mehrere Auffrischungen nicht schrumpfen.
    const { error: highWaterError } = await this.client
      .from('vinted_category_syncs')
      .update({ category_count_high_water: Math.max(previousMaximum, categories.length) })
      .eq('id', 1);
    if (highWaterError) throw new Error(highWaterError.message);

    const rows = ordered.map((category) => ({
      id: category.id,
      parent_id: category.parentId,
      title: category.title,
      slug: category.slug,
      path: category.path,
      is_leaf: category.isLeaf,
      updated_at: runAt,
    }));

    // In Blöcken schreiben: Rund 2900 Zeilen in einem Rutsch sprengen die
    // Anfragegroesse von PostgREST.
    for (let start = 0; start < rows.length; start += 500) {
      const { error } = await this.client
        .from('vinted_categories')
        .upsert(rows.slice(start, start + 500), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    // Nachraeumen: Alles, was dieser Lauf nicht angefasst hat, ist bei
    // Vinted verschwunden. parent_id hat `on delete cascade` - verschwindet
    // ein Elternteil, gehen seine Kinder mit. Das ist richtig so: Liefert
    // Vinted den Elternteil nicht mehr, liefert es die Kinder auch nicht mehr.
    const { error: deleteError } = await this.client
      .from('vinted_categories')
      .delete()
      .lt('updated_at', runAt);
    if (deleteError) throw new Error(deleteError.message);
  }

  async markRefreshed(count: number, at: Date): Promise<void> {
    const { error } = await this.client
      .from('vinted_category_syncs')
      .update({
        refreshed_at: at.toISOString(),
        last_attempt_at: at.toISOString(),
        category_count: count,
        last_error: null,
      })
      .eq('id', 1);

    if (error) throw new Error(error.message);
  }

  async markFailed(reason: string, at: Date): Promise<void> {
    const { error } = await this.client
      .from('vinted_category_syncs')
      .update({ last_attempt_at: at.toISOString(), last_error: reason })
      .eq('id', 1);

    if (error) throw new Error(error.message);
  }
}

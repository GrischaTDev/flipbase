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
      .select('refreshed_at, requested_at')
      .eq('id', 1)
      .single();

    if (error) throw new Error(error.message);

    return {
      refreshedAt: (data?.['refreshed_at'] as string | null) ?? null,
      requestedAt: (data?.['requested_at'] as string | null) ?? null,
    };
  }

  async replaceAll(categories: VintedCategory[]): Promise<void> {
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

    const depthOf = (category: VintedCategory): number => {
      const cached = depthCache.get(category.id);
      if (cached !== undefined) return cached;

      // Vor der Rekursion eintragen: Ein Kreis in den Eingabedaten (A verweist
      // auf B, B auf A) liefe sonst bis zum Ueberlauf des Aufrufstapels. So
      // bricht er bei der bereits besuchten Kategorie ab.
      //
      // Die Tiefe, die dabei herauskommt, haengt von der Reihenfolge der
      // Aufrufe ab und ist willkuerlich - und anders als bei einem fehlenden
      // Elternteil faengt die Datenbank das nicht auf: Liegen beide Zeilen im
      // selben Schreibblock, sind am Ende der Anweisung beide vorhanden und die
      // Fremdschluesselpruefung ist zufrieden. Ein Kreis wuerde also still
      // gespeichert. Vinted liefert einen Baum, keinen Graphen; kaeme dort je
      // ein Kreis an, braeuchte es eine eigene Pruefung vor dem Schreiben.
      depthCache.set(category.id, 0);

      let depth = 0;
      if (category.parentId !== null) {
        const parent = byId.get(category.parentId);
        // Ein Elternteil, der im selben Lauf nicht mitkommt, ist ein Fehler
        // in den Eingabedaten (siehe Test dazu). depthOf gibt hier trotzdem
        // einen Wert zurueck, statt abzustuerzen - die Fremdschluesselpruefung
        // der Datenbank soll den Fehler melden, nicht diese Sortierung.
        depth = parent ? 1 + depthOf(parent) : 1;
      }

      depthCache.set(category.id, depth);
      return depth;
    };

    const ordered = [...categories].sort((left, right) => depthOf(left) - depthOf(right));

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

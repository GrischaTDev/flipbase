import {
  parseVintedListingCatalogRead,
  type VintedListingCatalogRead,
} from './vinted-listing-catalog.ts';

interface ListingCatalogStoreOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly fetch?: typeof fetch;
  /** Wie alt Baum und Felder höchstens werden, bevor sie erneut gelesen werden. */
  readonly maxAgeMs?: number;
  /** Höchstzahl Kategorien je Abgleich; der Rest folgt in späteren Abgleichen. */
  readonly batchSize?: number;
}

/** Was beim nächsten Abgleich gelesen werden soll. */
export interface VintedListingCatalogWork {
  readonly includeTree: boolean;
  readonly categoryIds: readonly number[];
  /** Höchstdauer des Lesens; länger, solange ein Auftrag zum Neu-Einlesen offen ist. */
  readonly budgetMs?: number;
}

/** Je Abgleich bei offenem Auftrag aus dem Plattform-Admin. */
const refreshBatchSize = 200;
const refreshBudgetMs = 180_000;

const weekMs = 7 * 24 * 60 * 60 * 1000;

/** Liest den Stand des lokalen Vinted-Katalogs und speichert neue Lesestände. */
export class SupabaseVintedListingCatalogStore {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly request: typeof fetch;
  private readonly maxAgeMs: number;
  private readonly batchSize: number;

  constructor(options: ListingCatalogStoreOptions) {
    if (!options.serviceRoleKey) throw new Error('Serverzugang fehlt');
    this.baseUrl = options.url.replace(/\/$/, '');
    this.serviceRoleKey = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
    this.maxAgeMs = options.maxAgeMs ?? weekMs;
    this.batchSize = options.batchSize ?? 60;
  }

  /** Fällig sind ein fehlender oder älterer Baum und Endkategorien ohne oder mit alten Feldern. */
  async work(now = new Date()): Promise<VintedListingCatalogWork | null> {
    // Ein Auftrag zum Neu-Einlesen macht alles fällig, was vor ihm gelesen wurde.
    const refresh = this.row(
      await this.get('vinted_listing_catalog_refreshes', { select: 'requested_at', id: 'eq.1' }),
    )?.['requested_at'];
    const requestedAt =
      typeof refresh === 'string' && Number.isFinite(Date.parse(refresh)) ? Date.parse(refresh) : 0;
    const staleBefore = new Date(
      Math.max(now.getTime() - this.maxAgeMs, Math.min(requestedAt, now.getTime())),
    ).toISOString();
    const newest = await this.get('vinted_listing_categories', {
      select: 'tree_observed_at',
      order: 'tree_observed_at.desc',
      limit: '1',
    });
    const treeAt = this.row(newest)?.['tree_observed_at'];
    const includeTree =
      typeof treeAt !== 'string' || !(Date.parse(treeAt) >= Date.parse(staleBefore));
    const due = await this.get('vinted_listing_categories', {
      select: 'id',
      is_leaf: 'eq.true',
      or: `(fields_observed_at.is.null,fields_observed_at.lt.${staleBefore})`,
      order: 'fields_observed_at.asc.nullsfirst,id.asc',
      limit: String(
        requestedAt > now.getTime() - this.maxAgeMs ? refreshBatchSize : this.batchSize,
      ),
    });
    if (!Array.isArray(due)) throw new Error('Ungültige Katalogantwort');
    const categoryIds = due.map((entry) => {
      const id = this.row([entry])?.['id'];
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
        throw new Error('Ungültige Katalogantwort');
      return id;
    });
    if (!includeTree && !categoryIds.length) return null;
    return requestedAt > now.getTime() - this.maxAgeMs
      ? { includeTree, categoryIds, budgetMs: refreshBudgetMs }
      : { includeTree, categoryIds };
  }

  /** Speichert Baum, Farben und Felder; eine abgelehnte Kategorie hält den Rest nicht auf. */
  async save(input: VintedListingCatalogRead): Promise<{ categories: number; failed: number }> {
    const read = parseVintedListingCatalogRead(input);
    if (read.tree)
      await this.rpc('marketplace_save_vinted_listing_categories', {
        p_observed_at: read.observedAt,
        p_categories: read.tree,
      });
    if (read.colors)
      await this.rpc('marketplace_save_vinted_listing_options', {
        p_field_code: 'color',
        p_options: read.colors,
      });
    let categories = 0;
    let failed = 0;
    for (const entry of read.categories) {
      try {
        await this.rpc('marketplace_save_vinted_listing_category_fields', {
          p_category_id: entry.categoryId,
          p_observed_at: read.observedAt,
          p_fields: entry.fields,
        });
        categories++;
      } catch {
        failed++;
      }
    }
    return { categories, failed };
  }

  private async get(table: string, query: Record<string, string>): Promise<unknown> {
    const url = new URL(`/rest/v1/${table}`, this.baseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return this.json(
      await this.request(url, {
        method: 'GET',
        redirect: 'error',
        headers: { ...this.headers(), 'Accept-Profile': 'public' },
        signal: AbortSignal.timeout(10000),
      }),
    );
  }

  private async rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    return this.json(
      await this.request(new URL(`/rest/v1/rpc/${name}`, this.baseUrl), {
        method: 'POST',
        redirect: 'error',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      }),
    );
  }

  private row(value: unknown): Record<string, unknown> | null {
    const first: unknown = Array.isArray(value) ? value[0] : null;
    return first && typeof first === 'object' && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : null;
  }

  private headers(): Record<string, string> {
    return { apikey: this.serviceRoleKey, Authorization: `Bearer ${this.serviceRoleKey}` };
  }

  private async json(response: Response): Promise<unknown> {
    if (!response.ok) throw new Error('Vinted-Katalog in der Datenbank nicht verfügbar');
    try {
      return await response.json();
    } catch {
      throw new Error('Ungültige Antwort zum Vinted-Katalog');
    }
  }
}

interface ListingCategoryOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly request: typeof fetch;
}
function invalid(): Error {
  return new Error('Der Vinted-Kategoriepfad konnte nicht geladen werden.');
}
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    throw invalid();
  return value;
}
function categoryId(input: unknown): number {
  if (typeof input !== 'number' || !Number.isInteger(input) || input < 1 || input > 2147483647)
    throw invalid();
  return input;
}
function timestamp(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(input) ||
    !Number.isFinite(Date.parse(input))
  )
    throw invalid();
  return new Date(input).toISOString();
}

/** Der Cache liefert nur Navigationskennungen; das aktuelle Anbieterformular bleibt maßgeblich. */
export async function loadMarketplaceListingCategoryPath(
  options: ListingCategoryOptions,
  targetId: number,
  authorize: () => Promise<boolean>,
): Promise<readonly number[]> {
  try {
    categoryId(targetId);
    const origin = new URL(options.url);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      !options.serviceRoleKey.trim()
    )
      throw invalid();
    const read = async (
      table: 'vinted_categories' | 'vinted_category_syncs',
      id: number,
    ): Promise<unknown> => {
      if (!(await authorize())) throw invalid();
      const url = new URL('/rest/v1/' + table, origin);
      url.searchParams.set(
        'select',
        table === 'vinted_categories'
          ? 'id,parent_id,is_leaf,updated_at'
          : 'refreshed_at,category_count',
      );
      url.searchParams.set('id', 'eq.' + id);
      url.searchParams.set('limit', '2');
      const response = await options.request(url, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
          apikey: options.serviceRoleKey,
          Authorization: 'Bearer ' + options.serviceRoleKey,
          'Accept-Profile': 'public',
        },
      });
      if (response.status !== 200 || response.redirected) throw invalid();
      const values: unknown = await response.json();
      if (!Array.isArray(values) || values.length !== 1) throw invalid();
      return values[0];
    };
    const status = async () => {
      const value = record(await read('vinted_category_syncs', 1), [
        'refreshed_at',
        'category_count',
      ]);
      const count = categoryId(value['category_count']);
      if (count > 10_000) throw invalid();
      return { refreshedAt: timestamp(value['refreshed_at']), count };
    };
    const before = await status();
    const ancestors: number[] = [];
    const seen = new Set<number>();
    let current = targetId;
    const stamps = new Set<string>();
    for (;;) {
      if (seen.has(current) || seen.size >= 31) throw invalid();
      seen.add(current);
      const node = record(await read('vinted_categories', current), [
        'id',
        'parent_id',
        'is_leaf',
        'updated_at',
      ]);
      if (categoryId(node['id']) !== current || node['is_leaf'] !== (current === targetId))
        throw invalid();
      stamps.add(timestamp(node['updated_at']));
      // Die bestehende Auffrischung schreibt in Blöcken. Keine Eltern aus verschiedenen Läufen mischen.
      if (stamps.size !== 1) throw invalid();
      if (node['parent_id'] === null) break;
      current = categoryId(node['parent_id']);
      ancestors.push(current);
    }
    const after = await status();
    if (
      before.refreshedAt !== after.refreshedAt ||
      before.count !== after.count ||
      seen.size > after.count ||
      !(await authorize())
    )
      throw invalid();
    return Object.freeze(ancestors.reverse());
  } catch {
    throw invalid();
  }
}

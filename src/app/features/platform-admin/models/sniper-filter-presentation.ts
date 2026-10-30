import type { SniperQuery } from './sniper-query.model';

export function filterNeedsAttention(query: SniperQuery): boolean {
  return (
    query.is_active &&
    (query.coverage_status === 'limited' ||
      query.run_state === 'invalid' ||
      ['rate_limited', 'forbidden', 'failed'].includes(query.last_status))
  );
}

export function filterCategoryLabel(
  query: SniperQuery,
  paths: ReadonlyMap<number, string>,
): string {
  if (query.catalog_id == null) return 'Alle Kategorien';
  return paths.get(query.catalog_id)?.replaceAll(' > ', ' › ') ?? 'Kategorie nicht verfügbar';
}

export function filterBrandLabel(query: SniperQuery): string {
  if (query.brand_names?.length) return query.brand_names.join(' · ');
  const count = query.brand_ids?.length ?? (query.brand_id ? 1 : 0);
  return count > 1 ? `${count} gespeicherte Marken` : count ? 'Gespeicherte Marke' : 'Alle Marken';
}

export function filterPriceLabel(query: SniperQuery): string {
  const from = query.price_from?.toLocaleString('de-DE');
  const to = query.price_to?.toLocaleString('de-DE');
  if (from !== undefined && to !== undefined) return `${from}–${to} €`;
  return to !== undefined
    ? `bis ${to} €`
    : from !== undefined
      ? `ab ${from} €`
      : 'Ohne Preisgrenze';
}

export function filterIntervalLabel(milliseconds: number): string {
  if (milliseconds >= 3600000 && milliseconds % 3600000 === 0)
    return `${milliseconds / 3600000} Std.`;
  if (milliseconds >= 60000 && milliseconds % 60000 === 0) return `${milliseconds / 60000} Min.`;
  return `${milliseconds / 1000} Sek.`;
}

export function normalizeProductHandle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}

export function productStorePath(id: string, handle?: string | null): string {
  const base = `/shop/item/${encodeURIComponent(id)}`;
  const normalized = normalizeProductHandle(handle ?? '');
  return normalized ? `${base}/${normalized}` : base;
}

export function productSeoTitle(title: string, override?: string | null): string {
  return override?.trim() || title.trim();
}

export function productSeoDescription(
  description?: string | null,
  override?: string | null,
): string {
  return (override?.trim() || description?.trim() || '').replace(/\s+/g, ' ').slice(0, 320);
}

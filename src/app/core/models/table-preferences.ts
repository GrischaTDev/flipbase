export interface TableColumnOption {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
}

export type TablePreferences = Readonly<Record<string, readonly string[]>>;

export function parseTablePreferences(value: unknown): TablePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, ids]) =>
          /^[a-z][a-z_]{0,63}$/.test(key) &&
          Array.isArray(ids) &&
          ids.every((id) => typeof id === 'string'),
      )
      .map(([key, ids]) => [key, [...new Set(ids as string[])]]),
  );
}

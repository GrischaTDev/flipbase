import type { ColumnDefinition } from './table-preferences.models';

interface StoredSalesColumn {
  readonly id: string;
  readonly visible: boolean;
  readonly order?: number;
}

const formerDefaultOrder = [
  'title',
  'quantity',
  'platform',
  'sale_date',
  'revenue',
  'cost_of_goods_sold',
  'selling_costs',
  'profit',
  'margin',
  'holding_days',
  'actions',
] as const;

/**
 * Nur die belegte frühere Standardfolge umstellen. Eigene Spaltenfolgen werden
 * anschließend weiterhin vom allgemeinen Schemaabgleich übernommen.
 * null bedeutet: keine spezielle Verkaufsmigration erforderlich.
 */
export function migrateLegacySalesColumns<T extends string>(
  stored: readonly StoredSalesColumn[],
  defaults: readonly ColumnDefinition<T>[],
): ColumnDefinition<T>[] | null {
  const orderedIds = stored
    .map((column, index) => ({ id: column.id, order: column.order ?? index }))
    .sort((left, right) => left.order - right.order)
    .map((column) => column.id);
  if (
    orderedIds.length !== formerDefaultOrder.length ||
    !orderedIds.every((id, index) => id === formerDefaultOrder[index])
  ) {
    return null;
  }

  const savedById = new Map(stored.map((column) => [column.id, column]));
  return defaults.map((column, order) => ({
    ...column,
    order,
    visible: column.locked ? true : (savedById.get(column.id)?.visible ?? column.visible),
  }));
}

import { InventoryItem, PurchaseLine, Sale } from '../../../core/models/flipbase.models';

/** Umsätze stammen aus Verkaufspositionen, nicht aus dem Gesamtbetrag gemischter Verkäufe. */
export function summarizePackageContents(
  line: PurchaseLine,
  inventoryItems: readonly InventoryItem[],
  sales: readonly Sale[],
  salesLoaded: boolean,
) {
  const items = inventoryItems.filter(
    (item) =>
      item.workspace_id === line.workspace_id &&
      item.purchase_id === line.purchase_id &&
      item.source_package_line_id === line.id,
  );
  const rows = items.map((item) => {
    const matching = sales
      .filter(
        (sale) => sale.workspace_id === line.workspace_id && !sale.voided_at && !sale.returned_at,
      )
      .flatMap((sale) =>
        (sale.lines ?? []).filter((saleLine) => saleLine.inventory_item_id === item.id),
      );
    const reliable =
      salesLoaded && matching.length <= 1 && !(item.status === 'sold' && matching.length === 0);
    const proceeds = !reliable ? null : matching.length === 0 ? 0 : matching[0].line_total;
    return {
      item,
      sold: reliable && matching.length === 1,
      proceeds,
      statusLabel: !reliable
        ? 'Verkauf noch prüfen'
        : matching.length === 1
          ? 'Verkauft'
          : item.status === 'archived'
            ? 'Archiviert'
            : item.status === 'defective'
              ? 'Defekt'
              : item.status === 'reserved'
                ? 'Reserviert'
                : 'Im Bestand',
    };
  });
  const proceeds =
    !salesLoaded || rows.some((row) => row.proceeds === null || !Number.isFinite(row.proceeds))
      ? null
      : Math.round(rows.reduce((sum, row) => sum + (row.proceeds ?? 0), 0) * 100) / 100;
  return { line, rows, proceeds, soldCount: rows.filter((row) => row.sold).length };
}

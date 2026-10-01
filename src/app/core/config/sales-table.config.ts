import type { TableConfig } from '../models/table-preferences.models';

/** Gleiche Begriffe in Tabelle, Spaltenmenü, Kennzahlen und Verkaufserfassung. */
export const SALES_LABELS = {
  revenue: 'Umsatz',
  purchaseCosts: 'Einkaufskosten',
  sellingCosts: 'Gebühren & Versand',
  profit: 'Gewinn',
  margin: 'Marge',
} as const;

export const SALES_HELP = {
  revenue: 'Umsatz einschließlich der vom Käufer erhaltenen Versandkosten.',
  purchaseCosts: 'Kosten der verkauften Artikel einschließlich zugeordneter Einkaufsnebenkosten.',
  sellingCosts: 'Enthält Gebühren, Versand, Verpackung und sonstige erfasste Verkaufskosten.',
  profit:
    'Umsatz abzüglich Einkaufskosten und sämtlicher Verkaufskosten. Betriebsausgaben und Steuern sind nicht abgezogen.',
} as const;

export type SalesColumnId =
  | 'record_number'
  | 'sale_date'
  | 'title'
  | 'quantity'
  | 'platform'
  | 'revenue'
  | 'cost_of_goods_sold'
  | 'selling_costs'
  | 'profit'
  | 'margin'
  | 'holding_days'
  | 'actions';

export type SalesSortField =
  'sale_date' | 'revenue' | 'profit' | 'margin' | 'title' | 'holding_days';

export const SALES_TABLE_CONFIG: TableConfig<SalesColumnId, SalesSortField> = {
  defaultColumns: [
    { id: 'record_number', label: 'Verkaufsnummer', visible: true, order: 0, locked: true },
    { id: 'sale_date', label: 'Datum', visible: true, order: 1 },
    { id: 'title', label: 'Artikel', visible: true, order: 2, locked: true },
    { id: 'quantity', label: 'Menge', visible: true, order: 3 },
    { id: 'platform', label: 'Plattform', visible: true, order: 4 },
    { id: 'revenue', label: SALES_LABELS.revenue, visible: true, order: 5 },
    { id: 'cost_of_goods_sold', label: SALES_LABELS.purchaseCosts, visible: true, order: 6 },
    { id: 'selling_costs', label: SALES_LABELS.sellingCosts, visible: true, order: 7 },
    { id: 'profit', label: SALES_LABELS.profit, visible: true, order: 8 },
    { id: 'margin', label: SALES_LABELS.margin, visible: true, order: 9 },
    { id: 'holding_days', label: 'Haltedauer', visible: true, order: 10 },
    { id: 'actions', label: 'Aktionen', visible: true, order: 11, locked: true },
  ],
  defaultSort: { field: 'sale_date', direction: 'desc' },
  sortOptions: [
    { value: 'sale_date', label: 'Verkaufsdatum', kind: 'date' },
    { value: 'revenue', label: SALES_LABELS.revenue, kind: 'number' },
    { value: 'profit', label: SALES_LABELS.profit, kind: 'number' },
    { value: 'margin', label: SALES_LABELS.margin, kind: 'number' },
    { value: 'title', label: 'Artikelname', kind: 'text' },
    { value: 'holding_days', label: 'Haltedauer', kind: 'number' },
  ],
};

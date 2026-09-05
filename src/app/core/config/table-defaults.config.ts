import { TableConfig } from '../models/table-preferences.models';

// ==========================================
// 1. Verkäufe (Sales)
// ==========================================
export type SalesColumnId =
  | 'title'
  | 'quantity'
  | 'platform'
  | 'sale_date'
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
    { id: 'title', label: 'Verkaufter Artikel', visible: true, order: 0, locked: true },
    { id: 'quantity', label: 'Menge', visible: true, order: 1 },
    { id: 'platform', label: 'Plattform', visible: true, order: 2 },
    { id: 'sale_date', label: 'Datum', visible: true, order: 3 },
    { id: 'revenue', label: 'Verkaufserlös', visible: true, order: 4 },
    { id: 'cost_of_goods_sold', label: 'Wareneinsatz', visible: true, order: 5 },
    { id: 'selling_costs', label: 'Verkaufskosten', visible: true, order: 6 },
    { id: 'profit', label: 'Ergebnis', visible: true, order: 7 },
    { id: 'margin', label: 'Marge', visible: true, order: 8 },
    { id: 'holding_days', label: 'Haltedauer', visible: true, order: 9 },
    { id: 'actions', label: 'Aktionen', visible: true, order: 10, locked: true },
  ],
  defaultSort: { field: 'sale_date', direction: 'desc' },
  sortOptions: [
    { value: 'sale_date', label: 'Verkaufsdatum' },
    { value: 'revenue', label: 'Verkaufserlös' },
    { value: 'profit', label: 'Ergebnis' },
    { value: 'margin', label: 'Marge' },
    { value: 'title', label: 'Artikelname' },
    { value: 'holding_days', label: 'Haltedauer' },
  ],
};

// ==========================================
// 2. Inventar (Inventory)
// ==========================================
export type InventoryColumnId =
  | 'selection'
  | 'thumbnail'
  | 'title'
  | 'condition'
  | 'quantity'
  | 'status'
  | 'origin'
  | 'cost_unit'
  | 'cost_total'
  | 'expected_value'
  | 'actions';

export type InventorySortField = 'updated_at' | 'title' | 'quantity' | 'cost_unit' | 'cost_total';

export const INVENTORY_TABLE_CONFIG: TableConfig<InventoryColumnId, InventorySortField> = {
  defaultColumns: [
    { id: 'selection', label: 'Auswahl', visible: true, order: 0, locked: true },
    { id: 'title', label: 'Artikel', visible: true, order: 1, locked: true },
    { id: 'condition', label: 'Zustand', visible: true, order: 2 },
    { id: 'quantity', label: 'Bestand', visible: true, order: 3 },
    { id: 'status', label: 'Status', visible: true, order: 4 },
    { id: 'origin', label: 'Herkunft', visible: true, order: 5 },
    { id: 'cost_unit', label: 'Kosten pro Stück', visible: true, order: 6 },
    { id: 'cost_total', label: 'Bestandswert', visible: true, order: 7 },
    { id: 'expected_value', label: 'Verkauf', visible: true, order: 8 },
    { id: 'actions', label: 'Aktionen', visible: true, order: 9, locked: true },
  ],
  defaultSort: { field: 'updated_at', direction: 'desc' },
  sortOptions: [
    { value: 'updated_at', label: 'Zuletzt aktualisiert' },
    { value: 'title', label: 'Titel (A-Z)' },
    { value: 'quantity', label: 'Bestandsmenge' },
    { value: 'cost_unit', label: 'Kosten pro Stück' },
    { value: 'cost_total', label: 'Bestandswert' },
  ],
};

// ==========================================
// 3. Einkäufe (Purchases)
// ==========================================
export type PurchasesColumnId =
  'type' | 'title' | 'purchase_date' | 'status' | 'total_cost' | 'units' | 'actions';

export type PurchasesSortField = 'purchase_date' | 'total_cost' | 'title';

export const PURCHASES_TABLE_CONFIG: TableConfig<PurchasesColumnId, PurchasesSortField> = {
  defaultColumns: [
    { id: 'type', label: 'Typ', visible: true, order: 0, locked: true },
    { id: 'title', label: 'Einkauf & Lieferant', visible: true, order: 1, locked: true },
    { id: 'purchase_date', label: 'Kaufdatum', visible: true, order: 2 },
    { id: 'status', label: 'Status', visible: true, order: 3 },
    { id: 'total_cost', label: 'Gesamtkosten', visible: true, order: 4 },
    { id: 'units', label: 'Stückzahl & Bestand', visible: true, order: 5 },
    { id: 'actions', label: 'Aktionen', visible: true, order: 6, locked: true },
  ],
  defaultSort: { field: 'purchase_date', direction: 'desc' },
  sortOptions: [
    { value: 'purchase_date', label: 'Kaufdatum' },
    { value: 'total_cost', label: 'Gesamtkosten' },
    { value: 'title', label: 'Titel' },
  ],
};

// ==========================================
// 4. Buchhaltung (Accounting / Bank Transactions)
// ==========================================
export type AccountingColumnId =
  'booking_date' | 'counterparty' | 'purpose' | 'amount' | 'match' | 'status' | 'actions';

export type AccountingSortField = 'booking_date' | 'amount' | 'counterparty';

export const ACCOUNTING_TABLE_CONFIG: TableConfig<AccountingColumnId, AccountingSortField> = {
  defaultColumns: [
    { id: 'booking_date', label: 'Buchungsdatum', visible: true, order: 0, locked: true },
    {
      id: 'counterparty',
      label: 'Auftraggeber / Empfänger',
      visible: true,
      order: 1,
      locked: true,
    },
    { id: 'purpose', label: 'Verwendungszweck', visible: true, order: 2 },
    { id: 'amount', label: 'Betrag', visible: true, order: 3 },
    { id: 'match', label: 'Zugeordnetes Objekt', visible: true, order: 4 },
    { id: 'status', label: 'Status', visible: true, order: 5 },
    { id: 'actions', label: 'Aktionen', visible: true, order: 6, locked: true },
  ],
  defaultSort: { field: 'booking_date', direction: 'desc' },
  sortOptions: [
    { value: 'booking_date', label: 'Buchungsdatum' },
    { value: 'amount', label: 'Betrag' },
    { value: 'counterparty', label: 'Auftraggeber' },
  ],
};

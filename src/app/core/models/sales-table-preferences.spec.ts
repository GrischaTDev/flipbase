import { describe, expect, it } from 'vitest';
import { SALES_HELP, SALES_LABELS, SALES_TABLE_CONFIG } from '../config/sales-table.config';
import { migrateLegacySalesColumns } from './sales-table-preferences';

const legacyIds = [
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
];
const expectedIds = [
  'record_number',
  'sale_date',
  'title',
  'quantity',
  'platform',
  'revenue',
  'cost_of_goods_sold',
  'selling_costs',
  'profit',
  'margin',
  'holding_days',
  'actions',
];
const legacyColumns = () => legacyIds.map((id, order) => ({ id, order, visible: true }));
const defaults = SALES_TABLE_CONFIG.defaultColumns;

 describe('Verkaufstabelle und gespeicherte Standardansicht', () => {
  it('zeigt Nummer und Datum vor Artikeln in eindeutiger Standardfolge', () => {
    expect(defaults.map((column) => column.id)).toEqual(expectedIds);
    expect(defaults.map((column) => column.order)).toEqual(expectedIds.map((_, index) => index));
    expect(defaults[0]).toMatchObject({ label: 'Verkaufsnummer', locked: true, visible: true });
    expect(SALES_TABLE_CONFIG.defaultSort).toEqual({ field: 'sale_date', direction: 'desc' });
  });

  it('verwendet die einfachen Namen auch im Sortiermenü', () => {
    expect(SALES_LABELS).toEqual({
      revenue: 'Umsatz',
      purchaseCosts: 'Einkaufskosten',
      sellingCosts: 'Gebühren & Versand',
      profit: 'Gewinn',
      margin: 'Marge',
    });
    for (const value of ['revenue', 'profit'] as const) {
      expect(SALES_TABLE_CONFIG.sortOptions.find((option) => option.value === value)?.label).toBe(
        SALES_LABELS[value],
      );
    }
    expect(SALES_HELP.sellingCosts).toContain('Verpackung');
    expect(SALES_HELP.profit).toContain('Betriebsausgaben und Steuern');
  });

  it('migriert nur die alte Standardfolge und behält ausgeblendete optionale Spalten', () => {
    const stored = legacyColumns().map((column) => ({
      ...column,
      visible: column.id !== 'margin' && column.id !== 'holding_days',
    }));
    const migrated = migrateLegacySalesColumns(stored, defaults);
    expect(migrated?.map((column) => column.id)).toEqual(expectedIds);
    expect(migrated?.find((column) => column.id === 'margin')?.visible).toBe(false);
    expect(migrated?.find((column) => column.id === 'holding_days')?.visible).toBe(false);
    expect(migrated?.find((column) => column.id === 'record_number')?.visible).toBe(true);
  });

  it('erkennt gespeicherte Standardfolge auch in anderer Array-Reihenfolge', () => {
    expect(
      migrateLegacySalesColumns(legacyColumns().reverse(), defaults)?.map((column) => column.id),
    ).toEqual(expectedIds);
  });

  it('berücksichtigt Altdaten ohne explizite Sortierposition', () => {
    const stored = legacyColumns().map(({ id, visible }) => ({ id, visible }));
    expect(migrateLegacySalesColumns(stored, defaults)?.map((column) => column.id)).toEqual(
      expectedIds,
    );
  });

  it('setzt persönliche Spaltenfolgen nicht zurück', () => {
    const stored = legacyColumns();
    [stored[0], stored[1]] = [stored[1], stored[0]];
    expect(
      migrateLegacySalesColumns(
        stored.map((column, order) => ({ ...column, order })),
        defaults,
      ),
    ).toBeNull();
  });

  it('migriert die neue Folge nicht erneut und erfindet keine unvollständigen Altdaten', () => {
    expect(migrateLegacySalesColumns(defaults, defaults)).toBeNull();
    expect(migrateLegacySalesColumns(legacyColumns().slice(0, -1), defaults)).toBeNull();
    const duplicate = legacyColumns();
    duplicate[0] = { ...duplicate[1], order: 0 };
    expect(migrateLegacySalesColumns(duplicate, defaults)).toBeNull();
  });

  it('mutiert weder gespeicherte noch vorgegebene Spalten', () => {
    const stored = Object.freeze(legacyColumns().map((column) => Object.freeze(column)));
    const frozenDefaults = Object.freeze(defaults.map((column) => Object.freeze({ ...column })));
    const before = JSON.stringify({ stored, frozenDefaults });
    migrateLegacySalesColumns(stored, frozenDefaults);
    expect(JSON.stringify({ stored, frozenDefaults })).toBe(before);
  });
});

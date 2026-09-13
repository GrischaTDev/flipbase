import { describe, expect, it } from 'vitest';
import { INVENTORY_TABLE_CONFIG } from '../../../core/config/table-defaults.config';

describe('Inventar-Standardansicht', () => {
  it('zeigt Artikel und drei getrennte Bestandsmengen sowie Auswahl und Aktionen', () => {
    expect(
      INVENTORY_TABLE_CONFIG.defaultColumns
        .filter((column) => column.visible)
        .map((column) => column.id),
    ).toEqual(['selection', 'title', 'quantity', 'available', 'reserved', 'actions']);
    expect(
      INVENTORY_TABLE_CONFIG.defaultColumns.find((column) => column.id === 'quantity')?.label,
    ).toBe('Auf Lager');
  });

  it('erhält optionale Fachspalten und bestehende IDs für gespeicherte Ansichten', () => {
    expect(
      INVENTORY_TABLE_CONFIG.defaultColumns
        .filter((column) => !column.visible)
        .map((column) => column.id),
    ).toEqual(['condition', 'status', 'origin', 'unit_cost', 'inventory_value', 'sale']);
    expect(new Set(INVENTORY_TABLE_CONFIG.defaultColumns.map((column) => column.order)).size).toBe(
      INVENTORY_TABLE_CONFIG.defaultColumns.length,
    );
  });
});

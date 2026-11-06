import { describe, expect, it } from 'vitest';
import { clampTablePage, tablePageCount, tablePageRows } from './table-page';

describe('table-page', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index);

  it('zählt mindestens eine Seite, auch ohne Zeilen', () => {
    expect(tablePageCount(0, 10)).toBe(1);
    expect(tablePageCount(23, 10)).toBe(3);
    expect(tablePageCount(20, 10)).toBe(2);
  });

  it('hält die Seite nach Filterwechseln im gültigen Bereich', () => {
    expect(clampTablePage(5, 23, 10)).toBe(3);
    expect(clampTablePage(0, 23, 10)).toBe(1);
    expect(clampTablePage(Number.NaN, 23, 10)).toBe(1);
  });

  it('liefert die Zeilen der gewählten Seite', () => {
    expect(tablePageRows(rows, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(tablePageRows(rows, 3, 10)).toEqual([20, 21, 22]);
    expect(tablePageRows(rows, 9, 10)).toEqual([20, 21, 22]);
  });
});

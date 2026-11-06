/** Gemeinsame Seitenlogik für Tabellen, deren Zeilen die Fachseite selbst rendert. */
export function tablePageCount(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / Math.max(1, pageSize)));
}

/** Hält eine Seitenzahl im gültigen Bereich, z. B. nach einem Filterwechsel. */
export function clampTablePage(page: number, totalItems: number, pageSize: number): number {
  const safePage = Number.isFinite(page) ? Math.trunc(page) : 1;
  return Math.min(Math.max(1, safePage), tablePageCount(totalItems, pageSize));
}

/** Liefert die Zeilen der angefragten (1-basierten) Seite. */
export function tablePageRows<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const size = Math.max(1, pageSize);
  const start = (clampTablePage(page, rows.length, size) - 1) * size;
  return rows.slice(start, start + size);
}

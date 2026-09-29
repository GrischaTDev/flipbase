export type MasterDataSection = 'brands' | 'sources' | 'platforms' | 'sellers';
export type MasterDataStatus = 'active' | 'archived' | 'all';

export interface MasterDataRow {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly isActive: boolean | null;
}

export const MASTER_DATA_SECTIONS = [
  { id: 'brands', label: 'Marken', path: '/master-data/brands', createLabel: 'Marke anlegen' },
  { id: 'sources', label: 'Einkaufsquellen', path: '/master-data/sources', createLabel: 'Quelle anlegen' },
  { id: 'platforms', label: 'Verkaufsplattformen', path: '/master-data/platforms', createLabel: '' },
  { id: 'sellers', label: 'Verkäufer', path: '/master-data/sellers', createLabel: 'Verkäufer anlegen' },
] as const;

export function resolveMasterDataSection(value: unknown): MasterDataSection {
  return MASTER_DATA_SECTIONS.find((section) => section.id === value)?.id ?? 'brands';
}

export function canEditMasterData(role: string | null, workspaceLoaded: boolean): boolean {
  return workspaceLoaded && (role === 'owner' || role === 'admin' || role === 'member');
}

export function canManageMasterData(role: string | null, workspaceLoaded: boolean): boolean {
  return workspaceLoaded && (role === 'owner' || role === 'admin');
}

function nameKey(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('de-DE');
}

export function selectMasterDataRows(
  rows: readonly MasterDataRow[],
  search: string,
  status: MasterDataStatus,
  direction: 'asc' | 'desc',
): readonly MasterDataRow[] {
  const query = nameKey(search);
  const multiplier = direction === 'desc' ? -1 : 1;
  return rows
    .filter((row) => status === 'all' || (status === 'archived' ? row.isActive === false : row.isActive !== false))
    .filter((row) => !query || nameKey(row.name).includes(query))
    .sort((left, right) => multiplier * (
      left.name.localeCompare(right.name, 'de-DE', { numeric: true, sensitivity: 'base' }) ||
      left.id.localeCompare(right.id)
    ));
}

export function validateMasterDataName(
  name: string,
  rows: readonly Pick<MasterDataRow, 'id' | 'name'>[],
  editedId?: string,
): string | null {
  const value = name.trim();
  if (!value) return 'Bitte einen Namen eingeben.';
  if (value.length > 120) return 'Der Name darf höchstens 120 Zeichen lang sein.';
  if (rows.some((row) => row.id !== editedId && nameKey(row.name) === nameKey(value))) {
    return 'Dieser Eintrag existiert bereits. Prüfe auch die archivierten Einträge.';
  }
  return null;
}

export function validMergeTarget(
  sourceId: string,
  targetId: string,
  rows: readonly Pick<MasterDataRow, 'id'>[],
): boolean {
  return sourceId !== targetId && rows.some((row) => row.id === sourceId) &&
    rows.some((row) => row.id === targetId);
}

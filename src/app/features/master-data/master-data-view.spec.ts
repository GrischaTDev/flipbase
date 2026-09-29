import { describe, expect, it } from 'vitest';
import {
  MASTER_DATA_SECTIONS,
  canEditMasterData,
  canManageMasterData,
  resolveMasterDataSection,
  selectMasterDataRows,
  validateMasterDataName,
  validMergeTarget,
} from './master-data-view';

const rows = [
  { id: 'b', name: 'Vinted', kind: 'Quelle', isActive: false },
  { id: 'a', name: 'Flohmarkt', kind: 'Quelle', isActive: true },
];

describe('Stammdatenansicht', () => {
  it('trennt die vier Bereiche von Kontoverbindungen', () => {
    expect(MASTER_DATA_SECTIONS.map((section) => section.id)).toEqual([
      'brands',
      'sources',
      'platforms',
      'sellers',
    ]);
    expect(resolveMasterDataSection('marketplaces')).toBe('brands');
  });

  it('durchsucht Namen ohne Beachtung der Großschreibung', () => {
    expect(selectMasterDataRows(rows, ' VINTED ', 'all', 'asc').map((row) => row.id)).toEqual([
      'b',
    ]);
  });

  it('blendet archivierte Einträge aus, ohne die Eingabe zu verändern', () => {
    const before = JSON.stringify(rows);
    expect(selectMasterDataRows(rows, '', 'active', 'asc').map((row) => row.id)).toEqual(['a']);
    expect(selectMasterDataRows(rows, '', 'archived', 'asc').map((row) => row.id)).toEqual(['b']);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it('prüft leere und doppelte Namen einschließlich archivierter Einträge', () => {
    expect(validateMasterDataName(' ', rows)).not.toBeNull();
    expect(validateMasterDataName(' vinted ', rows)).not.toBeNull();
    expect(validateMasterDataName('Vinted', rows, 'b')).toBeNull();
  });

  it('verlangt beim Zusammenführen eine vorhandene andere Zielmarke', () => {
    expect(validMergeTarget('a', 'b', rows)).toBe(true);
    expect(validMergeTarget('a', '', rows)).toBe(false);
    expect(validMergeTarget('a', 'a', rows)).toBe(false);
    expect(validMergeTarget('missing', 'a', rows)).toBe(false);
  });

  it('gewährt keine UI-Schreibrechte vor dem Laden des aktuellen Workspace', () => {
    expect(canEditMasterData('owner', false)).toBe(false);
    expect(canEditMasterData(null, true)).toBe(false);
    expect(canEditMasterData('member', true)).toBe(true);
    expect(canManageMasterData('member', true)).toBe(false);
    expect(canManageMasterData('admin', true)).toBe(true);
    expect(canManageMasterData('owner', true)).toBe(true);
  });
});

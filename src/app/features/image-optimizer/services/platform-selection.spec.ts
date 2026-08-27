import { describe, it, expect } from 'vitest';
import { togglePlatformIn, SelectionState } from './platform-selection';

const empty: SelectionState = { selectedIds: [], workingId: null };

describe('Plattformauswahl', () => {
  it('startet leer', () => {
    expect(empty.selectedIds).toEqual([]);
    expect(empty.workingId).toBeNull();
  });

  it('macht die erste gewaehlte Plattform zum Arbeitsziel', () => {
    const { state, inheritFrom } = togglePlatformIn(empty, 'ebay');

    expect(state.selectedIds).toEqual(['ebay']);
    expect(state.workingId).toBe('ebay');
    expect(inheritFrom).toBeNull();
  });

  it('meldet beim Hinzuwaehlen das bisherige Arbeitsziel als Zuschnittquelle', () => {
    const first = togglePlatformIn(empty, 'ebay').state;
    const { state, inheritFrom } = togglePlatformIn(first, 'vinted');

    expect(state.selectedIds).toEqual(['ebay', 'vinted']);
    expect(state.workingId).toBe('ebay');
    expect(inheritFrom).toBe('ebay');
  });

  it('waehlt auch die letzte verbliebene Plattform ab', () => {
    const first = togglePlatformIn(empty, 'ebay').state;
    const { state } = togglePlatformIn(first, 'ebay');

    expect(state.selectedIds).toEqual([]);
    expect(state.workingId).toBeNull();
  });

  it('laesst beim Abwaehlen des Arbeitsziels die naechste nachruecken', () => {
    let state = togglePlatformIn(empty, 'ebay').state;
    state = togglePlatformIn(state, 'vinted').state;
    state = togglePlatformIn(state, 'ebay').state;

    expect(state.selectedIds).toEqual(['vinted']);
    expect(state.workingId).toBe('vinted');
  });

  it('laesst das Arbeitsziel unangetastet, wenn eine andere abgewaehlt wird', () => {
    let state = togglePlatformIn(empty, 'ebay').state;
    state = togglePlatformIn(state, 'vinted').state;
    state = togglePlatformIn(state, 'vinted').state;

    expect(state.workingId).toBe('ebay');
  });

  it('meldet beim Abwaehlen nie eine Zuschnittquelle', () => {
    const first = togglePlatformIn(empty, 'ebay').state;

    expect(togglePlatformIn(first, 'ebay').inheritFrom).toBeNull();
  });
});

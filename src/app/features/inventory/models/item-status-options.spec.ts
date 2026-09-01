import { describe, expect, it } from 'vitest';
import { editableItemStatusOptions } from './item-status-options';

describe('editableItemStatusOptions', () => {
  it('enthält jeden veränderbaren Artikelstatus genau einmal', () => {
    expect(editableItemStatusOptions.map((option) => option.value)).toEqual([
      'received',
      'needs_review',
      'researched',
      'ready',
      'listed',
      'reserved',
      'returned',
      'archived',
      'defective',
    ]);
    expect(editableItemStatusOptions.find((option) => option.value === 'needs_review')?.label).toBe(
      'Prüfung nötig',
    );
    expect(editableItemStatusOptions.find((option) => option.value === 'researched')?.label).toBe(
      'Recherchiert',
    );
  });
});

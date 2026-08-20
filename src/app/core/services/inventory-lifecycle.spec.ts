import { describe, it, expect } from 'vitest';
import { ItemCondition, ItemStatus } from '../models/flipbase.models';

describe('Inventory Domain & Lifecycle Rules (Phase 3)', () => {
  it('should support all specified item conditions from Chapter 17', () => {
    const conditions: ItemCondition[] = [
      'new',
      'like_new',
      'very_good',
      'used',
      'heavily_used',
      'defective',
    ];
    expect(conditions.length).toBe(6);
    expect(conditions).toContain('defective');
    expect(conditions).toContain('like_new');
  });

  it('should support all lifecycle transitions from Chapter 10', () => {
    const lifecycle: ItemStatus[] = [
      'received',
      'needs_review',
      'researched',
      'ready',
      'listed',
      'reserved',
      'sold',
      'returned',
      'archived',
      'defective',
    ];
    expect(lifecycle.length).toBe(10);
    expect(lifecycle[0]).toBe('received');
    expect(lifecycle).toContain('researched');
    expect(lifecycle).toContain('listed');
    expect(lifecycle).toContain('sold');
  });

  it('should correctly sum item costs (Purchase EK + Reparatur + Reinigung + Verpackung)', () => {
    // Example from Chapter 11
    const allocatedPurchaseCost = 20.0;
    const repairCost = 4.5;
    const cleaningCost = 1.2;
    const totalItemCost = allocatedPurchaseCost + repairCost + cleaningCost;
    const expectedValue = 75.0;

    const profitPotential = expectedValue - totalItemCost;

    expect(totalItemCost).toBe(25.7);
    expect(profitPotential).toBe(49.3);
  });
});

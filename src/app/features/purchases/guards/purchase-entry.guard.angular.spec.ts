import { describe, expect, it, vi } from 'vitest';
import { canLeavePurchaseEntry } from './purchase-entry.guard';

describe('canLeavePurchaseEntry', () => {
  it('allows a pristine page without prompting', () => {
    const confirm = vi.fn();
    expect(canLeavePurchaseEntry({ hasUnsavedChanges: () => false }, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps edits when leaving is cancelled', () => {
    expect(canLeavePurchaseEntry({ hasUnsavedChanges: () => true }, () => false)).toBe(false);
  });

  it('allows abandoning edits after confirmation', () => {
    expect(canLeavePurchaseEntry({ hasUnsavedChanges: () => true }, () => true)).toBe(true);
  });
});

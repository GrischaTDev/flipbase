import { describe, expect, it, vi } from 'vitest';
import { canLeavePurchaseEntry } from './purchase-entry.guard';

describe('canLeavePurchaseEntry', () => {
  it('allows a pristine page without prompting', () => {
    const confirm = vi.fn();
    expect(
      canLeavePurchaseEntry({ hasUnsavedChanges: () => false, isSaving: () => false }, confirm),
    ).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps edits when leaving is cancelled', () => {
    expect(
      canLeavePurchaseEntry({ hasUnsavedChanges: () => true, isSaving: () => false }, () => false),
    ).toBe(false);
  });

  it('allows abandoning edits after confirmation', () => {
    expect(
      canLeavePurchaseEntry({ hasUnsavedChanges: () => true, isSaving: () => false }, () => true),
    ).toBe(true);
  });

  it('blocks navigation during persistence without offering confirmation', () => {
    const confirm = vi.fn(() => true);
    expect(
      canLeavePurchaseEntry({ hasUnsavedChanges: () => true, isSaving: () => true }, confirm),
    ).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
});

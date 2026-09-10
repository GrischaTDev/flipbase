import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseEditComponent } from './purchase-edit.component';

describe('PurchaseEditComponent', () => {
  it('delegates save state and returns to the edited purchase', () => {
    const onSubmit = vi.fn();
    const navigate = vi.fn();
    const component = Object.create(PurchaseEditComponent.prototype) as PurchaseEditComponent;
    Object.assign(component, {
      id: signal('purchase-1'),
      entryForm: () => ({
        hasUnsavedChanges: () => true,
        isSaving: () => false,
        canSaveDraft: () => true,
        onSubmit,
      }),
      router: { navigate },
    });

    expect(component.hasUnsavedChanges()).toBe(true);
    expect(component.isSaving()).toBe(false);
    expect(component.canSaveDraft()).toBe(true);

    component.saveDraft();
    component.returnToPurchase();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/purchases', 'purchase-1']);
  });
});

import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseCreateComponent } from './purchase-create.component';

describe('PurchaseCreateComponent', () => {
  it('delegates unsaved navigation state to the shared form', () => {
    const onSubmit = vi.fn();
    const component = Object.create(PurchaseCreateComponent.prototype) as PurchaseCreateComponent;
    Object.assign(component, {
      entryForm: () => ({
        hasUnsavedChanges: () => true,
        isSaving: () => false,
        canSaveDraft: () => true,
        onSubmit,
      }),
    });
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(component.isSaving()).toBe(false);
    expect(component.canSaveDraft()).toBe(true);

    component.saveDraft();

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('öffnet nach dem Anlegen direkt den neuen Einkauf', () => {
    const navigate = vi.fn();
    const component = Object.create(PurchaseCreateComponent.prototype) as PurchaseCreateComponent;
    Object.assign(component, { router: { navigate } });

    component.openPurchase('purchase-42');

    expect(navigate).toHaveBeenCalledWith(['/purchases', 'purchase-42']);
  });
});

import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { PurchaseCreateComponent } from './purchase-create.component';

describe('PurchaseCreateComponent', () => {
  it('delegates unsaved navigation state to the shared form', () => {
    const component = Object.create(PurchaseCreateComponent.prototype) as PurchaseCreateComponent;
    Object.assign(component, {
      entryForm: () => ({ hasUnsavedChanges: () => true, isSaving: () => false }),
    });
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(component.isSaving()).toBe(false);
  });
});

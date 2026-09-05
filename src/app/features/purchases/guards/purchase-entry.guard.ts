import { CanDeactivateFn } from '@angular/router';

export interface PurchaseEntryNavigationState {
  hasUnsavedChanges(): boolean;
  isSaving(): boolean;
}

export function canLeavePurchaseEntry(
  component: PurchaseEntryNavigationState,
  confirmLeave: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  if (component.isSaving()) return false;
  return (
    !component.hasUnsavedChanges() ||
    confirmLeave('Ungespeicherte Änderungen verwerfen und Seite verlassen?')
  );
}

export const purchaseEntryGuard: CanDeactivateFn<PurchaseEntryNavigationState> = (component) =>
  canLeavePurchaseEntry(component);

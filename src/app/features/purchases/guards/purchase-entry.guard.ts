import { CanDeactivateFn } from '@angular/router';

export interface PurchaseEntryNavigationState {
  hasUnsavedChanges(): boolean;
}

export function canLeavePurchaseEntry(
  component: PurchaseEntryNavigationState,
  confirmLeave: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  return (
    !component.hasUnsavedChanges() ||
    confirmLeave('Ungespeicherte Änderungen verwerfen und Seite verlassen?')
  );
}

export const purchaseEntryGuard: CanDeactivateFn<PurchaseEntryNavigationState> = (component) =>
  canLeavePurchaseEntry(component);

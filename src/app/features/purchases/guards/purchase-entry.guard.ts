import { CanDeactivateFn } from '@angular/router';
import { canLeaveUnsavedEntry, UnsavedEntryPage } from '../../../shared/guards/unsaved-entry.guard';

export type PurchaseEntryNavigationState = UnsavedEntryPage;

export function canLeavePurchaseEntry(
  component: PurchaseEntryNavigationState,
  confirmLeave: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  return canLeaveUnsavedEntry(component, confirmLeave);
}

export const purchaseEntryGuard: CanDeactivateFn<PurchaseEntryNavigationState> = (component) =>
  canLeavePurchaseEntry(component);

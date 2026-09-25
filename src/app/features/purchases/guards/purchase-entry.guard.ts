import { CanDeactivateFn } from '@angular/router';
import { canLeaveUnsavedEntry, UnsavedEntryPage } from '../../../shared/guards/unsaved-entry.guard';

export type PurchaseEntryNavigationState = UnsavedEntryPage & {
  isReloadingAfterSave?(): boolean;
};

export function canLeavePurchaseEntry(
  component: PurchaseEntryNavigationState,
  confirmLeave: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  if (component.isReloadingAfterSave?.() && !component.hasUnsavedChanges()) return true;
  return canLeaveUnsavedEntry(component, confirmLeave);
}

export const purchaseEntryGuard: CanDeactivateFn<PurchaseEntryNavigationState> = (component) =>
  canLeavePurchaseEntry(component);

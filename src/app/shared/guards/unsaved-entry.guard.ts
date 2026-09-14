import { CanDeactivateFn } from '@angular/router';

export interface UnsavedEntryPage {
  hasUnsavedChanges(): boolean;
  isSaving(): boolean;
}

export function canLeaveUnsavedEntry(
  component: UnsavedEntryPage,
  confirmLeave: (message: string) => boolean = (message) => globalThis.confirm(message),
): boolean {
  if (typeof component?.isSaving === 'function' && component.isSaving()) return false;
  const hasChanges =
    typeof component?.hasUnsavedChanges === 'function' ? component.hasUnsavedChanges() : false;
  return (
    !hasChanges ||
    confirmLeave('Möchtest du die Seite verlassen? Nicht gespeicherte Eingaben gehen verloren.')
  );
}

export const unsavedEntryGuard: CanDeactivateFn<UnsavedEntryPage> = (component) =>
  canLeaveUnsavedEntry(component);

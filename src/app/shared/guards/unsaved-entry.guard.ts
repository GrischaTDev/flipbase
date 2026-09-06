import { CanDeactivateFn } from '@angular/router';

export interface UnsavedEntryPage {
  hasUnsavedChanges(): boolean;
  isSaving(): boolean;
}

export function canLeaveUnsavedEntry(
  component: UnsavedEntryPage,
  confirmLeave: (message: string) => boolean = (message) => globalThis.confirm(message),
): boolean {
  if (component.isSaving()) return false;
  return (
    !component.hasUnsavedChanges() ||
    confirmLeave('Möchtest du die Seite verlassen? Nicht gespeicherte Eingaben gehen verloren.')
  );
}

export const unsavedEntryGuard: CanDeactivateFn<UnsavedEntryPage> = (component) =>
  canLeaveUnsavedEntry(component);

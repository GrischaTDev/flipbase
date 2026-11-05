import { inject } from '@angular/core';
import { CanDeactivateFn, ChildrenOutletContexts } from '@angular/router';
import { ConfirmDialogService } from '../components/confirm-dialog/confirm-dialog.service';

export interface UnsavedEntryPage {
  hasUnsavedChanges(): boolean;
  isSaving(): boolean;
  canNavigateTo?(url: string): boolean;
}
export function hasOpenEntry(contexts: ChildrenOutletContexts | null): boolean {
  let current = contexts;
  while (current) {
    const context = current.getContext('primary');
    if (!context) break;
    const component = context.outlet?.isActivated
      ? (context.outlet.component as Partial<UnsavedEntryPage>)
      : null;
    if (typeof component?.hasUnsavedChanges === 'function' && component.hasUnsavedChanges())
      return true;
    if (typeof component?.isSaving === 'function' && component.isSaving()) return true;
    current = context.children;
  }
  return false;
}

export function canLeaveUnsavedEntry(
  component: UnsavedEntryPage,
  confirmLeave: (message: string) => boolean | Promise<boolean> = (message) =>
    globalThis.confirm(message),
  nextUrl?: string,
): boolean | Promise<boolean> {
  if (typeof component?.isSaving === 'function' && component.isSaving()) return false;
  if (nextUrl && component.canNavigateTo?.(nextUrl)) return true;
  const hasChanges =
    typeof component?.hasUnsavedChanges === 'function' ? component.hasUnsavedChanges() : false;
  return (
    !hasChanges ||
    confirmLeave('Möchtest du die Seite verlassen? Nicht gespeicherte Eingaben gehen verloren.')
  );
}

export const unsavedEntryGuard: CanDeactivateFn<UnsavedEntryPage> = (
  component,
  _currentRoute,
  _currentState,
  nextState,
) => {
  // Innerhalb der App fragt der eigene Dialog; nur Neuladen und Tab schließen bleiben beim Browser.
  const dialog = inject(ConfirmDialogService);
  return canLeaveUnsavedEntry(
    component,
    () =>
      dialog.frage({
        titel: 'Seite verlassen?',
        text: 'Deine nicht gespeicherten Eingaben gehen verloren.',
        bestaetigenText: 'Seite verlassen',
        abbrechenText: 'Weiter bearbeiten',
      }),
    nextState?.url,
  );
};

import { CanDeactivateFn, ChildrenOutletContexts } from '@angular/router';

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
  confirmLeave: (message: string) => boolean = (message) => globalThis.confirm(message),
  nextUrl?: string,
): boolean {
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
) => canLeaveUnsavedEntry(component, undefined, nextState?.url);

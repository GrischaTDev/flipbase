import type { CanDeactivateFn } from '@angular/router';

export const ebayUnsavedChangesGuard: CanDeactivateFn<{
  canLeave(): boolean | Promise<boolean>;
}> = (component) => component.canLeave();

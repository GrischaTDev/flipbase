import type { CanDeactivateFn } from '@angular/router';
import type { VintedListingEditorComponent } from '../components/vinted-listing-editor/vinted-listing-editor.component';

export const vintedListingEditorGuard: CanDeactivateFn<VintedListingEditorComponent> = (
  component,
) => component.canLeave();

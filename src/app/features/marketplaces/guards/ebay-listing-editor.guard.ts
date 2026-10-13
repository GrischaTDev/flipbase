import type { CanDeactivateFn } from '@angular/router';
import type { EbayListingEditorComponent } from '../components/ebay-listing-editor/ebay-listing-editor.component';

export const ebayListingEditorGuard: CanDeactivateFn<EbayListingEditorComponent> = (component) =>
  component.canLeave();

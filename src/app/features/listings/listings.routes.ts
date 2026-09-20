import type { Routes } from '@angular/router';
import { unsavedEntryGuard } from '../../shared/guards/unsaved-entry.guard';

export const LISTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/listing-overview/listing-overview.component').then(
        (component) => component.ListingOverviewComponent,
      ),
  },
  {
    path: 'new',
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/listing-editor/listing-editor.component').then(
        (component) => component.ListingEditorComponent,
      ),
  },
  {
    path: ':id',
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/listing-editor/listing-editor.component').then(
        (component) => component.ListingEditorComponent,
      ),
  },
];

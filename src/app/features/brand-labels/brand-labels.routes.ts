import type { Routes } from '@angular/router';

/** Erst nach Datenbank-/Storage-Abnahme an die App-Navigation anbinden. */
export const brandLabelRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/label-library/label-library.component').then(
        (module) => module.LabelLibraryComponent,
      ),
  },
  {
    path: ':brand/:label',
    loadComponent: () =>
      import('./pages/label-detail/label-detail.component').then(
        (module) => module.LabelDetailComponent,
      ),
  },
];

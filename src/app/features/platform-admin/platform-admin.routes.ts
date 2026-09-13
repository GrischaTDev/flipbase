import { Routes } from '@angular/router';
import { unsavedEntryGuard } from '../../shared/guards/unsaved-entry.guard';

// Die Unterseiten stehen in der Seitenleiste (core/config/platform-admin-navigation.ts);
// eine eigene Huelle mit Reiterleiste gibt es nicht mehr.
export const platformAdminRoutes: Routes = [
  { path: '', redirectTo: 'applications', pathMatch: 'full' },
  {
    path: 'applications',
    loadComponent: () =>
      import('./pages/beta-applications/beta-applications.component').then(
        (m) => m.BetaApplicationsComponent,
      ),
  },
  {
    path: 'categories',
    loadComponent: () =>
      import('./pages/vinted-categories/vinted-categories.component').then(
        (m) => m.VintedCategoriesComponent,
      ),
  },
  {
    path: 'queries',
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/sniper-queries/sniper-queries.component').then(
        (m) => m.SniperQueriesComponent,
      ),
  },
  {
    path: 'operation',
    loadComponent: () =>
      import('./pages/sniper-operation/sniper-operation.component').then(
        (m) => m.SniperOperationComponent,
      ),
  },
];

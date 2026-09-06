import { Routes } from '@angular/router';

export const platformAdminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./platform-admin-shell/platform-admin-shell.component').then(
        (m) => m.PlatformAdminShellComponent,
      ),
    children: [
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
    ],
  },
];

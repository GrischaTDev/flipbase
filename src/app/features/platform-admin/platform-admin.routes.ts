import { Routes } from '@angular/router';

// Die Unterseiten der Administration stehen in der Seitenleiste
// (core/config/platform-admin-navigation.ts) und ersetzen dort das Hauptmenü.
export const platformAdminRoutes: Routes = [
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  {
    path: 'overview',
    loadComponent: () =>
      import('./pages/platform-overview/platform-overview.component').then(
        (m) => m.PlatformOverviewComponent,
      ),
  },
  {
    path: 'system',
    loadComponent: () =>
      import('./pages/platform-system/platform-system.component').then(
        (m) => m.PlatformSystemComponent,
      ),
  },
  {
    path: 'system/:area',
    loadComponent: () =>
      import('./pages/platform-error-log/platform-error-log.component').then(
        (m) => m.PlatformErrorLogComponent,
      ),
  },
  {
    path: 'vinted-catalog',
    loadComponent: () =>
      import('./pages/vinted-listing-catalog/vinted-listing-catalog.component').then(
        (m) => m.VintedListingCatalogComponent,
      ),
  },
  {
    path: 'server-storage',
    loadComponent: () =>
      import('./pages/server-storage/server-storage.component').then(
        (component) => component.ServerStorageComponent,
      ),
  },
  {
    path: 'applications',
    loadComponent: () =>
      import('./pages/beta-applications/beta-applications.component').then(
        (m) => m.BetaApplicationsComponent,
      ),
  },
  {
    path: 'users',
    loadComponent: () =>
      import('./pages/platform-users/platform-users.component').then(
        (m) => m.PlatformUsersComponent,
      ),
  },
  {
    path: 'users/:userId',
    loadComponent: () =>
      import('./pages/platform-user-usage/platform-user-usage.component').then(
        (m) => m.PlatformUserUsageComponent,
      ),
  },
  // Frühere Adressen der zentralen Bot-Verwaltung führen zum Systemzustand.
  { path: 'vinted-bot', redirectTo: '/admin/system', pathMatch: 'full' },
  { path: 'vinted-bot/:page', redirectTo: '/admin/system', pathMatch: 'full' },
  { path: 'queries', redirectTo: '/admin/system', pathMatch: 'full' },
  { path: 'operation', redirectTo: '/admin/system', pathMatch: 'full' },
  { path: 'categories', redirectTo: '/admin/system', pathMatch: 'full' },
];

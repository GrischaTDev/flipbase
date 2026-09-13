import { Routes } from '@angular/router';
import { unsavedEntryGuard } from '../../shared/guards/unsaved-entry.guard';

// Die Unterseiten der Administration stehen in der Seitenleiste
// (core/config/platform-admin-navigation.ts). Die Bot-Seiten sind unter
// "vinted-bot" gebuendelt und haben dort ihr eigenes Seitenmenue.
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
    path: 'vinted-bot',
    loadComponent: () =>
      import('./vinted-bot-shell/vinted-bot-shell.component').then(
        (m) => m.VintedBotShellComponent,
      ),
    children: [
      { path: '', redirectTo: 'queries', pathMatch: 'full' },
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
      {
        path: 'categories',
        loadComponent: () =>
          import('./pages/vinted-categories/vinted-categories.component').then(
            (m) => m.VintedCategoriesComponent,
          ),
      },
    ],
  },
  // Fruehere Adressen, damit Lesezeichen und alte Links weiter funktionieren.
  { path: 'queries', redirectTo: 'vinted-bot/queries', pathMatch: 'full' },
  { path: 'operation', redirectTo: 'vinted-bot/operation', pathMatch: 'full' },
  { path: 'categories', redirectTo: 'vinted-bot/categories', pathMatch: 'full' },
];

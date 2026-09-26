import type { Routes } from '@angular/router';
import { marketplaceAccessGuard } from './guards/marketplace-access.guard';

export const MARKETPLACES_ROUTES: Routes = [
  { path: '', redirectTo: 'vinted', pathMatch: 'full' },
  {
    path: 'vinted',
    canActivate: [marketplaceAccessGuard],
    loadComponent: () =>
      import('./vinted-workspace.component').then((m) => m.VintedWorkspaceComponent),
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      ...['overview', 'listings', 'messages', 'sales', 'profile', 'activity'].map((section) => ({
        path: section,
        data: { section },
        loadComponent: () =>
          import('./components/vinted-account-content/vinted-account-content.component').then(
            (m) => m.VintedAccountContentComponent,
          ),
      })),
      { path: '**', redirectTo: 'overview' },
    ],
  },
];

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
      {
        path: 'connect/:connectionId',
        loadComponent: () =>
          import('./components/marketplace-connect/marketplace-connect.component').then(
            (m) => m.MarketplaceConnectComponent,
          ),
      },
      {
        path: 'session-test',
        loadComponent: () =>
          import('./components/marketplace-session-test/marketplace-session-test.component').then(
            (m) => m.MarketplaceSessionTestComponent,
          ),
      },
      {
        path: 'listings/:connectionId/:entryId',
        loadComponent: () =>
          import('./components/vinted-listing-detail/vinted-listing-detail.component').then(
            (m) => m.VintedListingDetailComponent,
          ),
      },
      ...['overview', 'listings', 'messages', 'sales', 'profile', 'feedback', 'activity'].map(
        (section) => ({
          path: section,
          data: { section },
          loadComponent: () =>
            import('./components/vinted-account-content/vinted-account-content.component').then(
              (m) => m.VintedAccountContentComponent,
            ),
        }),
      ),
      { path: '**', redirectTo: 'overview' },
    ],
  },
];

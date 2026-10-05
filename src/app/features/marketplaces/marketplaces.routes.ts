import type { Routes } from '@angular/router';
import { marketplaceAccessGuard } from './guards/marketplace-access.guard';

export const MARKETPLACES_ROUTES: Routes = [
  { path: '', redirectTo: 'vinted', pathMatch: 'full' },
  {
    path: 'ebay',
    data: { showData: true },
    loadComponent: () =>
      import('./components/ebay-account/ebay-account.component').then(
        (m) => m.EbayAccountComponent,
      ),
  },
  {
    path: 'vinted',
    canActivate: [marketplaceAccessGuard],
    loadComponent: () =>
      import('./vinted-workspace.component').then((m) => m.VintedWorkspaceComponent),
    children: [
      {
        path: 'favorite-messages',
        loadComponent: () =>
          import('./components/vinted-favorite-messages/vinted-favorite-messages.component').then(
            (module) => module.VintedFavoriteMessagesComponent,
          ),
      },
      { path: '', redirectTo: 'accounts', pathMatch: 'full' },
      {
        path: 'setup',
        loadComponent: () =>
          import('./components/vinted-setup/vinted-setup.component').then(
            (module) => module.VintedSetupComponent,
          ),
      },
      {
        path: 'manage',
        loadComponent: () =>
          import('./components/marketplace-accounts/marketplace-accounts.component').then(
            (module) => module.MarketplaceAccountsComponent,
          ),
      },
      {
        path: 'accounts',
        loadComponent: () =>
          import('./components/vinted-account-grid/vinted-account-grid.component').then(
            (m) => m.VintedAccountGridComponent,
          ),
      },
      {
        path: 'local-connect/:connectionId',
        loadComponent: () =>
          import('./components/vinted-local-connect/vinted-local-connect.component').then(
            (module) => module.VintedLocalConnectComponent,
          ),
      },
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
      { path: 'feedback', redirectTo: '/marketplaces/vinted/profile#reviews', pathMatch: 'full' },
      ...['overview', 'listings', 'messages', 'sales', 'profile', 'activity'].map((section) => ({
        path: section,
        data: { section },
        loadComponent: () =>
          import('./components/vinted-account-content/vinted-account-content.component').then(
            (m) => m.VintedAccountContentComponent,
          ),
      })),
      { path: '**', redirectTo: 'accounts' },
    ],
  },
];

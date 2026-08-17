import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell/shell.component';
import { StoreLayoutComponent } from './features/store/store-layout/store-layout.component';

export const routes: Routes = [
  // Public Customer Storefront Routes
  {
    path: 'shop',
    component: StoreLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/store/pages/store-catalog/store-catalog.component').then(
            (m) => m.StoreCatalogComponent
          ),
      },
      {
        path: 'item/:id',
        loadComponent: () =>
          import('./features/store/pages/store-item-detail/store-item-detail.component').then(
            (m) => m.StoreItemDetailComponent
          ),
      },
      {
        path: 'checkout',
        loadComponent: () =>
          import('./features/store/pages/store-checkout/store-checkout.component').then(
            (m) => m.StoreCheckoutComponent
          ),
      },
      {
        path: 'order-success/:orderId',
        loadComponent: () =>
          import('./features/store/pages/store-order-success/store-order-success.component').then(
            (m) => m.StoreOrderSuccessComponent
          ),
      },
    ],
  },

  // Auth Routes
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full',
      },
    ],
  },

  // Protected Admin OS Dashboard & Workspace
  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'purchases',
        loadComponent: () =>
          import('./features/purchases/purchases.component').then((m) => m.PurchasesComponent),
      },
      {
        path: 'purchases/:id',
        loadComponent: () =>
          import('./features/purchases/pages/purchase-detail/purchase-detail.component').then(
            (m) => m.PurchaseDetailComponent
          ),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./features/inventory/inventory.component').then((m) => m.InventoryComponent),
      },
      {
        path: 'inventory/:id',
        loadComponent: () =>
          import('./features/inventory/pages/item-detail/item-detail.component').then(
            (m) => m.ItemDetailComponent
          ),
      },
      {
        path: 'research',
        loadComponent: () =>
          import('./features/research/research.component').then((m) => m.ResearchComponent),
      },
      {
        path: 'deal-calculator',
        loadComponent: () =>
          import('./features/deal-calculator/deal-calculator.component').then(
            (m) => m.DealCalculatorComponent
          ),
      },
      {
        path: 'listings',
        loadComponent: () =>
          import('./features/listings/listings.component').then((m) => m.ListingsComponent),
      },
      {
        path: 'sales',
        loadComponent: () =>
          import('./features/sales/sales.component').then((m) => m.SalesComponent),
      },
      {
        path: 'sources',
        loadComponent: () =>
          import('./features/sources/sources.component').then((m) => m.SourcesComponent),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/analytics/analytics.component').then((m) => m.AnalyticsComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];

import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell/shell.component';

export const routes: Routes = [
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

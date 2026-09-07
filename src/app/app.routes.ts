import { Routes } from '@angular/router';
import { unsavedEntryGuard } from './shared/guards/unsaved-entry.guard';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { operatorGuard } from './core/guards/operator.guard';

export const routes: Routes = [
  // Kundenansicht des Shops.
  //
  // Bewusst hinter der Anmeldung, obwohl es eine Ladenfront ist: Zahlungen sind
  // derzeit vorgetaeuscht (jede Zahlung meldet Erfolg, ohne dass Geld fliesst),
  // und Impressum, USt-IdNr. und Rechtstexte sind Platzhalter. Oeffentlich
  // erreichbar waere das ein geschaeftsmaessiger Auftritt mit erfundenen
  // Pflichtangaben. Der Shop zieht spaeter auf eine eigene Domain um; bis dahin
  // sieht ihn nur, wer angemeldet ist.
  {
    path: 'shop',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/store/store-layout/store-layout.component').then(
        (m) => m.StoreLayoutComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/store/pages/store-catalog/store-catalog.component').then(
            (m) => m.StoreCatalogComponent,
          ),
      },
      {
        path: 'item/:id',
        loadComponent: () =>
          import('./features/store/pages/store-item-detail/store-item-detail.component').then(
            (m) => m.StoreItemDetailComponent,
          ),
      },
      {
        path: 'checkout',
        loadComponent: () =>
          import('./features/store/pages/store-checkout/store-checkout.component').then(
            (m) => m.StoreCheckoutComponent,
          ),
      },
      {
        path: 'order-success/:orderId',
        loadComponent: () =>
          import('./features/store/pages/store-order-success/store-order-success.component').then(
            (m) => m.StoreOrderSuccessComponent,
          ),
      },
    ],
  },

  // Auth Routes – fuer bereits angemeldete Nutzer gesperrt
  {
    path: 'auth',
    canActivate: [guestGuard],
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
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
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
        path: 'purchases/new',
        canDeactivate: [unsavedEntryGuard],
        loadComponent: () =>
          import('./features/purchases/pages/purchase-create/purchase-create.component').then(
            (m) => m.PurchaseCreateComponent,
          ),
      },
      {
        path: 'purchases/:id/edit',
        canDeactivate: [unsavedEntryGuard],
        loadComponent: () =>
          import('./features/purchases/pages/purchase-edit/purchase-edit.component').then(
            (m) => m.PurchaseEditComponent,
          ),
      },
      {
        path: 'purchases/:id',
        loadComponent: () =>
          import('./features/purchases/pages/purchase-detail/purchase-detail.component').then(
            (m) => m.PurchaseDetailComponent,
          ),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./features/inventory/inventory.component').then((m) => m.InventoryComponent),
      },
      {
        path: 'inventory/new',
        canDeactivate: [unsavedEntryGuard],
        loadComponent: () =>
          import('./features/inventory/pages/item-create/item-create.component').then(
            (m) => m.ItemCreateComponent,
          ),
      },
      {
        path: 'inventory/:id',
        loadComponent: () =>
          import('./features/inventory/pages/item-detail/item-detail.component').then(
            (m) => m.ItemDetailComponent,
          ),
      },
      {
        path: 'catalog',
        loadComponent: () =>
          import('./features/catalog/catalog.component').then((m) => m.CatalogComponent),
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
            (m) => m.DealCalculatorComponent,
          ),
      },
      {
        path: 'listings',
        loadComponent: () =>
          import('./features/listings/listings.component').then((m) => m.ListingsComponent),
      },
      {
        path: 'image-optimizer',
        loadComponent: () =>
          import('./features/image-optimizer/image-optimizer.component').then(
            (m) => m.ImageOptimizerComponent,
          ),
      },
      {
        path: 'sales/new',
        canDeactivate: [unsavedEntryGuard],
        loadComponent: () =>
          import('./features/sales/pages/sale-create/sale-create.component').then(
            (m) => m.SaleCreateComponent,
          ),
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
        path: 'accounting',
        loadComponent: () =>
          import('./features/accounting/accounting.component').then((m) => m.AccountingComponent),
      },
      {
        path: 'fulfillment',
        loadComponent: () =>
          import('./features/fulfillment/fulfillment.component').then(
            (m) => m.FulfillmentComponent,
          ),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
      },
      // Betreiberbereich fuer die Beta-Bewerbungen.
      //
      // Bewusst innerhalb der Shell: Der Menuepunkt steht in der Seitenleiste,
      // und eine Seite ohne Seitenleiste liesse den Betreiber ohne Weg zurueck
      // stehen. Der spaetere Umzug in eine eigene Anwendung bleibt trotzdem ein
      // Verschieben - der Bereich selbst haengt an nichts aus der Shell, er
      // importiert nur aus core/ und shared/.
      {
        path: 'admin',
        canActivate: [operatorGuard],
        loadChildren: () =>
          import('./features/platform-admin/platform-admin.routes').then(
            (m) => m.platformAdminRoutes,
          ),
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

import { Routes } from '@angular/router';
import { unsavedEntryGuard } from '../../shared/guards/unsaved-entry.guard';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./settings-shell/settings-shell.component').then((m) => m.SettingsShellComponent),
    children: [
      { path: '', redirectTo: 'account', pathMatch: 'full' },
      {
        path: 'account',
        loadComponent: () =>
          import('./pages/account-settings/account-settings.component').then(
            (m) => m.AccountSettingsComponent,
          ),
      },
      {
        path: 'workspace',
        loadComponent: () =>
          import('./pages/workspace-settings/workspace-settings.component').then(
            (m) => m.WorkspaceSettingsComponent,
          ),
      },
      {
        path: 'numbering',
        canDeactivate: [unsavedEntryGuard],
        loadComponent: () =>
          import('./pages/numbering-settings/numbering-settings.component').then(
            (m) => m.NumberingSettingsComponent,
          ),
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./pages/team-settings/team-settings.component').then(
            (m) => m.TeamSettingsComponent,
          ),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./pages/notification-settings/notification-settings.component').then(
            (m) => m.NotificationSettingsComponent,
          ),
      },
      {
        path: 'store',
        loadComponent: () =>
          import('./pages/store-settings/store-settings.component').then(
            (m) => m.StoreSettingsComponent,
          ),
      },
      {
        path: 'shipping',
        loadComponent: () =>
          import('./pages/shipping-settings/shipping-settings.component').then(
            (m) => m.ShippingSettingsComponent,
          ),
      },
      {
        path: 'app',
        loadComponent: () =>
          import('./pages/app-settings/app-settings.component').then((m) => m.AppSettingsComponent),
      },
      {
        path: 'data',
        loadComponent: () =>
          import('./pages/data-and-audit/data-and-audit.component').then(
            (m) => m.DataAndAuditComponent,
          ),
      },
      {
        path: 'data/print',
        loadComponent: () =>
          import('./pages/audit-print/audit-print.component').then((m) => m.AuditPrintComponent),
      },
      { path: '**', redirectTo: 'account' },
    ],
  },
];

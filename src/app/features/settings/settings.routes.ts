import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./settings-shell/settings-shell.component').then((m) => m.SettingsShellComponent),
    children: [
      { path: '', redirectTo: 'account', pathMatch: 'full' },
      {
        path: 'account',
        loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
        data: { section: 'account' },
      },
      {
        path: 'workspace',
        loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
        data: { section: 'workspace' },
      },
      {
        path: 'team',
        loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
        data: { section: 'team' },
      },
      {
        path: 'notifications',
        loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
        data: { section: 'notifications' },
      },
      {
        path: 'store',
        loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
        data: { section: 'store' },
      },
      {
        path: 'shipping',
        loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
        data: { section: 'shipping' },
      },
      {
        path: 'app',
        loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
        data: { section: 'app' },
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

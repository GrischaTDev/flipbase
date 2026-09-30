import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { SETTINGS_ROUTES } from './settings.routes';

describe('SETTINGS_ROUTES', () => {
  it('hält alle Einstellungsbereiche unter einer gemeinsamen Shell und leitet sicher um', () => {
    expect(SETTINGS_ROUTES).toHaveLength(1);
    const shell = SETTINGS_ROUTES[0];

    expect(shell.path).toBe('');
    expect(shell.loadComponent).toBeTypeOf('function');
    expect(shell.children?.map((route) => route.path)).toEqual([
      '',
      'account',
      'company',
      'workspace',
      'numbering',
      'team',
      'marketplaces',
      'notifications',
      'store',
      'shipping',
      'app',
      'data',
      'data/print',
      '**',
    ]);
    expect(shell.children?.[0]).toMatchObject({ redirectTo: 'account', pathMatch: 'full' });
    expect(shell.children?.at(-1)).toMatchObject({ redirectTo: 'account' });
  });

  it('lädt jeden Inhalt verzögert und behält die Druckansicht im Settings-Baum', () => {
    const children = SETTINGS_ROUTES[0].children ?? [];
    const contentRoutes = children.filter((route) => route.loadComponent);

    expect(contentRoutes).toHaveLength(12);
    expect(contentRoutes.every((route) => typeof route.loadComponent === 'function')).toBe(true);
    const companyRoute = contentRoutes.find((route) => route.path === 'company');
    expect(companyRoute?.canDeactivate).toHaveLength(1);
    expect(companyRoute?.data?.['workspaceContextLocked']).toBe(false);
    expect(contentRoutes.find((route) => route.path === 'marketplaces')?.canActivate).toHaveLength(
      1,
    );
    expect(contentRoutes.find((route) => route.path === 'data/print')).toBeDefined();
  });
});

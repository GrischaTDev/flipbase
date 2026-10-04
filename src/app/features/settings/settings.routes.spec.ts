import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { SETTINGS_ROUTES } from './settings.routes';
import { MARKETPLACES_ROUTES } from '../marketplaces/marketplaces.routes';
import { marketplaceAccessGuard } from '../marketplaces/guards/marketplace-access.guard';

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

    expect(contentRoutes).toHaveLength(11);
    expect(contentRoutes.every((route) => typeof route.loadComponent === 'function')).toBe(true);
    const companyRoute = contentRoutes.find((route) => route.path === 'company');
    expect(companyRoute?.canDeactivate).toHaveLength(1);
    expect(companyRoute?.data?.['workspaceContextLocked']).toBe(false);
    expect(contentRoutes.find((route) => route.path === 'data/print')).toBeDefined();
  });

  it('leitet die bisherige Kontoverwaltung in den geschützten Vinted-Bereich um', () => {
    const legacyRoute = SETTINGS_ROUTES[0].children?.find((route) => route.path === 'marketplaces');
    expect(legacyRoute).toMatchObject({
      redirectTo: '/marketplaces/vinted/manage',
      pathMatch: 'full',
    });
    expect(legacyRoute?.loadComponent).toBeUndefined();
    const vintedRoute = MARKETPLACES_ROUTES.find((route) => route.path === 'vinted');
    expect(vintedRoute?.canActivate).toContain(marketplaceAccessGuard);
    expect(
      vintedRoute?.children?.find((route) => route.path === 'manage')?.loadComponent,
    ).toBeTypeOf('function');
  });
});

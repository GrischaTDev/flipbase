import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';

describe('Alte Bestandslinks', () => {
  const adminRoutes = routes.find((route) => route.path === '' && route.children)?.children ?? [];

  it('führt die frühere Bestandsliste zum Bestandsfilter der Artikeltabelle', () => {
    expect(adminRoutes.find((route) => route.path === 'inventory')).toMatchObject({
      pathMatch: 'full',
      redirectTo: '/catalog?view=stock',
    });
  });

  it('erhält Einzelstücklinks und führt die alte Neuanlage zum Artikeleditor', () => {
    expect(adminRoutes.find((route) => route.path === 'inventory/:id')?.loadComponent).toBeTypeOf(
      'function',
    );
    expect(adminRoutes.find((route) => route.path === 'inventory/new')?.redirectTo).toBe(
      '/catalog/new',
    );
    expect(adminRoutes.findIndex((route) => route.path === 'inventory/:id')).toBeLessThan(
      adminRoutes.findIndex((route) => route.path === 'inventory'),
    );
  });
});

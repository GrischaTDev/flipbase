import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';

describe('Alte Bestandslinks', () => {
  it.each(['offline', 'offline/purchases'])(
    'führt den alten %s-Link ohne lokale Parameter zu den normalen Einkäufen',
    async (path) => {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      try {
        const route = routes.find((candidate) => candidate.path === path);
        expect(route?.pathMatch).toBe('full');
        expect(route?.loadComponent).toBeUndefined();
        expect(route?.canActivate).toBeUndefined();
        const redirect = route?.redirectTo;
        if (typeof redirect !== 'function') throw new Error('Legacy route needs a safe redirect');
        const target = await TestBed.runInInjectionContext(() =>
          redirect({ queryParams: { deviceDrafts: '1', localDraft: 'old' } } as never),
        );
        expect(TestBed.inject(Router).serializeUrl(target as never)).toBe('/purchases');
      } finally {
        TestBed.resetTestingModule();
      }
    },
  );
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

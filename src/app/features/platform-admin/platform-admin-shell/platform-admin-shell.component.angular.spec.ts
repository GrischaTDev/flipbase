import '@angular/compiler';
import { Component, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PlatformAdminShellComponent } from './platform-admin-shell.component';

class TestPageComponent {}
Component({ selector: 'app-test-page', template: '<p>Testseite</p>' })(TestPageComponent);

// Die Pfade sind bewusst dieselben wie in platform-admin.routes.ts. Die echten
// Seiten stehen hier als Platzhalter, weil dieser Test die Navigation prueft
// und nicht deren Inhalt.
const routes: Routes = [
  {
    path: 'admin',
    component: PlatformAdminShellComponent,
    children: [
      { path: '', redirectTo: 'applications', pathMatch: 'full' },
      { path: 'applications', component: TestPageComponent },
      { path: 'categories', component: TestPageComponent },
    ],
  },
];

describe('PlatformAdminShellComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformAdminShellComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  async function navigateTo(url: string) {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(PlatformAdminShellComponent);
    fixture.detectChanges();
    await router.navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();

    const navigation = fixture.nativeElement.querySelector(
      'nav[aria-label="Bereiche der Administration"]',
    ) as HTMLElement;

    return {
      fixture,
      links: Array.from(navigation.querySelectorAll('a')) as HTMLAnchorElement[],
    };
  }

  // Der eigentliche Befund: Ohne Unternavigation kam man auf die
  // Kategorieliste nur ueber eine von Hand eingetippte Adresse.
  it('verlinkt beide Bereiche der Administration', async () => {
    const { links } = await navigateTo('/admin/applications');

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Bewerbungen',
      'Kategorieliste',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/applications',
      '/admin/categories',
    ]);
  });

  // Beide Richtungen, damit der Test nicht auch dann gruen bliebe, wenn
  // aria-current fest auf einem Punkt stuende.
  it('zeichnet den aktuellen Punkt aus - und nur diesen', async () => {
    const applications = await navigateTo('/admin/applications');

    expect(applications.links[0].getAttribute('aria-current')).toBe('page');
    expect(applications.links[1].getAttribute('aria-current')).toBeNull();

    const categories = await navigateTo('/admin/categories');

    expect(categories.links[1].getAttribute('aria-current')).toBe('page');
    expect(categories.links[0].getAttribute('aria-current')).toBeNull();
  });

  it('hat keine automatisch erkennbaren schwerwiegenden Barrieren', async () => {
    const { fixture } = await navigateTo('/admin/categories');
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
    expect(result.violations.filter((violation) => violation.impact === 'serious')).toEqual([]);
  });
});

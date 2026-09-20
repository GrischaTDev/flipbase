import '@angular/compiler';
import { Component, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
import { PwaService } from '../../core/services/pwa.service';
import { SidebarComponent } from './sidebar.component';

class TestPageComponent {}
Component({ selector: 'app-test-page', template: '' })(TestPageComponent);

// Dieselben Pfade wie platform-admin.routes.ts; die Seiten sind Platzhalter,
// weil hier nur die Navigation geprueft wird.
const routes: Routes = [
  { path: 'dashboard', component: TestPageComponent },
  { path: 'vinted-bot', component: TestPageComponent },
  { path: 'vinted-bot/filters', component: TestPageComponent },
  { path: 'vinted-bot/favorites', component: TestPageComponent },
  {
    path: 'admin',
    children: [
      { path: '', redirectTo: 'applications', pathMatch: 'full' },
      { path: 'applications', component: TestPageComponent },
      { path: 'users', component: TestPageComponent },
      {
        path: 'vinted-bot',
        children: [
          { path: 'queries', component: TestPageComponent },
          { path: 'operation', component: TestPageComponent },
          { path: 'categories', component: TestPageComponent },
        ],
      },
    ],
  },
];

describe('SidebarComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
  });

  afterEach(() => TestBed.resetTestingModule());

  async function renderAt(url: string, operator = true) {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter(routes),
        provideTranslateService({ lang: 'de' }),
        {
          provide: PlatformOperatorService,
          useValue: { operator: signal(operator), isOperator: vi.fn(async () => operator) },
        },
        { provide: PwaService, useValue: { isInstallable: signal(false), promptInstall: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    return {
      element,
      adminLink: element.querySelector<HTMLAnchorElement>('a[href="/admin"]'),
      subLinks: Array.from(element.querySelectorAll<HTMLAnchorElement>('[data-sub-navigation] a')),
    };
  }

  it('zeigt die Unterpunkte der Administration in fester Reihenfolge', async () => {
    const { subLinks } = await renderAt('/admin/applications');

    expect(subLinks.map((link) => link.textContent?.trim())).toEqual([
      'Bewerbungen',
      'Nutzer',
      'Vinted Bot',
    ]);
    expect(subLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/applications',
      '/admin/users',
      '/admin/vinted-bot',
    ]);
  });

  // Beide Richtungen, damit der Test nicht gruen bliebe, wenn aria-current
  // fest auf einem Punkt stuende.
  it('zeichnet nur den aktiven Unterpunkt als aktuelle Seite aus', async () => {
    const applications = await renderAt('/admin/applications');
    expect(applications.subLinks.map((link) => link.getAttribute('aria-current'))).toEqual([
      'page',
      null,
      null,
    ]);
    expect(applications.adminLink?.getAttribute('aria-current')).toBeNull();
    expect(applications.adminLink?.classList.contains('font-semibold')).toBe(true);
    expect(applications.element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    TestBed.resetTestingModule();
    // Tiefer liegende Bot-Seiten gehoeren zum Punkt "Vinted Bot".
    const operation = await renderAt('/admin/vinted-bot/operation');
    expect(operation.subLinks.map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'page',
    ]);
    expect(operation.element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  // Den sichtbaren Namen liefert die Uebersetzung NAV.DEAL_MONITOR; hier ist
  // keine geladen, deshalb wird nur das Ziel geprueft.
  it('fuehrt den frueheren Deal-Monitor unter der neuen Adresse', async () => {
    const { element } = await renderAt('/dashboard');

    expect(element.querySelector('a[href="/vinted-bot"]')).not.toBeNull();
    expect(element.querySelector('a[href="/deal-monitor"]')).toBeNull();
  });

  it('verlinkt das Flipbase-Logo mit dem Dashboard', async () => {
    const { element } = await renderAt('/vinted-bot');
    const brandLink = element.querySelector<HTMLAnchorElement>('a[aria-label="Zum Dashboard"]');

    expect(brandLink?.getAttribute('href')).toBe('/dashboard');
    expect(brandLink?.textContent).toContain('Flipbase');
  });

  it('klappt die Unterpunkte ausserhalb der Administration zu', async () => {
    const { adminLink, subLinks } = await renderAt('/dashboard');

    expect(adminLink).not.toBeNull();
    expect(adminLink?.classList.contains('font-semibold')).toBe(false);
    expect(subLinks).toEqual([]);
  });

  it('klappt die Unterpunkte fuer Vinted-Bot auf und hebt die aktive Seite hervor', async () => {
    const { element, subLinks } = await renderAt('/vinted-bot/filters', false);

    expect(subLinks.map((link) => link.textContent?.trim())).toEqual([
      'Bot',
      'Suchfilter',
      'Favoriten',
    ]);
    expect(subLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/vinted-bot',
      '/vinted-bot/filters',
      '/vinted-bot/favorites',
    ]);
    expect(subLinks.map((link) => link.getAttribute('aria-current'))).toEqual([null, 'page', null]);
    expect(element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('zeigt Nicht-Betreibern weder Administration noch Unterpunkte', async () => {
    const { adminLink, subLinks } = await renderAt('/admin/applications', false);

    expect(adminLink).toBeNull();
    expect(subLinks).toEqual([]);
  });

  it('hat keine automatisch erkennbaren schwerwiegenden Barrieren', async () => {
    const { element } = await renderAt('/admin/vinted-bot/queries');
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });

    expect(
      result.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
});

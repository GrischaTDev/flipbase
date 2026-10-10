import '@angular/compiler';
import { Component, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MarketplaceSettingsService } from '../../core/services/marketplace-settings.service';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
import { prepareMarketplaceRendering } from '../../../../e2e/support/marketplace-rendering';
import { PwaService } from '../../core/services/pwa.service';
import { SidebarComponent } from './sidebar.component';

class TestPageComponent {}
Component({ selector: 'app-test-page', template: '' })(TestPageComponent);

// Dieselben Pfade wie platform-admin.routes.ts; die Seiten sind Platzhalter,
// weil hier nur die Navigation geprueft wird.
const routes: Routes = [
  { path: 'dashboard', component: TestPageComponent },
  { path: 'catalog', component: TestPageComponent },
  { path: 'marketplaces/vinted', component: TestPageComponent },
  { path: 'marketplaces/vinted/:section', component: TestPageComponent },
  { path: 'marketplaces/ebay', component: TestPageComponent },
  { path: 'marketplaces/kleinanzeigen', component: TestPageComponent },
  { path: 'tools/brand-labels', component: TestPageComponent },
  { path: 'tools/brand-labels/sizes', component: TestPageComponent },
  { path: 'deal-calculator', component: TestPageComponent },
  { path: 'deal-calculator/ebay', component: TestPageComponent },
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
    await ɵresolveComponentResources((url) =>
      readFile(
        url.includes('badge.component.')
          ? resolve('src/app/shared/components/badge', url.split('/').at(-1) ?? '')
          : new URL(url, import.meta.url),
        'utf8',
      ),
    );
    await prepareMarketplaceRendering([
      { type: SidebarComponent, path: 'src/app/layout/sidebar/sidebar.component.ts' },
    ]);
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
      fixture,
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
      'Server-Speicher',
      'Referenzbibliothek',
    ]);
    expect(subLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/applications',
      '/admin/users',
      '/admin/vinted-bot',
      '/admin/server-storage',
      '/tools/brand-labels/admin',
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
      null,
      null,
    ]);
    expect(operation.element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('fuehrt den Deal-Rechner und eBay-Gebührenrechner unter Tools', async () => {
    const { element } = await renderAt('/dashboard');

    expect(element.querySelector('a[href="/deal-calculator"]')).not.toBeNull();
    expect(element.querySelector('a[href="/deal-calculator/ebay"]')).not.toBeNull();
    expect(element.querySelector('a[href="/deal-monitor"]')).toBeNull();
  });

  it('verlinkt das Flipbase-Logo mit dem Dashboard', async () => {
    const { element } = await renderAt('/catalog');
    const brandLink = element.querySelector<HTMLAnchorElement>('a[aria-label="Zum Dashboard"]');

    expect(brandLink?.getAttribute('href')).toBe('/dashboard');
    expect(brandLink?.textContent).toContain('Flipbase');
  });

  it('zeigt das groessere Logo ohne Trennlinie und OS-Zusatz', async () => {
    const { element } = await renderAt('/dashboard');
    const brandHeader = element.querySelector('aside > div');
    const logo = brandHeader?.querySelector('img');

    expect(brandHeader?.classList).not.toContain('border-b');
    expect(logo?.getAttribute('width')).toBe('36');
    expect(brandHeader?.textContent).toContain('Flipbase');
    expect(brandHeader?.textContent).not.toContain('OS');
  });

  it('ordnet Ideen und danach Einstellungen und Administration am unteren Rand an', async () => {
    const { element } = await renderAt('/dashboard');
    const navigation = element.querySelector('nav')!;
    const lower = navigation.querySelector('[data-sidebar-lower]')!;
    const divider = lower.querySelector('[data-sidebar-divider]')!;
    const ideas = lower.querySelector('[aria-controls="sidebar-ideas"]')!;
    const settings = divider.querySelector('a[href="/settings"]')!;
    const admin = divider.querySelector('a[href="/admin"]')!;

    expect(navigation.lastElementChild).toBe(lower);
    expect(lower.classList).toContain('mt-auto');
    expect(ideas.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settings.compareDocumentPosition(admin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(element.textContent).not.toContain('Flipbase Core');
  });

  it('klappt die Unterpunkte ausserhalb der Administration zu', async () => {
    const { adminLink, subLinks } = await renderAt('/dashboard');

    expect(adminLink).not.toBeNull();
    expect(adminLink?.classList.contains('font-semibold')).toBe(false);
    expect(subLinks).toEqual([]);
  });

  it('klappt die Unterpunkte für Marken & Größen auf und hebt die aktive Seite hervor', async () => {
    const { element, subLinks } = await renderAt('/tools/brand-labels/sizes', false);

    expect(subLinks.map((link) => link.textContent?.trim())).toEqual([
      'Labels vergleichen',
      'Größen nachschlagen',
    ]);
    expect(subLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/tools/brand-labels',
      '/tools/brand-labels/sizes',
    ]);
    expect(subLinks.map((link) => link.getAttribute('aria-current'))).toEqual([null, 'page']);
    expect(element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('klappt die Unterpunkte fuer Vinted-Bot auf und hebt die aktive Seite hervor', async () => {
    const { element, subLinks } = await renderAt('/vinted-bot/filters', false);

    expect(subLinks.map((link) => link.textContent?.trim())).toEqual([
      'Vinted Feed',
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

  it('blendet deaktivierte Marktplätze dynamisch aus der Navigation aus', async () => {
    const { element, fixture } = await renderAt('/dashboard');
    const settings = TestBed.inject(MarketplaceSettingsService);
    settings.setMarketplaceEnabled('ebay', false);
    settings.setMarketplaceEnabled('kleinanzeigen', false);
    fixture.detectChanges();

    expect(element.querySelector('a[href="/marketplaces/ebay"]')).toBeNull();
    expect(element.querySelector('a[href="/marketplaces/kleinanzeigen"]')).toBeNull();
    expect(element.querySelector('a[href="/marketplaces/vinted"]')).not.toBeNull();
    expect(element.querySelector('a[href="/vinted-bot"]')).not.toBeNull();

    settings.setMarketplaceEnabled('vinted', false);
    fixture.detectChanges();
    expect(element.querySelector('a[href="/marketplaces/vinted"]')).toBeNull();
    expect(element.querySelector('a[href="/vinted-bot"]')).toBeNull();
  });

  it('besitzt eine Pufferzone im Sidebar-Footer gegen den Browser-Link-Tooltip', async () => {
    const { element } = await renderAt('/dashboard');
    const divider = element.querySelector('[data-sidebar-divider]');
    expect(divider?.classList.contains('pb-2')).toBe(true);
  });

  it('zeigt Nicht-Betreibern weder Administration noch Unterpunkte', async () => {
    const { element, adminLink, subLinks } = await renderAt('/admin/applications', false);

    expect(adminLink).toBeNull();
    expect(subLinks).toEqual([]);
    expect(element.querySelector('a[href="/marketplaces/vinted"]')).toBeNull();
    expect(element.querySelector('a[href="/marketplaces/ebay"]')?.textContent).toContain('eBay');
  });

  it('zeigt den Vinted-Pilotbereich Plattformbetreibern', async () => {
    const { element } = await renderAt('/dashboard');
    const vintedLink = element.querySelector('a[href="/marketplaces/vinted"]');
    expect(vintedLink?.querySelector('app-badge')?.textContent?.trim()).toBe('Admin');
  });

  it('rendert eigene Plattform-Logos für die Marktplätze in der Sidebar', async () => {
    const { element } = await renderAt('/dashboard');
    const vintedImg = element.querySelector('a[href="/marketplaces/vinted"] img');
    const ebayImg = element.querySelector('a[href="/marketplaces/ebay"] img');
    const kleinanzeigenImg = element.querySelector('a[href="/marketplaces/kleinanzeigen"] img');

    expect(vintedImg?.getAttribute('src')).toContain('vinted.svg');
    expect(ebayImg?.getAttribute('src')).toContain('ebay.svg');
    expect(kleinanzeigenImg?.getAttribute('src')).toContain('kleinanzeigen.svg');
  });

  it('versieht die Administration mit einer Admin-Badge', async () => {
    const { element } = await renderAt('/dashboard');
    const adminLink = element.querySelector('a[href="/admin"]');
    expect(adminLink?.querySelector('app-badge')?.textContent?.trim()).toBe('Admin');
  });
  it('ersetzt im Vinted-Bereich die Hauptnavigation und stellt sie beim Zurückwechseln wieder her', async () => {
    const { element, fixture } = await renderAt(
      '/marketplaces/vinted/messages?connectionId=account-b',
    );
    expect(element.querySelector('a[href="/dashboard"]')?.textContent).toContain(
      'Zurück zu Flipbase',
    );
    expect(
      element
        .querySelector('a[href="/marketplaces/vinted/messages"]')
        ?.getAttribute('aria-current'),
    ).toBe('page');
    expect(element.querySelector('a[href="/purchases"]')).toBeNull();
    expect(element.querySelector('a[href="/settings"]')).toBeNull();
    expect(element.querySelector('a[href="/marketplaces/vinted/manage"]')).toBeNull();
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
    await TestBed.inject(Router).navigateByUrl('/dashboard');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('a[href="/purchases"]')).not.toBeNull();
    expect(element.querySelector('a[href="/marketplaces/vinted/manage"]')).toBeNull();
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
  it('zeigt nicht anklickbare Vinted-Gruppen und schließt mobile Navigation beim Linkklick', async () => {
    const { element, fixture } = await renderAt('/marketplaces/vinted/favorite-messages');
    fixture.componentRef.setInput('isOpen', true);
    fixture.detectChanges();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const groups = [...element.querySelectorAll<HTMLElement>('[data-vinted-navigation-group]')];
    expect(groups.map((group) => group.querySelector('[id]')?.textContent?.trim())).toEqual([
      'Konto',
      'Automatisierungen',
    ]);
    expect(groups[0]?.querySelectorAll('a')).toHaveLength(8);
    expect(groups[1]?.querySelectorAll('a')).toHaveLength(2);
    expect(
      groups[1]
        ?.querySelector('a[href="/marketplaces/vinted/automatic-negotiation"]')
        ?.textContent?.trim(),
    ).toBe('Automatische Verhandlung');
    for (const group of groups) {
      const label = group.querySelector('[id]');
      expect(label?.tagName).toBe('DIV');
      expect(label?.querySelector('a, button')).toBeNull();
      expect(label?.getAttribute('tabindex')).toBeNull();
    }
    const links = [...element.querySelectorAll<HTMLAnchorElement>('nav a')];
    expect(links[0].textContent?.trim()).toBe('Konten');
    expect(links.at(-1)?.textContent?.trim()).toBe('Favoritennachrichten');
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
    links[1].click();
    expect(closed).toHaveBeenCalledOnce();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/marketplaces/vinted/overview');
  });
});

import '@angular/compiler';
import { Component, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TRANSLATIONS_DE, TRANSLATIONS_EN } from '../../core/i18n/translations';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
import { PwaService } from '../../core/services/pwa.service';
import { SidebarComponent } from './sidebar.component';

class TestPageComponent {}
Component({ selector: 'app-test-page', template: '' })(TestPageComponent);

const routes: Routes = [
  'dashboard',
  'catalog',
  'inventory/:id',
  'research',
  'deal-calculator',
  'fulfillment',
  'shop',
].map((path) => ({ path, component: TestPageComponent }));

const toggleSelector = 'button[aria-controls="sidebar-ideas"]';
const listSelector = '#sidebar-ideas';

describe('Arbeitsnavigation und Ideen in der Sidebar', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
  });

  afterEach(() => TestBed.resetTestingModule());

  async function renderAt(url: string, navigateBeforeCreation = false) {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter(routes),
        provideTranslateService({ lang: 'de' }),
        {
          provide: PlatformOperatorService,
          useValue: { operator: signal(false), isOperator: vi.fn(async () => false) },
        },
        { provide: PwaService, useValue: { isInstallable: signal(false), promptInstall: vi.fn() } },
      ],
    }).compileComponents();

    const translator = TestBed.inject(TranslateService);
    translator.setTranslation('de', TRANSLATIONS_DE);
    translator.setTranslation('en', TRANSLATIONS_EN);
    await firstValueFrom(translator.use('de'));
    const router = TestBed.inject(Router);
    if (navigateBeforeCreation) await router.navigateByUrl(url);

    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    if (!navigateBeforeCreation) await router.navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>(toggleSelector)!;
    const list = element.querySelector<HTMLUListElement>(listSelector)!;
    return { element, fixture, router, toggle, list };
  }

  it('zeigt die vereinbarten Gruppen und ordnet jeden Arbeitslink zu', async () => {
    const { element } = await renderAt('/dashboard');
    const groups = Array.from(element.querySelectorAll('[data-navigation-group]'));
    const names = groups.map((group) => group.querySelector('[id]')?.textContent?.trim());
    const links = groups.map((group) => {
      return Array.from(group.querySelectorAll('a')).map((link) => link.getAttribute('href'));
    });

    expect(names).toEqual(['Einkauf', 'Artikel', 'Verkauf', 'Finanzen']);
    expect(links).toEqual([
      ['/purchases', '/sellers', '/vinted-bot'],
      ['/catalog', '/image-optimizer'],
      ['/listings', '/sales'],
      ['/expenses', '/accounting', '/analytics'],
    ]);
    expect(element.textContent).not.toContain('Warenwirtschaft & Store');
    expect(element.textContent).not.toContain('Werkzeuge & Ertrag');
    expect(element.textContent).not.toContain('System & Daten');
  });

  it('haelt Ideen anfangs geschlossen und erhaelt alle vier Links samt Demo-Hinweis', async () => {
    const { element, toggle, list } = await renderAt('/dashboard');
    const paths = Array.from(list.querySelectorAll('a')).map((link) => link.getAttribute('href'));

    expect(toggle.type).toBe('button');
    expect(toggle.textContent?.trim()).toBe('Ideen');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
    expect(paths).toEqual(['/shop', '/research', '/deal-calculator', '/fulfillment']);
    expect(element.querySelector('a[href="/ideas"]')).toBeNull();
    expect(list.querySelector('a[href="/shop"]')?.textContent).toContain('Demo');
  });

  it('klappt Ideen ohne Navigation und ohne mobiles Schliessen auf und zu', async () => {
    const { fixture, router, toggle, list } = await renderAt('/dashboard');
    fixture.componentRef.setInput('isOpen', true);
    const onClose = vi.fn();
    fixture.componentInstance.closed.subscribe(onClose);

    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    expect(router.url).toBe('/dashboard');
    expect(onClose).not.toHaveBeenCalled();

    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
    expect(router.url).toBe('/dashboard');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('oeffnet Ideen auch beim Einstieg vor Erstellung der Sidebar', async () => {
    const { element, toggle, list } = await renderAt('/research?query=jacke#vergleich', true);
    const research = element.querySelector('a[href="/research"]');

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    expect(toggle.classList.contains('font-semibold')).toBe(true);
    expect(research?.getAttribute('aria-current')).toBe('page');
    expect(element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('oeffnet Ideen beim Wechsel auf eine zurueckgestellte Seite', async () => {
    const { element, fixture, router, toggle } = await renderAt('/dashboard');
    await router.navigateByUrl('/deal-calculator');
    await fixture.whenStable();
    fixture.detectChanges();
    const calculator = element.querySelector('a[href="/deal-calculator"]');

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(calculator?.getAttribute('aria-current')).toBe('page');
    expect(element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('respektiert manuelles Zuklappen bis zum naechsten passenden Seitenwechsel', async () => {
    const { element, fixture, router, toggle, list } = await renderAt('/research');
    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);

    await router.navigateByUrl('/fulfillment');
    await fixture.whenStable();
    fixture.detectChanges();
    const shipping = element.querySelector('a[href="/fulfillment"]');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(shipping?.getAttribute('aria-current')).toBe('page');
  });

  it('schliesst das mobile Menue erst nach Auswahl einer Ideen-Seite', async () => {
    const { element, fixture, router, toggle } = await renderAt('/dashboard');
    fixture.componentRef.setInput('isOpen', true);
    const onClose = vi.fn();
    fixture.componentInstance.closed.subscribe(onClose);
    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();
    element.querySelector<HTMLAnchorElement>('#sidebar-ideas a[href="/research"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/research');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('markiert Bestandsdetails unter dem einzigen Artikelmenüpunkt', async () => {
    const { element } = await renderAt('/inventory/123?tab=details');
    const article = element.querySelector('a[href="/catalog"]');
    const inventory = element.querySelector('a[href="/inventory"]');

    expect(article?.textContent?.trim()).toBe('Artikel');
    expect(article?.getAttribute('aria-current')).toBe('page');
    expect(inventory).toBeNull();
    expect(element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('uebersetzt auch neue Gruppen und Menuebezeichnungen beim Sprachwechsel', async () => {
    const { element, fixture, toggle } = await renderAt('/dashboard');
    await firstValueFrom(TestBed.inject(TranslateService).use('en'));
    await fixture.whenStable();
    fixture.detectChanges();
    const headings = Array.from(element.querySelectorAll('[data-navigation-group] [id]'));
    const names = headings.map((heading) => heading.textContent?.trim());
    const article = element.querySelector('a[href="/catalog"]');
    const listings = element.querySelector('a[href="/listings"]');
    const research = element.querySelector('a[href="/research"]');

    expect(names).toEqual(['Purchasing', 'Products', 'Selling', 'Finances']);
    expect(toggle.textContent?.trim()).toBe('Ideas');
    expect(article?.textContent?.trim()).toBe('Articles');
    expect(listings?.textContent?.trim()).toBe('Listings');
    expect(research?.textContent?.trim()).toBe('Price research');
    expect(element.textContent).not.toContain('NAV.');
  });

  it('hat auch bei geoeffneten Ideen keine schweren automatisch erkennbaren Barrieren', async () => {
    const { element, fixture } = await renderAt('/research');
    fixture.componentRef.setInput('isOpen', true);
    fixture.detectChanges();
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    const severe = result.violations.filter((violation) => {
      return ['critical', 'serious'].includes(violation.impact ?? '');
    });

    expect(severe).toEqual([]);
  });
});

import '@angular/compiler';
import { Component, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionSelect, VintedBotShellComponent } from './vinted-bot-shell.component';

class TestPageComponent {}
Component({ selector: 'app-test-page', template: '<p>Testseite</p>' })(TestPageComponent);

// Signal-Eingaenge kennt die Laufzeitübersetzung der Tests nicht; ohne diese
// Anmeldung blieben Seitentitel und Auswahlfeld leer.
function registerSignalInputs(component: unknown, names: readonly string[]): void {
  const metadata = (
    component as {
      ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
    }
  ).ɵcmp;
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
}

/** Steht fuer das Auswahlfeld: nur sein Wert, wie es die Huelle sieht. */
function fakeSelect(value: string): SectionSelect {
  return { value: signal<string | null>(value) } as unknown as SectionSelect;
}

// Schaltet, ob der Wechsel zum Botbetrieb erlaubt ist - so laesst sich eine
// abgelehnte Navigation nachstellen, wie sie der Waechter fuer ungespeicherte
// Aenderungen ausloest.
let allowOperation = true;

function routesWithGuard(): Routes {
  // Die Kinder haengen ohne eigene Komponente an der Adresse, damit sie im
  // router-outlet der getesteten Huelle erscheinen und nicht in einer zweiten.
  return [
    {
      path: 'admin/vinted-bot',
      children: [
        { path: 'queries', component: TestPageComponent },
        { path: 'operation', canActivate: [() => allowOperation], component: TestPageComponent },
        { path: 'categories', component: TestPageComponent },
      ],
    },
  ];
}

describe('VintedBotShellComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => {
      const resource = url.includes('custom-select.component')
        ? `../../../shared/components/custom-select/${url}`
        : url.includes('page-header.component')
          ? `../../../shared/components/page-header/${url}`
          : url;
      return readFile(new URL(resource, import.meta.url), 'utf8');
    });
    registerSignalInputs(CustomSelectComponent, ['options', 'value', 'ariaLabel']);
    registerSignalInputs(PageHeaderComponent, ['title', 'subtitle']);
  });

  beforeEach(async () => {
    allowOperation = true;
    await TestBed.configureTestingModule({
      imports: [VintedBotShellComponent],
      providers: [provideRouter(routesWithGuard())],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  async function renderAt(url: string) {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(VintedBotShellComponent);
    fixture.detectChanges();
    await router.navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const navigation = element.querySelector(
      'nav[aria-label="Bereiche des Vinted Bots"]',
    ) as HTMLElement;
    return {
      fixture,
      router,
      element,
      links: Array.from(navigation.querySelectorAll('a')) as HTMLAnchorElement[],
    };
  }

  it('listet die drei Bot-Bereiche mit Zielen und bietet sie auch als Auswahl an', async () => {
    const { element, links } = await renderAt('/admin/vinted-bot/queries');

    expect(element.querySelector('h1')?.textContent).toContain('Vinted Bot');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/vinted-bot/queries',
      '/admin/vinted-bot/operation',
      '/admin/vinted-bot/categories',
    ]);
    ['Markenfilter', 'Botbetrieb', 'Kategorieliste'].forEach((label, index) =>
      expect(links[index].textContent).toContain(label),
    );
    expect(element.querySelector('app-custom-select')).not.toBeNull();
  });

  // Beide Richtungen, damit der Test nicht gruen bliebe, wenn aria-current
  // fest auf einem Punkt stuende.
  it('zeichnet nur den aktuellen Bereich als aktuelle Seite aus', async () => {
    const queries = await renderAt('/admin/vinted-bot/queries');
    expect(queries.links.map((link) => link.getAttribute('aria-current'))).toEqual([
      'page',
      null,
      null,
    ]);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VintedBotShellComponent],
      providers: [provideRouter(routesWithGuard())],
    }).compileComponents();
    const operation = await renderAt('/admin/vinted-bot/operation');
    expect(operation.links.map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      'page',
      null,
    ]);
    expect(operation.element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('wechselt ueber das Auswahlfeld den Bereich und laesst dessen Wert stehen', async () => {
    const { fixture, router } = await renderAt('/admin/vinted-bot/queries');
    const select = fakeSelect('categories');

    await fixture.componentInstance.onMobileSectionChange('categories', select);

    expect(router.url).toBe('/admin/vinted-bot/categories');
    expect(fixture.componentInstance.currentPath()).toBe('categories');
    expect(select.value()).toBe('categories');
  });

  it('setzt den Wert im Auswahlfeld zurueck, wenn der Wechsel abgelehnt wird', async () => {
    const { fixture, router } = await renderAt('/admin/vinted-bot/queries');
    allowOperation = false;
    // Das Auswahlfeld hat seinen Wert bereits selbst auf den neuen Bereich gesetzt.
    const select = fakeSelect('operation');

    await fixture.componentInstance.onMobileSectionChange('operation', select);

    expect(router.url).toBe('/admin/vinted-bot/queries');
    expect(select.value()).toBe('queries');
  });

  it('ignoriert unbekannte Bereiche', async () => {
    const { fixture, router } = await renderAt('/admin/vinted-bot/queries');

    await fixture.componentInstance.onMobileSectionChange('unknown');
    await fixture.componentInstance.onMobileSectionChange(null);

    expect(router.url).toBe('/admin/vinted-bot/queries');
  });

  it('hat keine automatisch erkennbaren schwerwiegenden Barrieren', async () => {
    const { element } = await renderAt('/admin/vinted-bot/operation');
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });

    expect(
      result.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
});

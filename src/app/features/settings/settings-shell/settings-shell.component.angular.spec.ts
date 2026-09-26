import '@angular/compiler';
import { Component, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { SettingsShellComponent } from './settings-shell.component';

class TestPageComponent {}
Component({ selector: 'app-test-page', template: '<p>Testseite</p>' })(TestPageComponent);

describe('SettingsShellComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => {
      const resource = url.includes('custom-select.component')
        ? `../../../shared/components/custom-select/${url}`
        : url;
      return readFile(new URL(resource, import.meta.url), 'utf8');
    });
  });

  beforeEach(async () => {
    const metadata = (
      CustomSelectComponent as unknown as {
        ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
      }
    ).ɵcmp;
    metadata.inputs = {
      ...metadata.inputs,
      options: ['options', 1, null],
      value: ['value', 1, null],
      ariaLabel: ['ariaLabel', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      options: 'options',
      value: 'value',
      ariaLabel: 'ariaLabel',
    };
    const routes: Routes = [
      {
        path: 'settings',
        component: SettingsShellComponent,
        children: [
          { path: 'account', component: TestPageComponent },
          { path: 'data', component: TestPageComponent },
        ],
      },
    ];
    await TestBed.configureTestingModule({
      imports: [SettingsShellComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('bietet dieselben Bereiche als semantische Desktop-Navigation und mobile Auswahl an', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(SettingsShellComponent);
    fixture.detectChanges();
    await router.navigateByUrl('/settings/account');
    await fixture.whenStable();
    fixture.detectChanges();

    const navigation = fixture.nativeElement.querySelector(
      'nav[aria-label="Einstellungsbereiche"]',
    );
    const links = Array.from(navigation.querySelectorAll('a')) as HTMLAnchorElement[];
    const mobileSelect = fixture.nativeElement.querySelector('app-custom-select');

    expect(links.some((link) => link.textContent?.includes('Daten & Protokolle'))).toBe(true);
    expect(
      links.find((link) => link.textContent?.includes('Konto'))?.getAttribute('aria-current'),
    ).toBe('page');
    expect(mobileSelect).not.toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    const version = fixture.nativeElement.querySelector('footer span') as HTMLSpanElement;
    expect(version.textContent).toContain(`Flipbase v${fixture.componentInstance.version.nummer}`);
    expect(version.title).toContain('Commit ');
  });

  it('navigiert nach einer Auswahl und stellt den aktuellen Seitentitel bereit', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/settings/account');
    const fixture = TestBed.createComponent(SettingsShellComponent);
    fixture.detectChanges();

    await fixture.componentInstance.onMobileSectionChange('data');
    fixture.detectChanges();

    expect(router.url).toBe('/settings/data');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Daten & Protokolle');
  });

  it('hat keine automatisch erkennbaren schwerwiegenden Barrieren', async () => {
    const fixture = TestBed.createComponent(SettingsShellComponent);
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
    expect(result.violations.filter((violation) => violation.impact === 'serious')).toEqual([]);
  });
});

import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../e2e/support/marketplace-rendering';
import type { PlatformFeatureSwitch } from '../../core/models/platform-feature.model';
import { PlatformFeatureSwitchService } from '../../core/services/platform-feature-switch.service';
import { MaintenanceComponent } from './maintenance.component';

describe('MaintenanceComponent', () => {
  let restoreBindings: (() => void) | undefined;
  beforeAll(async () => {
    restoreBindings = await prepareMarketplaceRendering([
      {
        type: MaintenanceComponent,
        path: 'src/app/features/maintenance/maintenance.component.ts',
      },
    ]);
  });
  afterAll(() => restoreBindings?.());
  afterEach(() => TestBed.resetTestingModule());

  async function render(feature: string, switches: PlatformFeatureSwitch[] = []) {
    await TestBed.configureTestingModule({
      imports: [MaintenanceComponent],
      providers: [
        provideRouter([]),
        {
          provide: PlatformFeatureSwitchService,
          useValue: { switches: signal(switches), refresh: vi.fn(async () => switches) },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MaintenanceComponent);
    fixture.componentRef.setInput('feature', feature);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('nennt den geschlossenen Bereich mit Standardtext und Weg zurück', async () => {
    const element = await render('vinted');

    expect(element.querySelector('h1')?.textContent).toContain(
      'Vinted ist vorübergehend geschlossen',
    );
    expect(element.textContent).toContain('Wir führen gerade Wartungsarbeiten durch.');
    const links = Array.from(element.querySelectorAll('a')).map((link) =>
      link.getAttribute('href'),
    );
    expect(links).toEqual(['/dashboard', '/marketplaces/vinted']);
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it('zeigt den Wartungstext des Betreibers', async () => {
    const element = await render('vinted_feed', [
      { key: 'vinted_feed', enabled: false, maintenanceMessage: 'Bis 18 Uhr', updatedAt: '' },
    ]);

    expect(element.querySelector('h1')?.textContent).toContain('Vinted-Feed');
    expect(element.textContent).toContain('Bis 18 Uhr');
    expect(element.textContent).not.toContain('Wir führen gerade');
  });
});

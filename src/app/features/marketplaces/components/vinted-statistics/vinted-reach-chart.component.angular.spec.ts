import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ThemeService } from '../../../../core/services/theme.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import type { RevenueChartLoader } from '../../../../shared/components/revenue-chart/revenue-chart.renderer';
import {
  VINTED_REACH_CHART_LOADER,
  VintedReachChartComponent,
} from './vinted-reach-chart.component';

const points = [
  { key: 'a', label: '07.10.', description: 'Mittwoch, 07.10.', value: 20 },
  { key: 'b', label: '08.10.', description: 'Donnerstag, 08.10.', value: 50 },
];

describe('VintedReachChartComponent', () => {
  let fixture: ComponentFixture<VintedReachChartComponent>;
  let resetBindings: (() => void) | undefined;
  const render = vi.fn().mockResolvedValue(undefined);
  const updateOptions = vi.fn().mockResolvedValue(undefined);
  const loader: RevenueChartLoader = async () => () => ({
    render,
    updateOptions,
    destroy: vi.fn(),
  });
  const host = () => fixture.nativeElement as HTMLElement;

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      {
        type: VintedReachChartComponent,
        path: 'src/app/features/marketplaces/components/vinted-statistics/vinted-reach-chart.component.ts',
      },
      { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    ]);
  });
  afterAll(() => resetBindings?.());

  beforeEach(async () => {
    TestBed.resetTestingModule();
    render.mockClear();
    await TestBed.configureTestingModule({
      imports: [VintedReachChartComponent],
      providers: [
        { provide: VINTED_REACH_CHART_LOADER, useValue: loader },
        { provide: ThemeService, useValue: { currentTheme: signal('light') } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VintedReachChartComponent);
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('seriesName', 'Aufrufe');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('beschreibt das Diagramm für Bildschirmleser und liefert alle Werte als Tabelle', () => {
    const chart = host().querySelector('[role="img"]');
    expect(chart?.getAttribute('aria-label')).toBe('Aufrufe je Zeitabschnitt');
    const rows = [...host().querySelectorAll('tbody tr')].map((row) => row.textContent?.trim());
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('Donnerstag, 08.10.');
    expect(rows[1]).toContain('50');
  });

  it('blendet die Tabelle auf Wunsch sichtbar ein', () => {
    const table = host().querySelector<HTMLElement>('[data-reach-chart-table]')!;
    expect(table.hidden).toBe(true);
    expect(host().querySelector('[role="img"]')?.getAttribute('aria-describedby')).toBe(
      'vinted-reach-chart-detail',
    );
    const toggle = host().querySelector<HTMLButtonElement>('[data-reach-chart-toggle] button')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(table.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('nennt den Abschnitt unter dem Zeiger und sonst den stärksten Abschnitt', () => {
    const detail = () => host().querySelector('[data-reach-chart-detail]')?.textContent?.trim();
    expect(detail()).toBe('Stärkster Abschnitt: Donnerstag, 08.10. (50 Aufrufe)');
    fixture.componentInstance.showPoint(0);
    fixture.detectChanges();
    expect(detail()).toBe('Mittwoch, 07.10.: 20 Aufrufe');
    fixture.componentInstance.clearPoint();
    fixture.detectChanges();
    expect(detail()).toBe('Stärkster Abschnitt: Donnerstag, 08.10. (50 Aufrufe)');
  });

  it('zeigt bei lauter Nullwerten einen ruhigen Hinweis statt eines stärksten Abschnitts', () => {
    fixture.componentRef.setInput(
      'points',
      points.map((point) => ({ ...point, value: 0 })),
    );
    fixture.detectChanges();
    expect(host().querySelector('[data-reach-chart-detail]')?.textContent?.trim()).toBe(
      'Im gewählten Zeitraum gab es keine neuen Aufrufe.',
    );
  });
});

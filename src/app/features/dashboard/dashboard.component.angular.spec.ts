import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { EventEmitter, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardReport, Sale } from '../../core/models/flipbase.models';
import { DashboardReportService } from '../../core/services/dashboard-report.service';
import { SalesService } from '../../core/services/sales.service';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { RevenueChartComponent } from '../../shared/components/revenue-chart/revenue-chart.component';
import { DashboardComponent } from './dashboard.component';
import { DashboardPreferences } from './models/dashboard-preferences';
import { DashboardPreferencesService } from './services/dashboard-preferences.service';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const componentResources: Readonly<Record<string, string>> = {
  './custom-select.component.html':
    'src/app/shared/components/custom-select/custom-select.component.html',
  './custom-select.component.scss':
    'src/app/shared/components/custom-select/custom-select.component.scss',
  './dashboard.component.html': 'src/app/features/dashboard/dashboard.component.html',
  './revenue-chart.component.html':
    'src/app/shared/components/revenue-chart/revenue-chart.component.html',
};

const emptyReport: DashboardReport = {
  expenses: 0,
  revenue: 0,
  realizedProfit: 0,
  resultAfterDirectCosts: 0,
  soldItems: 0,
  averageMarginPercent: null,
  inventoryCostValue: 0,
  points: [],
  rows: [],
};

const sales = signal<Sale[]>([]);
const createReport = vi.fn(() => emptyReport);
const preferences = signal<DashboardPreferences>({ range: 'year', platform: 'all' });
const saveError = signal<string | null>(null);
const setRange = vi.fn();
const setPlatform = vi.fn();
let customSelectInputMetadataSnapshot: AngularInputMetadata | null = null;
let revenueChartInputMetadataSnapshot: AngularInputMetadata | null = null;
let customSelectValueChangeDescriptor: PropertyDescriptor | undefined;
let revenueChartInitializeDescriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources((url) => {
    const resource = componentResources[url];
    if (!resource) throw new Error(`Unbekannte Test-Ressource: ${url}`);
    return readFile(resolve(resource), 'utf8');
  });
});

beforeEach(() => {
  const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  customSelectInputMetadataSnapshot = {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  };
  metadata.inputs = {
    ...metadata.inputs,
    options: ['options', 1, null],
    value: ['value', 1, null],
    placeholder: ['placeholder', 1, null],
    variant: ['variant', 1, null],
    size: ['size', 1, null],
    disabled: ['disabled', 1, null],
    widthClass: ['widthClass', 1, null],
    openDirection: ['openDirection', 1, null],
    ariaLabel: ['ariaLabel', 1, null],
    triggerId: ['triggerId', 1, null],
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    options: 'options',
    value: 'value',
    placeholder: 'placeholder',
    variant: 'variant',
    size: 'size',
    disabled: 'disabled',
    widthClass: 'widthClass',
    openDirection: 'openDirection',
    ariaLabel: 'ariaLabel',
    triggerId: 'triggerId',
  };
  metadata.outputs = {
    ...metadata.outputs,
    valueChange: 'valueChange',
  };
  customSelectValueChangeDescriptor = Object.getOwnPropertyDescriptor(
    CustomSelectComponent.prototype,
    'valueChange',
  );
  Object.defineProperty(CustomSelectComponent.prototype, 'valueChange', {
    configurable: true,
    value: new EventEmitter<string | null>(),
  });
  const revenueChartMetadata = (RevenueChartComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  revenueChartInputMetadataSnapshot = {
    inputs: revenueChartMetadata.inputs,
    declaredInputs: revenueChartMetadata.declaredInputs,
    outputs: revenueChartMetadata.outputs,
  };
  revenueChartMetadata.inputs = {
    ...revenueChartMetadata.inputs,
    points: ['points', 1, null],
  };
  revenueChartMetadata.declaredInputs = {
    ...revenueChartMetadata.declaredInputs,
    points: 'points',
  };
  const revenueChartPrototype = RevenueChartComponent.prototype as unknown as Record<
    string,
    unknown
  >;
  revenueChartInitializeDescriptor = Object.getOwnPropertyDescriptor(
    revenueChartPrototype,
    'initializeChart',
  );
  Object.defineProperty(revenueChartPrototype, 'initializeChart', {
    configurable: true,
    value: () => undefined,
  });

  sales.set([]);
  createReport.mockClear();
  preferences.set({ range: 'year', platform: 'all' });
  saveError.set(null);
  setRange
    .mockReset()
    .mockImplementation((range) => preferences.update((current) => ({ ...current, range })));
  setPlatform
    .mockReset()
    .mockImplementation((platform) => preferences.update((current) => ({ ...current, platform })));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DashboardComponent],
    providers: [
      provideRouter([]),
      { provide: SalesService, useValue: { sales } },
      { provide: DashboardReportService, useValue: { createReport } },
      {
        provide: DashboardPreferencesService,
        useValue: { preferences, saveError, setRange, setPlatform },
      },
    ],
  });
});

afterEach(() => {
  try {
    TestBed.resetTestingModule();
  } finally {
    if (customSelectInputMetadataSnapshot) {
      const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = customSelectInputMetadataSnapshot.inputs;
      metadata.declaredInputs = customSelectInputMetadataSnapshot.declaredInputs;
      metadata.outputs = customSelectInputMetadataSnapshot.outputs;
      customSelectInputMetadataSnapshot = null;
    }

    if (customSelectValueChangeDescriptor) {
      Object.defineProperty(
        CustomSelectComponent.prototype,
        'valueChange',
        customSelectValueChangeDescriptor,
      );
    } else {
      delete (CustomSelectComponent.prototype as { valueChange?: unknown }).valueChange;
    }
    customSelectValueChangeDescriptor = undefined;

    if (revenueChartInputMetadataSnapshot) {
      const revenueChartMetadata = (
        RevenueChartComponent as unknown as { ɵcmp: AngularInputMetadata }
      ).ɵcmp;
      revenueChartMetadata.inputs = revenueChartInputMetadataSnapshot.inputs;
      revenueChartMetadata.declaredInputs = revenueChartInputMetadataSnapshot.declaredInputs;
      revenueChartMetadata.outputs = revenueChartInputMetadataSnapshot.outputs;
      revenueChartInputMetadataSnapshot = null;
    }

    const revenueChartPrototype = RevenueChartComponent.prototype as unknown as Record<
      string,
      unknown
    >;
    if (revenueChartInitializeDescriptor) {
      Object.defineProperty(
        revenueChartPrototype,
        'initializeChart',
        revenueChartInitializeDescriptor,
      );
    } else {
      delete revenueChartPrototype['initializeChart'];
    }
    revenueChartInitializeDescriptor = undefined;
  }
});

function sale(platform: string): Sale {
  return { platform } as Sale;
}

function createDashboard() {
  const fixture = TestBed.createComponent(DashboardComponent);
  fixture.detectChanges();
  return fixture;
}

describe('DashboardComponent', () => {
  it('macht Augustverkäufe mit offenen Kosten aus der leeren Septemberansicht erreichbar', () => {
    preferences.set({ range: 'month', platform: 'all' });
    const historicalSale: Sale = {
      id: 'historical-sale',
      workspace_id: 'workspace-1',
      platform: 'ebay',
      sale_date: '2026-08-30',
      sale_price: 42.98,
      platform_fee: 7.7,
      shipping_cost: 5.19,
      packaging_cost: 0,
      other_costs: 0,
      lines: [],
      has_persisted_lines: false,
    };
    sales.set([historicalSale]);
    const service = Object.create(DashboardReportService.prototype) as DashboardReportService;
    createReport.mockImplementation((...args: unknown[]) =>
      service.createReportForRecords(
        args[0] as 'month' | 'year',
        args[1] as string,
        { purchases: [], inventoryItems: [], stockLots: [], sales: [historicalSale] },
        new Date(2026, 8, 5),
      ),
    );
    try {
      const fixture = createDashboard();
      const host = fixture.nativeElement as HTMLElement;
      expect(fixture.componentInstance.report().rows).toHaveLength(0);
      const button = host.querySelector<HTMLButtonElement>('[data-expand-sales-period]');
      expect(button).not.toBeNull();
      button!.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.report()).toMatchObject({
        revenue: 42.98,
        soldItems: 1,
        resultAfterDirectCosts: null,
      });
      expect(fixture.componentInstance.report().rows).toHaveLength(1);
      expect(host.textContent).toContain('Kosten noch offen');
    } finally {
      createReport.mockImplementation(() => emptyReport);
    }
  });

  it('verwendet für Karten und Verkaufsjournal dieselben verständlichen Kennzahlen', () => {
    createReport.mockReturnValueOnce({
      ...emptyReport,
      revenue: 42.98,
      realizedProfit: 20.09,
      resultAfterDirectCosts: 20.09,
      soldItems: 2,
      averageMarginPercent: 46.74,
      inventoryCostValue: 16.67,
      rows: [
        {
          saleId: 'sale-1',
          date: '2026-08-30',
          articles: 'Nackenkissen',
          quantity: 2,
          platform: 'ebay',
          revenue: 42.98,
          costOfGoodsSold: 10,
          sellingCosts: 12.89,
          resultAfterDirectCosts: 20.09,
          marginPercent: 46.74,
          profit: 20.09,
        },
      ],
    });

    const fixture = createDashboard();
    const host = fixture.nativeElement as HTMLElement;
    const text = host.textContent ?? '';
    const journal = host.querySelector('#sales-table-heading')?.closest('section');
    const headers = [...(journal?.querySelectorAll('thead th') ?? [])].map((header) =>
      header.textContent?.replace(/\s+/g, ' ').trim(),
    );

    for (const label of [
      'Verkaufserlöse',
      'Ergebnis nach direkten Kosten',
      'Aktueller Bestandswert',
      'Verkaufte Artikel',
      'Durchschnittliche Marge',
    ]) {
      expect(text).toContain(label);
    }
    expect(headers).toEqual([
      'Datum',
      'Artikel',
      'Menge',
      'Plattform',
      'Verkaufserlös',
      'Wareneinsatz',
      'Verkaufskosten',
      'Ergebnis nach direkten Kosten',
      'Marge',
    ]);
    expect(text).not.toContain('COGS');
    expect(text).not.toContain('Realisierter Gewinn');
  });

  it('isoliert den Chart-Lifecycle im Dashboard-Header-Test ohne Angular-Laufzeitfehler', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const fixture = createDashboard();
      await fixture.whenStable();

      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('erstellt eindeutige, deutsch sortierte Plattformoptionen für den Shared Select', () => {
    sales.set([sale('vinted'), sale('ebay'), sale('vinted')]);

    const fixture = createDashboard();
    const component = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;

    expect(component.platformSelectOptions()).toEqual([
      { value: 'all', label: 'Alle Plattformen' },
      { value: 'ebay', label: 'ebay' },
      { value: 'vinted', label: 'vinted' },
    ]);
    expect(host.querySelector('select#dashboard-platform')).toBeNull();
    expect(host.querySelectorAll('app-custom-select')).toHaveLength(1);
  });

  it('übernimmt die Plattformauswahl aus dem Shared Select für den Bericht', () => {
    sales.set([sale('ebay'), sale('vinted')]);
    const fixture = createDashboard();
    const component = fixture.componentInstance;
    const select = fixture.debugElement.query(By.directive(CustomSelectComponent))
      .componentInstance as CustomSelectComponent<string> & {
      valueChange: EventEmitter<string | null>;
    };

    select.valueChange.emit('vinted');
    fixture.detectChanges();

    expect(component.platform()).toBe('vinted');
    expect(setPlatform).toHaveBeenCalledWith('vinted');
  });

  it('behält eine gespeicherte Plattform auch ohne aktuelle Verkäufe als Option', async () => {
    preferences.set({ range: 'year', platform: 'vinted' });
    sales.set([sale('ebay'), sale('vinted')]);
    const fixture = createDashboard();
    const component = fixture.componentInstance;

    sales.set([sale('ebay')]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.platform()).toBe('vinted');
    expect(component.platformSelectOptions()).toContainEqual({ value: 'vinted', label: 'vinted' });
    expect(createReport).toHaveBeenLastCalledWith('year', 'vinted');
  });

  it('normalisiert eine leere Plattformauswahl auf alle Plattformen', () => {
    const fixture = createDashboard();
    const component = fixture.componentInstance;

    component.setPlatform(null);
    fixture.detectChanges();

    expect(setPlatform).toHaveBeenCalledWith('all');
  });

  it('zeigt einen Speicherfehler einmal als Statushinweis', () => {
    saveError.set('Die Dashboard-Auswahl konnte nicht gespeichert werden.');
    const fixture = createDashboard();
    const hints = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-dashboard-save-error]',
    );

    expect(hints).toHaveLength(1);
    expect(hints[0]?.getAttribute('role')).toBe('status');
  });

  it('rendert die Zeitraumwahl als gedrückte Gruppe und besteht AXE im Header', async () => {
    const fixture = createDashboard();
    const host = fixture.nativeElement as HTMLElement;
    const periodGroup = host.querySelector('[aria-label="Zeitraum wählen"]') as HTMLElement;

    expect(periodGroup.getAttribute('role')).toBe('group');
    expect(
      Array.from(periodGroup.querySelectorAll('button')).every((button) =>
        button.hasAttribute('aria-pressed'),
      ),
    ).toBe(true);

    const result = await axe.run(host.querySelector('header') as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});

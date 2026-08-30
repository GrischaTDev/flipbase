import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { EventEmitter, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
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

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

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
  inventoryCostValue: 0,
  points: [],
  rows: [],
};

const sales = signal<Sale[]>([]);
const createReport = vi.fn(() => emptyReport);
let customSelectInputMetadataSnapshot: AngularInputMetadata | null = null;
let revenueChartInputMetadataSnapshot: AngularInputMetadata | null = null;
let customSelectValueChangeDescriptor: PropertyDescriptor | undefined;

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

  sales.set([]);
  createReport.mockClear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DashboardComponent],
    providers: [
      provideRouter([]),
      { provide: SalesService, useValue: { sales } },
      { provide: DashboardReportService, useValue: { createReport } },
    ],
  });
});

afterEach(() => {
  try {
    TestBed.resetTestingModule();
  } finally {
    if (!customSelectInputMetadataSnapshot) return;

    const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = customSelectInputMetadataSnapshot.inputs;
    metadata.declaredInputs = customSelectInputMetadataSnapshot.declaredInputs;
    metadata.outputs = customSelectInputMetadataSnapshot.outputs;
    customSelectInputMetadataSnapshot = null;

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

    if (!revenueChartInputMetadataSnapshot) return;

    const revenueChartMetadata = (
      RevenueChartComponent as unknown as { ɵcmp: AngularInputMetadata }
    ).ɵcmp;
    revenueChartMetadata.inputs = revenueChartInputMetadataSnapshot.inputs;
    revenueChartMetadata.declaredInputs = revenueChartInputMetadataSnapshot.declaredInputs;
    revenueChartMetadata.outputs = revenueChartInputMetadataSnapshot.outputs;
    revenueChartInputMetadataSnapshot = null;
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
    expect(createReport).toHaveBeenLastCalledWith('month', 'vinted');
  });

  it('setzt eine nicht mehr vorhandene Plattformauswahl auf alle Plattformen zurück', async () => {
    sales.set([sale('ebay'), sale('vinted')]);
    const fixture = createDashboard();
    const component = fixture.componentInstance;

    component.setPlatform('vinted');
    fixture.detectChanges();
    sales.set([sale('ebay')]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.platform()).toBe('all');
    expect(createReport).toHaveBeenLastCalledWith('month', 'all');
  });

  it('normalisiert eine leere Plattformauswahl auf alle Plattformen', () => {
    const fixture = createDashboard();
    const component = fixture.componentInstance;

    component.setPlatform(null);
    fixture.detectChanges();

    expect(component.platform()).toBe('all');
    expect(createReport).toHaveBeenLastCalledWith('month', 'all');
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

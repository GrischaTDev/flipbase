import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { EventEmitter, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { of } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardReport, InventoryItem, Sale, StockLot } from '../../core/models/flipbase.models';
import { DashboardReportService } from '../../core/services/dashboard-report.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { InventoryService } from '../../core/services/inventory.service';
import { StockService } from '../../core/services/stock.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { ExpenseService } from '../../core/services/expense.service';
import { SalesService } from '../../core/services/sales.service';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { RevenueChartComponent } from '../../shared/components/revenue-chart/revenue-chart.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { DashboardKpiCardComponent } from './components/dashboard-kpi-card/dashboard-kpi-card.component';
import { DashboardOpenCostsComponent } from './components/dashboard-open-costs/dashboard-open-costs.component';
import { BetaDiscordService } from '../beta-discord/services/beta-discord.service';
import { DashboardComponent } from './dashboard.component';
import { DashboardPreferences } from './models/dashboard-preferences';
import { DashboardPreferencesService } from './services/dashboard-preferences.service';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const componentResources: Readonly<Record<string, string>> = {
  './badge.component.html': 'src/app/shared/components/badge/badge.component.html',
  './badge.component.scss': 'src/app/shared/components/badge/badge.component.scss',
  './button.component.html': 'src/app/shared/components/button/button.component.html',
  './button.component.scss': 'src/app/shared/components/button/button.component.scss',
  './card.component.html': 'src/app/shared/components/card/card.component.html',
  './card.component.scss': 'src/app/shared/components/card/card.component.scss',
  './custom-select.component.html':
    'src/app/shared/components/custom-select/custom-select.component.html',
  './custom-select.component.scss':
    'src/app/shared/components/custom-select/custom-select.component.scss',
  './dashboard.component.css': 'src/app/features/dashboard/dashboard.component.css',
  './dashboard.component.html': 'src/app/features/dashboard/dashboard.component.html',
  './beta-discord-banner.component.html':
    'src/app/features/beta-discord/components/beta-discord-banner/beta-discord-banner.component.html',
  './dashboard-kpi-card.component.html':
    'src/app/features/dashboard/components/dashboard-kpi-card/dashboard-kpi-card.component.html',
  './dashboard-open-costs.component.html':
    'src/app/features/dashboard/components/dashboard-open-costs/dashboard-open-costs.component.html',
  './revenue-chart.component.html':
    'src/app/shared/components/revenue-chart/revenue-chart.component.html',
};

const emptyReport: DashboardReport = {
  grossProfit: 0,
  revenue: 0,
  revenueWithoutCost: 0,
  salesWithoutCostCount: 0,
  purchaseSpend: 0,
  purchaseCount: 0,
  sellingCosts: 0,
  operatingExpenseSpend: 0,
  totalExpenses: 0,
  purchasesIncluded: true,
  soldItems: 0,
  averageMarginPercent: null,
  inventoryCostValue: 0,
  inventoryItemsWithoutCost: 0,
  comparison: {
    label: '01.01.–16.09.2025',
    grossProfit: 0,
    revenue: 0,
    totalExpenses: 0,
    soldItems: 0,
    averageMarginPercent: null,
  },
  openCosts: [],
  salesWithoutPurchase: 0,
  points: [],
  rows: [],
};

const sales = signal<Sale[]>([]);
const inventoryItems = signal<InventoryItem[]>([]);
const stockLots = signal<StockLot[]>([]);
const currentWorkspace = signal({ id: 'workspace-1' });
const loadedWorkspaceId = signal('workspace-1');
const sourceLoading = signal(false);
const sourceError = signal<Error | null>(null);
const loadPositions = vi.fn(async () => undefined);
const sourceState = { isLoading: sourceLoading, loadError: sourceError, loadedWorkspaceId };
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
  for (const [component, names] of [
    [
      ButtonComponent,
      [
        'variant',
        'size',
        'link',
        'icon',
        'iconPosition',
        'ariaPressed',
        'fullWidth',
        'contentAlign',
        'queryParams',
        'title',
        'iconOnly',
        'ariaLabel',
      ],
    ],
    [CardComponent, ['padding', 'rounded']],
    [
      DashboardKpiCardComponent,
      ['label', 'value', 'icon', 'hint', 'change', 'comparisonLabel', 'size', 'valueTone'],
    ],
    [
      DashboardOpenCostsComponent,
      ['openCosts', 'salesWithoutPurchase', 'inventoryItemsWithoutCost'],
    ],
  ] as const) {
    const metadata = (component as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = { ...metadata.inputs };
    metadata.outputs = { ...metadata.outputs };
    for (const name of names) metadata.inputs[name] = [name, 1, null];
    if (component === ButtonComponent) metadata.outputs['clicked'] = 'clicked';
  }
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
  inventoryItems.set([]);
  stockLots.set([]);
  currentWorkspace.set({ id: 'workspace-1' });
  loadedWorkspaceId.set('workspace-1');
  sourceLoading.set(false);
  sourceError.set(null);
  loadPositions.mockClear();
  createReport.mockReset().mockReturnValue(emptyReport);
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
      {
        provide: SalesService,
        useValue: { sales, ...sourceState, loadSales: vi.fn() },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      {
        provide: InventoryService,
        useValue: { items: inventoryItems, ...sourceState, loadInventory: vi.fn() },
      },
      { provide: StockService, useValue: { lots: stockLots, ...sourceState, loadPositions } },
      { provide: PurchaseService, useValue: { ...sourceState, loadPurchases: vi.fn() } },
      {
        provide: ExpenseService,
        useValue: { ...sourceState, ensureCurrentWorkspaceLoaded: vi.fn(), load: vi.fn() },
      },
      { provide: DashboardReportService, useValue: { createReport } },
      {
        provide: TranslateService,
        useValue: {
          get: (key: string) => of(key),
          stream: (key: string) => of(key),
          onLangChange: of({ lang: 'de', translations: {} }),
          onTranslationChange: of({ lang: 'de', translations: {} }),
          onDefaultLangChange: of({ lang: 'de', translations: {} }),
        },
      },
      {
        provide: BetaDiscordService,
        useValue: { status: async () => ({ eligible: false, linked: false, configured: false }) },
      },
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
  it('zeigt Abschnittsüberschriften und Tabellenköpfe ohne dekorative Versalschrift', () => {
    const fixture = createDashboard();
    const headings = [...(fixture.nativeElement as HTMLElement).querySelectorAll('h2, thead')];
    expect(headings.length).toBeGreaterThanOrEqual(2);
    for (const heading of headings) {
      expect(heading.className).not.toMatch(/uppercase|tracking-/);
    }
  });

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

      const button = host.querySelector<HTMLButtonElement>('[data-expand-sales-period] button');
      expect(button).not.toBeNull();
      button!.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.report()).toMatchObject({
        revenue: 42.98,
        soldItems: 1,
        grossProfit: 0,
        revenueWithoutCost: 42.98,
        salesWithoutCostCount: 1,
        salesWithoutPurchase: 1,
      });
      expect(fixture.componentInstance.report().rows).toHaveLength(1);
      expect(host.textContent).toContain('Kosten noch offen');
      expect(host.textContent).toContain('Zu erledigen');
      expect(host.textContent).toContain('1 Verkauf ohne nachvollziehbare Kosten');
    } finally {
      createReport.mockImplementation(() => emptyReport);
    }
  });

  it('fokussiert das Dashboard auf fünf Kernkennzahlen und eine kompakte Verkaufsliste', () => {
    createReport.mockReturnValueOnce({
      ...emptyReport,
      grossProfit: 20.09,
      revenue: 42.98,
      averageMarginPercent: 46.74,
      inventoryCostValue: 116.67,
      inventoryItemsWithoutCost: 5,
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
    const kpiSection = host.querySelector('[aria-label="Kennzahlen"]') as HTMLElement;
    const journal = host.querySelector('#sales-table-heading')?.closest('section');
    const headers = [...(journal?.querySelectorAll('thead th') ?? [])].map((header) =>
      header.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Dashboard');
    expect(
      [...kpiSection.querySelectorAll('[data-kpi]')].map((card) =>
        card.querySelector('h2')?.textContent?.trim(),
      ),
    ).toEqual(['Umsatz', 'Gewinn', 'Marge', 'Kapital im Bestand', 'Verkäufe']);

    const kpi = (name: string) =>
      host.querySelector(`[data-kpi="${name}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(kpi('revenue')).toContain('42,98 €');
    expect(kpi('gross-profit')).toContain('20,09 €');
    expect(kpi('margin')).toContain('46,74 %');
    expect(kpi('inventory-capital')).toContain('116,67 €');
    expect(host.querySelector('[data-kpi="purchases"]')).toBeNull();
    expect(host.querySelector('[data-kpi="operating-expenses"]')).toBeNull();
    expect(host.querySelector('[data-kpi="total-expenses"]')).toBeNull();
    expect(kpiSection.querySelector('[data-kpi-hint]')).toBeNull();

    expect(host.querySelector('#inventory-overview-heading')?.textContent?.trim()).toBe(
      'Bestand im Blick',
    );
    expect(host.textContent).toContain('5 Stück ohne Kostenangabe');

    expect(journal?.querySelector('h2')?.textContent?.trim()).toBe('Letzte Verkäufe');
    expect(journal?.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe(
      'Letzte Verkäufe – Tabelle',
    );
    expect(headers).toEqual(['Datum', 'Artikel', 'Plattform', 'Gewinn']);
    expect(journal?.querySelector('tbody tr td:nth-child(4)')?.className).toContain('positive');

    expect(host.querySelector('#platform-overview-heading')?.textContent?.trim()).toBe(
      'Plattform-Verteilung',
    );
    expect(host.textContent).toContain('eBay');
    expect(host.textContent).toContain('100 %');
  });

  it('zeigt die wichtigsten Schnellaktionen im Dashboard', () => {
    const fixture = createDashboard();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Schnellaktionen');
    expect(text).toContain('Einkauf erfassen');
    expect(text).toContain('Verkauf erfassen');
    expect(text).toContain('Inserat erstellen');
    expect(text).toContain('Bilder optimieren');
  });

  it('markiert einen negativen Verkaufsgewinn eindeutig, ohne den Artikel als Fehler zu färben', () => {
    createReport.mockReturnValueOnce({
      ...emptyReport,
      rows: [
        {
          saleId: 'sale-loss',
          date: '2026-09-18',
          articles: 'Verlustverkauf',
          quantity: 1,
          platform: 'ebay',
          revenue: 20,
          costOfGoodsSold: 18,
          sellingCosts: 5,
          resultAfterDirectCosts: -3,
          marginPercent: -15,
          profit: -3,
        },
      ],
    });

    const fixture = createDashboard();
    const journal = (fixture.nativeElement as HTMLElement)
      .querySelector('#sales-table-heading')
      ?.closest('section');
    const cells = journal?.querySelectorAll('tbody tr td');

    expect(cells?.[1]?.className).not.toContain('negative');
    expect(cells?.[3]?.className).toContain('negative');
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
      { value: 'ebay', label: 'eBay' },
      { value: 'vinted', label: 'Vinted' },
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
    expect(component.platformSelectOptions()).toContainEqual({ value: 'vinted', label: 'Vinted' });
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
    expect(host.querySelector('header')?.textContent).toContain('Dashboard');
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

  it('zeigt bei Ladefehlern keine scheinbar vollständigen Bestands- oder Nullwerte', () => {
    sourceError.set(new Error('offline'));
    const fixture = createDashboard();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'nicht vollständig geladen',
    );
    expect(
      [...host.querySelectorAll('.metric-value')].map((node) => node.textContent?.trim()),
    ).toEqual(['–', '–', '–', '–', '–']);
    expect(host.textContent).not.toContain('Keine offenen Kostenangaben.');
  });

  it('versteckt alte Workspace-Werte sofort und lädt die Bestandslose für den neuen Workspace', async () => {
    const fixture = createDashboard();
    currentWorkspace.set({ id: 'workspace-2' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(loadPositions).toHaveBeenCalledWith('workspace-2');
    expect(fixture.componentInstance.ready()).toBe(false);
    expect(
      fixture.nativeElement
        .querySelector('[data-kpi="inventory-capital"] .metric-value')
        ?.textContent?.trim(),
    ).toBe('–');
  });

  it('zeigt weder Insights noch erfundene Bestandsvergleiche', () => {
    const fixture = createDashboard();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).not.toContain('Insights');
    expect(host.querySelector('[data-kpi="inventory-capital"] svg.sparkline')).toBeNull();
    expect(host.querySelector('[data-kpi="inventory-capital"] [data-kpi-change]')).toBeNull();
  });

  it('zeigt einen geladenen leeren Workspace als leer, nicht als Fehler', () => {
    const fixture = createDashboard();
    expect(fixture.componentInstance.ready()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[data-kpi="revenue"] .metric-value')?.textContent,
    ).toMatch(/0,00/);
    expect(fixture.nativeElement.textContent).toContain('Keine offenen Kostenangaben.');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('zeigt die Plattformlogos neben lesbaren Namen statt neutraler Plattform-Badges', () => {
    createReport.mockReturnValue({
      ...emptyReport,
      rows: ['vinted', 'kleinanzeigen', 'ebay', 'Flohmarkt'].map((platform, index) => ({
        saleId: `platform-sale-${index}`,
        date: '2026-09-23',
        articles: `Artikel ${index}`,
        quantity: 1,
        platform,
        revenue: 20,
        costOfGoodsSold: 10,
        sellingCosts: 0,
        resultAfterDirectCosts: 10,
        marginPercent: 50,
        profit: 10,
      })),
    });
    const host = createDashboard().nativeElement as HTMLElement;
    const cells = [...host.querySelectorAll('.sales-table tbody td:nth-child(3)')];
    for (const [index, platform] of ['vinted', 'kleinanzeigen', 'ebay'].entries()) {
      expect(cells[index].querySelector('img')?.getAttribute('src')).toBe(
        `/images/platforms/${platform}.svg`,
      );
      expect(cells[index].querySelector('img')?.getAttribute('alt')).toBe('');
      expect(cells[index].querySelector('app-badge')).toBeNull();
    }
    expect(cells[0].textContent).toContain('Vinted');
    expect(cells[1].textContent).toContain('Kleinanzeigen');
    expect(cells[2].textContent).toContain('eBay');
    expect(cells[3].textContent).toContain('Flohmarkt');
    expect(cells[3].querySelector('svg')).not.toBeNull();
  });

  it('bindet Donut und Legende an die Plattform statt an deren Umsatzrang', () => {
    const rows = signal([
      { platform: 'vinted', revenue: 80 },
      { platform: 'ebay', revenue: 20 },
      { platform: 'kleinanzeigen', revenue: 10 },
    ]);
    createReport.mockImplementation(() => ({
      ...emptyReport,
      rows: rows().map((row, index) => ({
        ...row,
        saleId: `rank-sale-${index}`,
        date: '2026-09-23',
        articles: 'Artikel',
        quantity: 1,
        costOfGoodsSold: 0,
        sellingCosts: 0,
        resultAfterDirectCosts: row.revenue,
        marginPercent: 100,
        profit: row.revenue,
      })),
    }));
    const fixture = createDashboard();
    const host = fixture.nativeElement as HTMLElement;
    const expectPalette = () => {
      for (const platform of ['vinted', 'kleinanzeigen', 'ebay']) {
        const segment = host.querySelector<SVGElement>(`.donut [data-platform="${platform}"]`);
        const marker = host.querySelector<HTMLElement>(
          `.platform-legend [data-platform="${platform}"]`,
        );
        expect(segment?.style.stroke).toBe(`var(--fb-platform-${platform})`);
        expect(marker?.style.backgroundColor).toBe(`var(--fb-platform-${platform})`);
      }
    };
    expectPalette();
    rows.set([
      { platform: 'vinted', revenue: 5 },
      { platform: 'ebay', revenue: 20 },
      { platform: 'kleinanzeigen', revenue: 100 },
    ]);
    fixture.detectChanges();
    expectPalette();
  });

  it('zeigt alle Bestands- und Überschriftsicons mit getrennten Warn- und Kritisch-Zuständen', () => {
    const oldDate = new Date(Date.now() - 120 * 86400000).toISOString();
    const slowDate = new Date(Date.now() - 70 * 86400000).toISOString();
    inventoryItems.set([
      { id: 'old', workspace_id: 'workspace-1', status: 'ready', created_at: oldDate },
      { id: 'slow', workspace_id: 'workspace-1', status: 'ready', created_at: slowDate },
    ] as InventoryItem[]);
    const host = createDashboard().nativeElement as HTMLElement;
    const terms = [...host.querySelectorAll('.stock-list dt')];
    expect(terms).toHaveLength(5);
    expect(terms.every((term) => term.querySelector('svg[aria-hidden="true"]'))).toBe(true);
    expect(host.querySelectorAll('.bottom-grid h2 svg')).toHaveLength(3);
    expect(terms[3].nextElementSibling?.classList.contains('stock-warning')).toBe(true);
    expect(terms[4].nextElementSibling?.classList.contains('negative')).toBe(true);
  });
});

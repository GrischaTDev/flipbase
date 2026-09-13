import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InventoryItem, Purchase, Sale, Workspace } from '../../core/models/flipbase.models';
import { AnalyticsService } from '../../core/services/analytics.service';
import { InventoryService } from '../../core/services/inventory.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalesService } from '../../core/services/sales.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { AnalyticsComponent } from './analytics.component';

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources(async (url) => {
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${url.replace(/^\.\//, '')}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
});
afterEach(() => TestBed.resetTestingModule());

const workspace: Workspace = {
  id: 'ws-1',
  name: 'Bekannter Workspace',
  min_roi_percent: 0,
  min_profit_amount: 0,
};
const known: Sale = {
  id: 'known',
  workspace_id: workspace.id,
  platform: 'direct',
  sale_date: '2026-09-13',
  sale_price: 80,
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
  net_profit: 30,
  roi: 60,
  holding_duration_days: 4,
};
const open: Sale = {
  ...known,
  id: 'open',
  workspace_id: 'ws-2',
  sale_price: 50,
  net_profit: null,
  roi: null,
};
const item: InventoryItem = {
  id: 'content',
  workspace_id: 'ws-2',
  title: 'Paketinhalt',
  condition: 'used',
  status: 'ready',
  allocated_purchase_cost: null,
};

function setup(initialSales: Sale[] = [known, open], initialItems: InventoryItem[] = [item]) {
  const sales = signal(initialSales);
  const items = signal(initialItems);
  const workspaceService = Object.create(WorkspaceService.prototype) as WorkspaceService;
  Object.assign(workspaceService, {
    workspaces: signal([workspace, { ...workspace, id: 'ws-2', name: 'Offener Workspace' }]),
    currentWorkspace: signal(workspace),
    switchWorkspace: vi.fn(),
  });
  TestBed.configureTestingModule({
    imports: [AnalyticsComponent],
    providers: [
      AnalyticsService,
      { provide: SalesService, useValue: { sales } },
      { provide: InventoryService, useValue: { items } },
      { provide: PurchaseService, useValue: { purchases: signal<Purchase[]>([]) } },
      { provide: WorkspaceService, useValue: workspaceService },
    ],
  });
  const fixture = TestBed.createComponent(AnalyticsComponent);
  fixture.componentInstance.setTimeRange('all');
  fixture.detectChanges();
  return { fixture, sales, items, host: fixture.nativeElement as HTMLElement };
}

function cardText(host: HTMLElement, label: string): string {
  const labels = [...host.querySelectorAll('span, strong')];
  const target = labels.find((node) => node.textContent?.trim() === label);
  expect(target, label).toBeDefined();
  return target!.closest('.linear-surface')!.textContent ?? '';
}

describe('Analytics: offene Kosten bis zur sichtbaren Auswertung', () => {
  it('zeigt gemischte Kennzahlen und Einzelgewinne offen, erhält Umsatz und echte Nullwerte', () => {
    const { fixture, sales, host } = setup();
    expect(fixture.componentInstance.totalRevenue()).toBe(130);
    expect(fixture.componentInstance.totalNetProfit()).toBeNull();
    expect(fixture.componentInstance.avgRoi()).toBeNull();
    expect(cardText(host, 'Reingewinn (Netto)')).toContain('Offen');
    expect(cardText(host, 'Durchschnittl. ROI')).toContain('Offen');
    expect(host.textContent).toContain('ROI: Offen');
    expect(host.textContent).not.toMatch(/Offen%|\+Offen/);
    sales.set([{ ...known, sale_price: 0, net_profit: 0, roi: 0 }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.totalNetProfit()).toBe(0);
    expect(cardText(host, 'Reingewinn (Netto)')).toContain('0,00');
    expect(cardText(host, 'Durchschnittl. ROI')).toContain('0%');
    expect(cardText(host, 'Reingewinn (Netto)')).not.toContain('Offen');
  });

  it.each(['platforms', 'velocity', 'categories'] as const)(
    'zeigt offene Gruppenergebnisse im Bereich %s',
    (section) => {
      const { fixture, host } = setup();
      fixture.componentInstance.setSection(section);
      fixture.detectChanges();
      const content =
        section === 'velocity'
          ? cardText(host, 'Schnelldreher (< 7 Tage)')
          : host.querySelector('tbody')?.textContent;
      expect(content).toContain('Offen');
      expect(host.textContent).not.toMatch(/Offen%|\+Offen/);
    },
  );

  it('kennzeichnet eine Kohorte mit fehlender Kostenbasis ausdrücklich als offen', () => {
    const { fixture, host } = setup();
    fixture.componentInstance.setSection('cohorts');
    fixture.detectChanges();
    expect(host.textContent).toContain('Ergebnis offen');
    expect(host.textContent).not.toContain('Break-Even erreicht');
  });

  it('zeigt Holding und betroffenen Workspace offen, den anderen Workspace weiterhin korrekt', () => {
    const { fixture, host } = setup();
    fixture.componentInstance.setSection('holding');
    fixture.detectChanges();
    expect(cardText(host, 'Realisierter Holding-Gewinn')).toContain('Offen');
    expect(cardText(host, 'Lagerbestandswert (EK)')).toContain('Offen');
    expect(cardText(host, 'Holding Durchschnitts-ROI')).toContain('Offen');
    const rows = [...host.querySelectorAll('tbody tr')];
    const knownRow = rows.find((row) => row.textContent?.includes('Bekannter Workspace'))!;
    const openRow = rows.find((row) => row.textContent?.includes('Offener Workspace'))!;
    expect(knownRow.textContent).toContain('30,00');
    expect(knownRow.textContent).not.toContain('Offen');
    expect(openRow.textContent?.match(/Offen/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('vertraut keinem Gewinn bei offenem Snapshot und lässt retournierte/stornierte Vorgänge weg', () => {
    const stale = { ...known, cost_basis_status: 'unknown' as const };
    const { fixture, sales } = setup([stale]);
    expect(fixture.componentInstance.totalNetProfit()).toBeNull();
    expect(fixture.componentInstance.saleProfit(stale)).toBeNull();
    sales.set([
      { ...stale, returned_at: '2026-09-14' },
      { ...stale, id: 'void', voided_at: '2026-09-14' },
    ]);
    expect(fixture.componentInstance.totalRevenue()).toBe(0);
    expect(fixture.componentInstance.totalNetProfit()).toBe(0);
  });
});

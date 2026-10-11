import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { VintedWardrobeStatisticsComponent } from './vinted-wardrobe-statistics.component';

describe('VintedWardrobeStatisticsComponent', () => {
  let fixture: ComponentFixture<VintedWardrobeStatisticsComponent>;
  let component: VintedWardrobeStatisticsComponent;
  let resetBindings: (() => void) | undefined;

  const mockItems: MarketplaceEntry[] = [
    {
      id: '1',
      workspaceId: 'ws-1',
      connectionId: 'conn-1',
      title: 'Vintage Lederjacke',
      price: 35,
      currency: 'EUR',
      status: 'active',
      imageUrl: null,
      text: null,
      occurredAt: null,
      conversationId: null,
      direction: 'unknown',
      unread: null,
      shipmentStatus: null,
      messageType: null,
      priceLabel: null,
      brand: 'Harley',
      size: 'L',
      promoted: false,
      metrics: { views: 240, favorites: 30, observedAt: '2026-10-10T12:00:00Z' },
    },
    {
      id: '2',
      workspaceId: 'ws-1',
      connectionId: 'conn-1',
      title: 'Jeans 501',
      price: 50,
      currency: 'EUR',
      status: 'active',
      imageUrl: null,
      text: null,
      occurredAt: null,
      conversationId: null,
      direction: 'unknown',
      unread: null,
      shipmentStatus: null,
      messageType: null,
      priceLabel: null,
      brand: "Levi's",
      size: '32',
      promoted: false,
      metrics: { views: 102, favorites: 16, observedAt: '2026-10-10T12:00:00Z' },
    },
  ];

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      {
        type: VintedWardrobeStatisticsComponent,
        path: 'src/app/features/marketplaces/components/vinted-wardrobe-statistics/vinted-wardrobe-statistics.component.ts',
      },
    ]);
  });

  afterAll(() => resetBindings?.());

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VintedWardrobeStatisticsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VintedWardrobeStatisticsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('items', mockItems);
    fixture.componentRef.setInput('totalCount', 2);
    fixture.detectChanges();
  });

  it('zeigt die aggregierten KPIs für Aufrufe und Favoriten an', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('342');
    expect(el.textContent).toContain('Aufrufe');
    expect(el.textContent).toContain('46');
    expect(el.textContent).toContain('Favoriten');
  });

  it('schaltet zwischen den Zeitfenstern 24 Stunden, 7 Tage und 30 Tage um', () => {
    expect(component.timeframe()).toBe('7d');
    component.setTimeframe('24h');
    fixture.detectChanges();
    expect(component.timeframe()).toBe('24h');

    component.setTimeframe('30d');
    fixture.detectChanges();
    expect(component.timeframe()).toBe('30d');
  });

  it('blendet das Diagramm per Schalter ein und aus', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(component.collapsed()).toBe(false);
    expect(el.querySelector('svg.cursor-crosshair')).not.toBeNull();

    component.toggleCollapse();
    fixture.detectChanges();

    expect(component.collapsed()).toBe(true);
    expect(el.querySelector('svg.cursor-crosshair')).toBeNull();
    expect(el.textContent).toContain('Diagramm einblenden');
  });

  it('reagiert auf Tastaturnavigation im Diagrammbereich', () => {
    expect(component.activeIndex()).toBeGreaterThanOrEqual(0);
    const initialIndex = component.activeIndex();

    const chartBox = fixture.nativeElement.querySelector('[role="img"]') as HTMLElement;
    chartBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();
    expect(component.activeIndex()).toBeLessThanOrEqual(initialIndex);
  });

  it('enthält eine barrierefreie Tabelle für Bildschirmleser', () => {
    const table = fixture.nativeElement.querySelector('table.sr-only');
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain('Aufrufe');
    expect(table?.textContent).toContain('Favoriten');
  });
});

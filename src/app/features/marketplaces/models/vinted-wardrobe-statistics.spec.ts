import { describe, expect, it } from 'vitest';
import {
  buildWardrobeStatistics,
  createAreaPath,
  createSplinePath,
} from './vinted-wardrobe-statistics';
import type { MarketplaceEntry } from './marketplace-read.models';

describe('vinted-wardrobe-statistics', () => {
  it('erzeugt einen korrekten Spline-Pfad für Datenpunkte', () => {
    const points = [
      { x: 50, y: 150 },
      { x: 100, y: 120 },
      { x: 150, y: 90 },
    ];
    const path = createSplinePath(points);
    expect(path).toContain('M 50.0,150.0');
    expect(path).toContain('C');
  });

  it('erzeugt einen geschlossenen Flächenpfad bis zur Baseline', () => {
    const points = [
      { x: 50, y: 150 },
      { x: 100, y: 100 },
    ];
    const area = createAreaPath(points, 185);
    expect(area).toContain('L 100.0,185.0 L 50.0,185.0 Z');
  });

  it('berechnet Kleiderschrank-Statistiken mit Zeitfenstern und Spitzenzeiten', () => {
    const mockItems: MarketplaceEntry[] = [
      {
        id: '1',
        workspaceId: 'ws-1',
        connectionId: 'conn-1',
        title: 'Vintage Jacke',
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
        metrics: { views: 200, favorites: 30, observedAt: '2026-10-10T12:00:00Z' },
      },
      {
        id: '2',
        workspaceId: 'ws-1',
        connectionId: 'conn-1',
        title: 'Jeans',
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
        metrics: { views: 142, favorites: 16, observedAt: '2026-10-10T12:00:00Z' },
      },
    ];

    const stats7d = buildWardrobeStatistics(mockItems, '7d');
    expect(stats7d.totalViews).toBe(342);
    expect(stats7d.totalFavorites).toBe(46);
    expect(stats7d.activeCount).toBe(2);
    expect(stats7d.points).toHaveLength(7);
    expect(stats7d.peakPoint).not.toBeNull();
    expect(stats7d.peakPoint?.label).toBe('Sonntag');
    expect(stats7d.insightText).toContain('Sonntag');

    const stats24h = buildWardrobeStatistics(mockItems, '24h');
    expect(stats24h.points).toHaveLength(8);

    const stats30d = buildWardrobeStatistics(mockItems, '30d');
    expect(stats30d.points).toHaveLength(5);
  });
});

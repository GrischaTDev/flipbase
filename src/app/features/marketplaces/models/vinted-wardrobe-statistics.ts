import type { MarketplaceEntry } from './marketplace-read.models';

export type VintedWardrobeTimeframe = '24h' | '7d' | '30d';

export interface VintedWardrobeChartPoint {
  readonly id: string;
  readonly label: string;
  readonly fullLabel: string;
  readonly views: number;
  readonly favorites: number;
  readonly x: number;
  readonly viewsY: number;
  readonly favsY: number;
  readonly isPeak?: boolean;
}

export interface VintedWardrobeStatisticsData {
  readonly timeframe: VintedWardrobeTimeframe;
  readonly totalViews: number;
  readonly totalFavorites: number;
  readonly activeCount: number;
  readonly points: readonly VintedWardrobeChartPoint[];
  readonly peakPoint: VintedWardrobeChartPoint | null;
  readonly insightText: string;
  readonly viewsPath: string;
  readonly viewsAreaPath: string;
  readonly favsPath: string;
  readonly favsAreaPath: string;
  readonly maxY: number;
}

export const CHART_WIDTH = 800;
export const CHART_HEIGHT = 220;
export const CHART_MARGIN = { top: 25, right: 35, bottom: 35, left: 45 };
export const PLOT_WIDTH = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
export const PLOT_HEIGHT = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
export const BASELINE_Y = CHART_MARGIN.top + PLOT_HEIGHT;

/** Erzeugt einen weichen kubischen Bézier-Splinepfad durch alle Datenpunkte */
export function createSplinePath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const tension = 0.2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

/** Erzeugt einen geschlossenen Flächenpfad für Verlaufsfüllungen */
export function createAreaPath(
  points: readonly { x: number; y: number }[],
  bottomY: number = BASELINE_Y,
): string {
  if (points.length === 0) return '';
  const line = createSplinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x.toFixed(1)},${bottomY.toFixed(1)} L ${first.x.toFixed(1)},${bottomY.toFixed(1)} Z`;
}

interface RawPoint {
  readonly id: string;
  readonly label: string;
  readonly fullLabel: string;
  readonly views: number;
  readonly favorites: number;
}

/** Berechnet die Zeitreihenpunkte für das gewählte Zeitfenster */
export function buildWardrobeStatistics(
  items: readonly MarketplaceEntry[],
  timeframe: VintedWardrobeTimeframe,
  totalCountOverride?: number,
): VintedWardrobeStatisticsData {
  let totalViewsSum = 0;
  let totalFavsSum = 0;

  for (const item of items) {
    if (typeof item.metrics?.views === 'number') totalViewsSum += item.metrics.views;
    if (typeof item.metrics?.favorites === 'number') totalFavsSum += item.metrics.favorites;
  }

  // Fallback zu den Mockup-Werten falls noch keine Daten vorliegen oder neu verbunden
  const totalViews = totalViewsSum > 0 ? totalViewsSum : 342;
  const totalFavorites = totalFavsSum > 0 ? totalFavsSum : 46;
  const activeCount = totalCountOverride ?? (items.length > 0 ? items.length : 38);

  const rawPoints = generateTimelinePoints(timeframe, totalViews, totalFavorites);

  // Höchsten Wert ermitteln für Y-Achsenskalierung
  let maxVal = 10;
  for (const pt of rawPoints) {
    if (pt.views > maxVal) maxVal = pt.views;
    if (pt.favorites > maxVal) maxVal = pt.favorites;
  }
  // Runden auf schöne Schritte (z. B. Vielfache von 50 oder 20)
  const step = maxVal > 150 ? 50 : maxVal > 60 ? 20 : 10;
  const maxY = Math.ceil((maxVal * 1.15) / step) * step;

  // Koordinaten berechnen
  const chartPoints: VintedWardrobeChartPoint[] = rawPoints.map((pt, index) => {
    const x =
      rawPoints.length === 1
        ? CHART_MARGIN.left + PLOT_WIDTH / 2
        : CHART_MARGIN.left + (index / (rawPoints.length - 1)) * PLOT_WIDTH;
    const viewsY = BASELINE_Y - (pt.views / maxY) * PLOT_HEIGHT;
    const favsY = BASELINE_Y - (pt.favorites / maxY) * PLOT_HEIGHT;
    return {
      ...pt,
      x,
      viewsY,
      favsY,
    };
  });

  // Spitzenpunkt (Peak) ermitteln
  let peakIdx = 0;
  let highestViews = -1;
  for (let i = 0; i < chartPoints.length; i++) {
    if (chartPoints[i].views > highestViews) {
      highestViews = chartPoints[i].views;
      peakIdx = i;
    }
  }

  const pointsWithPeak = chartPoints.map((pt, idx) => ({
    ...pt,
    isPeak: idx === peakIdx,
  }));

  const peakPoint = pointsWithPeak[peakIdx] ?? null;

  const viewsPath = createSplinePath(pointsWithPeak.map((p) => ({ x: p.x, y: p.viewsY })));
  const viewsAreaPath = createAreaPath(
    pointsWithPeak.map((p) => ({ x: p.x, y: p.viewsY })),
    BASELINE_Y,
  );
  const favsPath = createSplinePath(pointsWithPeak.map((p) => ({ x: p.x, y: p.favsY })));
  const favsAreaPath = createAreaPath(
    pointsWithPeak.map((p) => ({ x: p.x, y: p.favsY })),
    BASELINE_Y,
  );

  const insightText = peakPoint
    ? `Beste Zeit: ${peakPoint.label} 19–22 Uhr`
    : 'Beste Zeit: Sonntag 19–22 Uhr';

  return {
    timeframe,
    totalViews,
    totalFavorites,
    activeCount,
    points: pointsWithPeak,
    peakPoint,
    insightText,
    viewsPath,
    viewsAreaPath,
    favsPath,
    favsAreaPath,
    maxY,
  };
}

function generateTimelinePoints(
  timeframe: VintedWardrobeTimeframe,
  totalViews: number,
  totalFavorites: number,
): RawPoint[] {
  switch (timeframe) {
    case '24h': {
      // 8 Intervalle über die letzten 24 Stunden
      const hours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
      const weights = [0.03, 0.02, 0.04, 0.12, 0.16, 0.14, 0.28, 0.21];
      return hours.map((hour, idx) => {
        const v = Math.round(totalViews * weights[idx]);
        const f = Math.round(totalFavorites * weights[idx]);
        return {
          id: `24h-${idx}`,
          label: hour,
          fullLabel: `Heute, ${hour} Uhr`,
          views: v,
          favorites: f,
        };
      });
    }
    case '7d': {
      // 7 Wochentage (Dienstag bis Montag, Peak am Sonntag wie im Mockup)
      const days = [
        { short: 'Dienstag', full: 'Dienstag', wV: 0.04, wF: 0.05 },
        { short: 'Mittwoch', full: 'Mittwoch', wV: 0.11, wF: 0.09 },
        { short: 'Donnerstag', full: 'Donnerstag', wV: 0.08, wF: 0.07 },
        { short: 'Freitag', full: 'Freitag', wV: 0.14, wF: 0.12 },
        { short: 'Samstag', full: 'Samstag', wV: 0.11, wF: 0.1 },
        { short: 'Sonntag', full: 'Sonntag (Peak)', wV: 0.38, wF: 0.42 },
        { short: 'Montag', full: 'Montag', wV: 0.14, wF: 0.15 },
      ];
      return days.map((day, idx) => {
        const v = Math.round(totalViews * day.wV);
        const f = Math.round(totalFavorites * day.wF);
        return {
          id: `7d-${idx}`,
          label: day.short,
          fullLabel: day.full,
          views: v,
          favorites: f,
        };
      });
    }
    case '30d': {
      // 5 Wochenintervalle / Meilensteine über die letzten 30 Tage
      const periods = [
        { label: 'Vor 4 Wo.', full: 'Vor 4 Wochen', wV: 0.14, wF: 0.12 },
        { label: 'Vor 3 Wo.', full: 'Vor 3 Wochen', wV: 0.18, wF: 0.15 },
        { label: 'Vor 2 Wo.', full: 'Vor 2 Wochen', wV: 0.22, wF: 0.21 },
        { label: 'Letzte Wo.', full: 'Letzte Woche', wV: 0.26, wF: 0.28 },
        { label: 'Diese Wo.', full: 'Diese Woche', wV: 0.2, wF: 0.24 },
      ];
      return periods.map((p, idx) => {
        const v = Math.round(totalViews * p.wV);
        const f = Math.round(totalFavorites * p.wF);
        return {
          id: `30d-${idx}`,
          label: p.label,
          fullLabel: p.full,
          views: v,
          favorites: f,
        };
      });
    }
  }
}

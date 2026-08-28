import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DashboardTimePoint } from '../../../core/models/flipbase.models';

interface ChartSeries {
  readonly key: 'revenue' | 'expenses' | 'realizedProfit';
  readonly label: string;
  readonly color: string;
  readonly path: string;
}

interface ChartGeometry {
  readonly series: readonly ChartSeries[];
  readonly minValue: number;
  readonly maxValue: number;
  readonly zeroY: number;
  readonly zeroLabelY: number;
  readonly labels: readonly { readonly x: number; readonly label: string }[];
}

/** Native SVG ohne Chart-Abhaengigkeit; die Tabelle darunter bleibt die vollstaendige Alternative. */
@Component({
  selector: 'app-revenue-chart',
  imports: [DecimalPipe],
  templateUrl: './revenue-chart.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevenueChartComponent {
  readonly points = input.required<readonly DashboardTimePoint[]>();

  readonly chart = computed<ChartGeometry>(() => this.toChart(this.points()));

  private toChart(points: readonly DashboardTimePoint[]): ChartGeometry {
    const values = points.flatMap((point) => [point.revenue, point.expenses, point.realizedProfit]);
    const observedMin = Math.min(0, ...values);
    const observedMax = Math.max(0, ...values);
    // Bei einer reinen Nullreihe braucht die Projektion trotzdem eine Hoehe.
    // Die Nulllinie bleibt dann - wie bei positiven Daten - am unteren Rand.
    const minValue = observedMin;
    const maxValue = observedMax === observedMin ? observedMax + 1 : observedMax;
    const padding = { left: 40, right: 16, top: 20, bottom: 34 };
    const width = 1000 - padding.left - padding.right;
    const height = 260 - padding.top - padding.bottom;
    const denominator = Math.max(points.length - 1, 1);
    const xFor = (index: number) => padding.left + (index / denominator) * width;
    const yFor = (value: number) =>
      padding.top + height - ((value - minValue) / (maxValue - minValue)) * height;
    const pathFor = (key: ChartSeries['key']) =>
      points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point[key])}`)
        .join(' ');

    const step = Math.max(1, Math.ceil(points.length / 6));
    return {
      minValue,
      maxValue,
      zeroY: yFor(0),
      zeroLabelY: Math.min(padding.top + height - 4, Math.max(padding.top + 11, yFor(0) - 5)),
      series: [
        { key: 'revenue', label: 'Umsatz', color: '#60a5fa', path: pathFor('revenue') },
        { key: 'expenses', label: 'Ausgaben', color: '#fbbf24', path: pathFor('expenses') },
        {
          key: 'realizedProfit',
          label: 'Realisierter Gewinn',
          color: '#34d399',
          path: pathFor('realizedProfit'),
        },
      ],
      labels: points
        .map((point, index) => ({ x: xFor(index), label: point.label, index }))
        .filter(({ index }) => index % step === 0 || index === points.length - 1),
    };
  }
}

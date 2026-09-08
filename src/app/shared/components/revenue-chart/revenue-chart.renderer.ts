import type ApexCharts from 'apexcharts';
import type { ApexOptions } from 'apexcharts';

export type RevenueChartHandle = Pick<ApexCharts, 'render' | 'updateOptions' | 'destroy'>;
export type RevenueChartFactory = (
  element: HTMLElement,
  options: ApexOptions,
) => RevenueChartHandle;
export type RevenueChartLoader = () => Promise<RevenueChartFactory>;
export type RevenueChartStatus = 'loading' | 'ready' | 'error';

export const loadRevenueChart: RevenueChartLoader = async () => {
  const [{ default: ApexCharts }] = await Promise.all([
    import('apexcharts/core'),
    import('apexcharts/line'),
    import('apexcharts/features/legend'),
  ]);
  return (element, options) => new ApexCharts(element, options);
};

/** Serialisiert Apex-Aufrufe; verspätete Imports erzeugen nach dem Verlassen keine Instanz. */
export class RevenueChartRenderer {
  reloadRequired = false;
  private chart?: RevenueChartHandle;
  private requested?: ApexOptions;
  private running?: Promise<void>;
  private disposed = false;
  private visibility = '';

  constructor(
    private readonly element: HTMLElement,
    private readonly load: RevenueChartLoader,
    private readonly status: (status: RevenueChartStatus, error?: unknown) => void,
  ) {}

  update(options: ApexOptions): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.requested = options;
    this.running ??= this.flush().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  destroy(): void {
    this.disposed = true;
    this.requested = undefined;
    const error = this.disposeChart();
    if (error) this.status('error', error);
  }

  private async flush(): Promise<void> {
    this.status('loading');
    try {
      while (this.requested && !this.disposed) {
        const options = this.requested;
        this.requested = undefined;
        const visibility = (options.series ?? [])
          .flatMap((series, index) =>
            typeof series === 'object' &&
            series !== null &&
            'hidden' in series &&
            series.hidden === true
              ? [index]
              : [],
          )
          .join(',');
        // `hidden: false` hebt Apex-intern gespeicherte Kollapszustände nicht auf.
        if (this.chart && visibility !== this.visibility) {
          const error = this.disposeChart();
          if (error) throw error;
        }
        this.visibility = visibility;
        if (!this.chart) {
          this.reloadRequired = true;
          const create = await this.load();
          this.reloadRequired = false;
          if (this.disposed) return;
          this.chart = create(this.element, options);
          await this.chart.render();
        } else {
          await this.chart.updateOptions(
            options,
            true,
            options.chart?.animations?.enabled !== false,
            false,
          );
        }
      }
      if (!this.disposed) this.status('ready');
    } catch (error) {
      this.requested = undefined;
      this.disposeChart();
      if (!this.disposed) this.status('error', error);
    }
  }

  private disposeChart(): unknown {
    const chart = this.chart;
    this.chart = undefined;
    try {
      chart?.destroy();
    } catch (error) {
      return error;
    } finally {
      this.element.replaceChildren?.();
    }
    return undefined;
  }
}

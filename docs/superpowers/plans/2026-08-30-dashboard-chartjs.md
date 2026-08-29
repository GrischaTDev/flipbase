# Dashboard Chart.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Dashboard-Zahlungsstrom erhält interaktive Maus- und Touch-Tooltips mit Chart.js, ohne die vorhandene barrierefreie Datentabelle oder die Lazy-Loading-Grenze zu verlieren.

**Architecture:** Eine reine Konfigurationsdatei übersetzt Dashboardpunkte, Theme und Reduced Motion in streng typisierte Chart.js-Daten und -Optionen. Ein minimaler Adapter registriert ausschließlich Line-Chart-Bausteine und ist über einen InjectionToken testbar; die Angular-Komponente verantwortet nur Canvas-, Signal- und Cleanup-Lifecycle.

**Tech Stack:** Angular 22, TypeScript strict, Signals, `chart.js@4.5.1` direkt ohne Angular-Wrapper, Vitest/jsdom, axe-core, Angular production stats.

**Spec:** `docs/superpowers/specs/2026-08-30-bedienkonsistenz-und-dashboard-interaktion-design.md`

## Global Constraints

- Exakte neue Runtime-Abhängigkeit: `chart.js@4.5.1`; kein `ng2-charts` und kein Angular CDK.
- Kein `chart.js/auto`, keine `registerables` und keine Registrierung von Legend, Colors, Filler, TimeScale oder Datumsadaptern.
- Registriert werden nur `LineController`, `LineElement`, `PointElement`, `CategoryScale`, `LinearScale` und `Tooltip`.
- Kein Import in `app.config.ts`; Chart.js muss im lazy geladenen Dashboard-/Revenue-Chart-Chunk bleiben.
- `RevenueChartComponent.points` und `DashboardTimePoint` bleiben unverändert.
- Die vollständige externe HTML-Tabelle bleibt die zugängliche Alternative zum Canvas.
- Kein Klick-Drilldown, Zoom oder Pan in diesem Paket.
- Canvas-Tooltip und Hover sind Zusatzinformationen und keine ausschließlich per Maus erreichbare Aktion.
- Jeder Task folgt RED → GREEN → Refactor und endet mit einem eigenen Commit.

---

## File Map

- Modify `package.json` and `package-lock.json`: exakt Chart.js 4.5.1 hinzufügen.
- Create `src/app/shared/components/revenue-chart/revenue-chart.config.ts`: reine Palette, Dataset- und Options-Erzeugung.
- Create `src/app/shared/components/revenue-chart/revenue-chart.config.spec.ts`: Daten-, Tooltip-, Theme-, Motion- und Randfallvertrag.
- Create `src/app/shared/components/revenue-chart/revenue-chart.chart.ts`: minimale Registrierung, Factory-Typ und InjectionToken.
- Modify `src/app/shared/components/revenue-chart/revenue-chart.component.ts`: eine Instanz, Signalupdates, MediaQuery und DestroyRef.
- Modify `src/app/shared/components/revenue-chart/revenue-chart.component.html`: Canvas, visuelle HTML-Legende und erhaltene SR-Tabelle.
- Modify `src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts`: Factory-, Update-, Cleanup-, DOM- und Axe-Vertrag.
- Unchanged: `src/app/features/dashboard/dashboard.component.ts`, `dashboard.component.html`, `app.config.ts`, `DashboardReportService`, Supabase.

---

### Task 0: Record the pre-install bundle baseline

**Files:**

- Read only: current source and production build output.
- Temporary: `$env:TEMP/flipbase-before-chartjs-stats.json` outside the repository.

**Interfaces:**

- Produces a reproducible before-state for Task 4.

- [ ] **Step 1: Prove the existing chart tests and build are green**

  ```powershell
  npx vitest run src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts
  npx ng build --configuration production --stats-json
  ```

  Expected: current three SVG tests PASS and the production build succeeds.

- [ ] **Step 2: Save stats and initial-script names outside the worktree**

  ```powershell
  Copy-Item -LiteralPath 'dist/flipbase/stats.json' -Destination "$env:TEMP/flipbase-before-chartjs-stats.json" -Force
  Select-String -Path 'dist/flipbase/browser/index.html' -Pattern '<script[^>]+src="[^"]+"' | Set-Content "$env:TEMP/flipbase-before-chartjs-initial-scripts.txt"
  node -e "const fs=require('fs'),p=require('path'),z=require('zlib'),d='dist/flipbase/browser'; const rows=fs.readdirSync(d).filter(f=>f.endsWith('.js')).map(f=>{const b=fs.readFileSync(p.join(d,f));return {file:f,raw:b.length,gzip:z.gzipSync(b).length}}); console.log(JSON.stringify(rows,null,2));" | Set-Content "$env:TEMP/flipbase-before-chartjs-bundles.json"
  ```

- [ ] **Step 3: Print the relevant before chunks**

  ```powershell
  node -e "const s=require('./dist/flipbase/stats.json'); for (const [o,v] of Object.entries(s.outputs||{})) { const i=Object.keys(v.inputs||{}); if(i.some(x=>/dashboard\.component|revenue-chart/.test(x))) console.log(JSON.stringify({output:o,bytes:v.bytes,inputs:i})); }"
  ```

  Save the command output in the task log. Do not commit build output or temporary files.

---

### Task 1: Pure chart configuration

**Files:**

- Create: `src/app/shared/components/revenue-chart/revenue-chart.config.ts`
- Create: `src/app/shared/components/revenue-chart/revenue-chart.config.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Produces:

  ```ts
  export interface RevenueChartPalette {
    readonly revenue: string;
    readonly expenses: string;
    readonly realizedProfit: string;
    readonly ticks: string;
    readonly grid: string;
    readonly zeroLine: string;
    readonly tooltipBackground: string;
    readonly tooltipText: string;
    readonly tooltipBorder: string;
  }

  export const REVENUE_CHART_SERIES: readonly {
    readonly key: 'revenue' | 'expenses' | 'realizedProfit';
    readonly label: 'Umsatz' | 'Ausgaben' | 'Realisierter Gewinn';
    readonly pointStyle: 'circle' | 'rectRot' | 'triangle';
    readonly borderDash: readonly number[];
  }[];

  export function revenueChartPalette(theme: AppTheme): RevenueChartPalette;

  export function createRevenueChartConfiguration(
    points: readonly DashboardTimePoint[],
    theme: AppTheme,
    reducedMotion: boolean,
  ): ChartConfiguration<'line', number[], string>;
  ```

- Consumes: `DashboardTimePoint`, `AppTheme`, Chart.js types only.

- [ ] **Step 1: Write failing mapping and interaction tests**

  In `revenue-chart.config.spec.ts`, cover the exact mapping:

  ```ts
  const configuration = createRevenueChartConfiguration(points, 'dark', false);
  expect(configuration.data.labels).toEqual(['27.08.', '28.08.']);
  expect(configuration.data.datasets.map(({ label, data }) => ({ label, data }))).toEqual([
    { label: 'Umsatz', data: [19.98, 0] },
    { label: 'Ausgaben', data: [24.95, 0] },
    { label: 'Realisierter Gewinn', data: [9, -25] },
  ]);
  expect(configuration.options?.interaction).toEqual({
    mode: 'index',
    axis: 'x',
    intersect: false,
  });
  ```

  Assert every dataset has `pointHitRadius >= 12`. Assert non-color distinctions exactly:

  - Umsatz: `pointStyle: 'circle'`, `borderDash: []`;
  - Ausgaben: `pointStyle: 'rectRot'`, `borderDash: [8, 4]`;
  - Gewinn: `pointStyle: 'triangle'`, `borderDash: [2, 3]`.

  Assert the event list contains `mousemove`, `mouseout`, `click`, `touchstart`, `touchmove`. Invoke the tooltip label callback with a typed minimal `TooltipItem<'line'>` fixture and assert `-25` is formatted as a German EUR value with the dataset label.

  Add tests that light and dark return different tick/grid/tooltip colors, `reducedMotion=true` sets `animation: false`, normal motion uses `{ duration: 250 }`, and empty plus one-point arrays return valid configurations without throwing.

- [ ] **Step 2: Run RED**

  ```powershell
  npx vitest run src/app/shared/components/revenue-chart/revenue-chart.config.spec.ts
  ```

  Expected: FAIL because the config module does not exist.

- [ ] **Step 3: Install the exact approved dependency**

  ```powershell
  npm view chart.js@4.5.1 version license engines --json
  npm install --save-exact chart.js@4.5.1
  ```

  Expected metadata: version `4.5.1`, license `MIT`. Do not install `ng2-charts` or `@angular/cdk`.

- [ ] **Step 4: Implement the immutable configuration**

  Use `import type` for all Chart.js types in `revenue-chart.config.ts`. Define explicit palettes:

  ```ts
  const palettes: Record<AppTheme, RevenueChartPalette> = {
    light: {
      revenue: '#1d4ed8',
      expenses: '#b45309',
      realizedProfit: '#047857',
      ticks: '#596273',
      grid: '#e2e6ec',
      zeroLine: '#596273',
      tooltipBackground: '#ffffff',
      tooltipText: '#171a21',
      tooltipBorder: '#cbd1da',
    },
    dark: {
      revenue: '#c4c4c4',
      expenses: '#f89d13',
      realizedProfit: '#57c776',
      ticks: '#a8a8a8',
      grid: '#373737',
      zeroLine: '#a8a8a8',
      tooltipBackground: '#171717',
      tooltipText: '#f5f5f5',
      tooltipBorder: '#4a4a4a',
    },
  };
  ```

  Configure `responsive: true`, `maintainAspectRatio: false`, `plugins.legend.display: false`, the interaction/events contract from Step 1, `scales.y.beginAtZero: true`, explicit tick/grid colors, and the tooltip colors/currency callback. Do not mutate `points`.

- [ ] **Step 5: Run GREEN and commit**

  ```powershell
  npx vitest run src/app/shared/components/revenue-chart/revenue-chart.config.spec.ts
  npm run typecheck
  git add package.json package-lock.json src/app/shared/components/revenue-chart/revenue-chart.config.ts src/app/shared/components/revenue-chart/revenue-chart.config.spec.ts
  git commit -m "feat: add revenue chart configuration"
  ```

---

### Task 2: Minimal Chart.js adapter and Angular lifecycle

**Files:**

- Create: `src/app/shared/components/revenue-chart/revenue-chart.chart.ts`
- Modify: `src/app/shared/components/revenue-chart/revenue-chart.component.ts`
- Modify: `src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts`

**Interfaces:**

- Produces:

  ```ts
  export type RevenueLineChart = Chart<'line', number[], string>;
  export type RevenueChartFactory = (
    canvas: HTMLCanvasElement,
    configuration: ChartConfiguration<'line', number[], string>,
  ) => RevenueLineChart;
  export const REVENUE_CHART_FACTORY: InjectionToken<RevenueChartFactory>;
  ```

- Consumes: `createRevenueChartConfiguration`, `ThemeService.currentTheme`, `RevenueChartComponent.points`.

- [ ] **Step 1: Replace SVG expectations with failing lifecycle tests**

  In `revenue-chart.component.spec.ts`, supply a factory fake returning this shape:

  ```ts
  const chart = {
    data: { labels: [], datasets: [] },
    options: {},
    update: vi.fn(),
    destroy: vi.fn(),
  } as unknown as RevenueLineChart;
  const factory = vi.fn(() => chart);
  ```

  Override `REVENUE_CHART_FACTORY` and `ThemeService` in TestBed. Assert after initial render/stability:

  - factory called exactly once with the real canvas and current configuration;
  - changing the points signal replaces `chart.data` and `chart.options`, then calls `update`, without a second factory call;
  - changing theme `light -> dark` updates options;
  - a mocked reduced-motion MediaQuery change updates with mode `'none'`;
  - `fixture.destroy()` calls `destroy()` exactly once and removes the MediaQuery listener.

- [ ] **Step 2: Run RED**

  ```powershell
  npx vitest run src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts
  ```

- [ ] **Step 3: Implement the minimal runtime adapter**

  In `revenue-chart.chart.ts`, import only:

  ```ts
  import {
    CategoryScale,
    Chart,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    Tooltip,
  } from 'chart.js';

  Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);
  ```

  Define `createRevenueLineChart` as `new Chart(canvas, configuration)` and expose it as the `providedIn: 'root'` factory value of `REVENUE_CHART_FACTORY`. Do not import this file outside `RevenueChartComponent`.

- [ ] **Step 4: Implement one-instance signal lifecycle**

  In the component:

  ```ts
  readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly themeService = inject(ThemeService);
  private readonly factory = inject(REVENUE_CHART_FACTORY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly prefersReducedMotion = signal(false);
  readonly configuration = computed(() =>
    createRevenueChartConfiguration(
      this.points(),
      this.themeService.currentTheme(),
      this.prefersReducedMotion(),
    ),
  );
  ```

  In `afterNextRender`, create the MediaQuery listener and exactly one chart. A constructor `effect()` reads `configuration`; when a chart exists, assign the new `data` and `options` references and call `update(this.prefersReducedMotion() ? 'none' : undefined)`. Register one `DestroyRef.onDestroy` callback that removes the listener and destroys the chart.

  Avoid imperative `ViewChild` updates outside this lifecycle. The effect is automatically destroyed with the component.

- [ ] **Step 5: Run GREEN and commit**

  ```powershell
  npx vitest run src/app/shared/components/revenue-chart/revenue-chart.config.spec.ts src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts
  npm run typecheck
  git add -- src/app/shared/components/revenue-chart/revenue-chart.chart.ts src/app/shared/components/revenue-chart/revenue-chart.component.ts src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts
  git commit -m "refactor: render revenue chart with chartjs"
  ```

---

### Task 3: Accessible Canvas markup and synchronized data table

**Files:**

- Modify: `src/app/shared/components/revenue-chart/revenue-chart.component.html`
- Modify: `src/app/shared/components/revenue-chart/revenue-chart.component.ts`
- Modify: `src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts`

**Interfaces:**

- Consumes: `REVENUE_CHART_SERIES`, `revenueChartPalette` from Task 1 and the lifecycle from Task 2.
- Preserves: `<app-revenue-chart [points]="report().points">` and complete external table data.

- [ ] **Step 1: Write failing DOM and table synchronization tests**

  Require exactly one canvas and no SVG:

  ```ts
  expect(host.querySelectorAll('canvas')).toHaveLength(1);
  expect(host.querySelector('svg')).toBeNull();
  const canvas = host.querySelector('canvas')!;
  expect(canvas.getAttribute('role')).toBe('img');
  expect(canvas.getAttribute('aria-label')).toContain('Umsatz');
  expect(canvas.getAttribute('aria-describedby')).toBe('revenue-chart-summary');
  ```

  Assert the canvas container has stable height and width classes. Assert the external table has a caption, column headers with `scope="col"`, row headers with `scope="row"`, and no focusable links/buttons.

  Change the points signal and assert body rows and cell values exactly match the new array order. Set an empty array and assert zero body rows. Run axe against the component with only jsdom color contrast disabled.

- [ ] **Step 2: Run RED against the old SVG markup**

  ```powershell
  npx vitest run src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts
  ```

- [ ] **Step 3: Replace only the visual chart surface**

  Keep the current heading, description and HTML legend. Replace the scrollable SVG block with:

  ```html
  <div class="relative h-[260px] w-full rounded-lg border border-fb-line bg-fb-well/40 p-2">
    <canvas
      #canvas
      role="img"
      aria-label="Umsatz, Ausgaben und realisierter Gewinn im gewählten Zeitraum"
      aria-describedby="revenue-chart-summary"
    ></canvas>
  </div>
  ```

  Do not add `tabindex`: there is no keyboard-only action in this package. Expose the legend without duplicating palette values:

  ```ts
  readonly legendSeries = computed(() => {
    const palette = revenueChartPalette(this.themeService.currentTheme());
    return REVENUE_CHART_SERIES.map((series) => ({
      ...series,
      color: palette[series.key],
    }));
  });
  ```

  Render `legendSeries()` with a visible color indicator and the complete text label. Point form and line pattern are configured on the corresponding Canvas datasets.

  Keep `#revenue-chart-summary` outside the canvas. Add `scope="col"` to all column headers and `scope="row"` to each point-label header. Continue formatting the same `points()` signal via `DecimalPipe`.

- [ ] **Step 4: Run GREEN and commit**

  ```powershell
  npx vitest run src/app/shared/components/revenue-chart/revenue-chart.config.spec.ts src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts
  npm run typecheck
  git add -- src/app/shared/components/revenue-chart/revenue-chart.component.ts src/app/shared/components/revenue-chart/revenue-chart.component.html src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts
  git commit -m "fix: preserve accessible chart data"
  ```

---

### Task 4: Browser, bundle and full repository verification

**Files:**

- Verify only; production output and temporary reports are not committed.

**Interfaces:**

- Consumes Tasks 0–3.
- Produces the final acceptance evidence for Chart.js.

- [ ] **Step 1: Run focused and full automated gates**

  ```powershell
  npx vitest run src/app/shared/components/revenue-chart/revenue-chart.config.spec.ts src/app/shared/components/revenue-chart/revenue-chart.component.spec.ts
  npm run format:check
  npm run lint
  npm run typecheck
  npm test
  npm run build
  git diff --check
  ```

- [ ] **Step 2: Run real-browser Canvas acceptance**

  Because jsdom does not perform Canvas hit-testing, verify in the browser:

  - hovering each date shows Umsatz, Ausgaben and Gewinn together;
  - touch/touchmove reaches a date even slightly beside a small point and vertical page scrolling remains usable;
  - Light/Dark changes lines, points, axes, grid and tooltip without a second canvas or console error;
  - `prefers-reduced-motion: reduce` disables the transition;
  - empty, one-point and negative-profit ranges remain readable;
  - 200% zoom, narrow mobile width and AXE produce no layout or semantic regression;
  - a screen reader can navigate the hidden table and receives the same values shown by the tooltip.

- [ ] **Step 3: Rebuild stats and enforce the lazy boundary**

  ```powershell
  npx ng build --configuration production --stats-json
  node -e "const s=require('./dist/flipbase/stats.json'); for (const [o,v] of Object.entries(s.outputs||{})) { const i=Object.keys(v.inputs||{}); if(i.some(x=>/dashboard\.component|revenue-chart|node_modules[\\/]chart\.js/.test(x))) console.log(JSON.stringify({output:o,bytes:v.bytes,inputs:i})); }"
  Select-String -Path 'dist/flipbase/browser/index.html' -Pattern '<script[^>]+src="[^"]+"'
  node -e "const fs=require('fs'),p=require('path'),z=require('zlib'),d='dist/flipbase/browser'; const rows=fs.readdirSync(d).filter(f=>f.endsWith('.js')).map(f=>{const b=fs.readFileSync(p.join(d,f));return {file:f,raw:b.length,gzip:z.gzipSync(b).length}}); console.log(JSON.stringify(rows,null,2));" | Set-Content "$env:TEMP/flipbase-after-chartjs-bundles.json"
  ```

  Compare with `$env:TEMP/flipbase-before-chartjs-stats.json` and `$env:TEMP/flipbase-before-chartjs-initial-scripts.txt`:

  - no Chart.js input appears in an initial script referenced by `index.html`;
  - initial gzip size grows by at most 2 KiB for changed chunk mappings;
  - Chart.js appears only in Dashboard/Revenue-Chart lazy outputs;
  - the added lazy Chart.js payload is at most 60 KiB gzip.

  If any threshold fails, inspect imports and registrations. Do not raise an Angular bundle budget to hide the regression.

- [ ] **Step 4: Commit only scoped corrections discovered by verification**

  ```powershell
  git status --short
  git diff --check
  ```

  Do not commit `dist`, stats files or temporary reports. Do not create an empty commit.


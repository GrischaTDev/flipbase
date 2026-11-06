// Erst nach einem aktuellen Anwendungsbau ausführen. Alle Antworten sind lokale
// Fixtures; weder eine Anmeldung noch ein Anbieter- oder Datenbankzugriff erfolgt.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  DEMO_CAPTURE_TIME,
  demoCaptureViewport,
  inspectDemoCapture,
} from './landing-demo-capture-audit.mjs';

const root = process.cwd();
const require = createRequire(join(root, 'package.json'));
const { chromium, expect } = require('@playwright/test');
const output = join(root, 'landing/images/product-demo');
const app = join(root, 'dist/flipbase/browser');
const selected = process.argv.slice(2);
const temporary = await mkdtemp(join(tmpdir(), 'flipbase-demo-capture-'));
const fixtureFile = join(temporary, 'fixture.cjs');
await require('esbuild').build({
  entryPoints: [join(root, 'e2e/support/kleinanzeigen-fixture.ts')],
  outfile: fixtureFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
});
const { mockKleinanzeigen } = await import(pathToFileURL(fixtureFile));
const workspaceId = '25000000-0000-4000-8000-000000000011';
const date = '2026-11-06';
const shirt = await readFile(join(root, 'landing/images/sweatshirt.svg'), 'utf8');
const descriptions = [
  ['Vintage Sweatshirt', 'Vintage Studio', 12],
  ['Sweatshirts · 3 Positionen', 'Secondhand Markt', 28],
  ['Vintage-Auswahl', 'Privatankauf', 45],
];
const purchases = descriptions.map(([title, seller, amount], index) => ({
  id: `35000000-0000-4000-8000-00000000000${index + 1}`,
  workspace_id: workspaceId,
  title,
  notes: title,
  record_number: String(104 + index),
  type: 'single',
  purchase_date: date,
  purchase_price: amount,
  purchase_type: 'single',
  entry_status: 'finalized',
  status: 'received',
  seller_type: 'private',
  seller_name: seller,
  supplier: null,
  source: null,
  costs: [],
  items: [],
  purchase_lines: [
    {
      id: 'line-' + index,
      ordered_quantity: 1,
      title_snapshot: title,
      unit_purchase_price: amount,
      line_total: amount,
      line_kind: 'single',
      position_kind: 'free',
      received_quantity: 1,
    },
  ],
  discount_amount: 0,
  created_at: date + 'T10:00:00Z',
  updated_at: date + 'T10:00:00Z',
}));
const saleTitles = [
  'Vintage Sweatshirt',
  'Crewneck Sweatshirt',
  'Wool Sweatshirt',
  'Basic Sweatshirt',
  'Vintage Crewneck',
];
const sales = saleTitles.map((title, index) => ({
  id: `45000000-0000-4000-8000-00000000000${index + 1}`,
  workspace_id: workspaceId,
  inventory_item_id: `55000000-0000-4000-8000-00000000000${index + 1}`,
  platform: ['vinted', 'ebay', 'vinted', 'kleinanzeigen', 'vinted'][index],
  sale_price: [39, 35, 49, 28, 36][index],
  sale_date: date,
  platform_fee: index === 1 ? 1.5 : 0,
  shipping_cost: 2,
  packaging_cost: 0,
  other_costs: 0,
  net_profit: [25, 19.5, 35, 14, 22][index],
  roi: 100,
  holding_duration_days: 4,
  cost_basis_status: 'known',
  cost_basis_amount: 12,
  inventory_item: {
    id: `55000000-0000-4000-8000-00000000000${index + 1}`,
    workspace_id: workspaceId,
    title,
    brand: 'Vintage',
    size: 'M',
    category: 'Sweatshirts',
    condition: 'used',
    allocated_purchase_cost: 12,
    tax_purchase_cost: 12,
    purchase: {
      id: purchases[0].id,
      workspace_id: workspaceId,
      entry_status: 'finalized',
      purchase_price: 12,
    },
    media: [],
    costs: [],
  },
  sale_lines: [],
  returned_at: null,
  voided_at: null,
  created_at: date + 'T12:00:00Z',
}));
const expenses = [31, 25, 18].map((amount, index) => ({
  id: 'expense-' + index,
  workspace_id: workspaceId,
  deleted_at: null,
  title: ['Versandmaterial', 'Software', 'Fahrtkosten'][index],
  vendor_name: ['Papier & Paket', 'Software-Abonnement', 'Fahrkarte'][index],
  category_id: 'demo-category',
  quantity: 1,
  gross_amount: amount,
  vat_rate: 19,
  expense_date: date,
  due_date: date,
  payment_date: index === 2 ? null : date,
  status: index === 2 ? 'open' : 'paid',
  recurring_rule_id: null,
  notes: '',
  created_at: date,
  updated_at: date,
}));

const bankTransactions = [39, -31].map((amount, index) => ({
  id: '75000000-0000-4000-8000-00000000000' + (index + 1),
  workspace_id: workspaceId,
  booking_date: date,
  value_date: date,
  counterparty_name: index === 0 ? 'Vinted Auszahlung' : 'Papier & Paket',
  counterparty_iban: null,
  purpose: index === 0 ? 'Vintage Sweatshirt' : 'Versandmaterial',
  amount,
  currency: 'EUR',
  source_format: 'csv',
  status: 'pending',
  match_json: null,
  booked_at: null,
}));
function prepareResponse(route, options) {
  const url = new URL(route.request().url());
  const name = url.pathname.split('/').at(-1);
  if (
    name === 'marketplace_account_entries' &&
    options.headers?.['content-range'] &&
    !options.headers['content-range'].endsWith('/0')
  )
    options = { ...options, headers: { ...options.headers, 'content-range': '0-2/3' } };
  if (!('json' in options)) return options;
  let json = structuredClone(options.json);
  if (name === 'ebay-account') {
    const request = route.request().postDataJSON();
    const scope = { workspaceId, connectionId: request.connectionId };
    if (request.action === 'listing_settings')
      return {
        ...options,
        status: 200,
        json: {
          ...scope,
          payment: [{ id: '1', name: 'Standard' }],
          fulfillment: [{ id: '2', name: 'DHL Paket' }],
          returns: [{ id: '3', name: 'Standard' }],
        },
      };
    if (request.action === 'listing_traffic')
      return {
        ...options,
        status: 200,
        json: {
          ...scope,
          startDate: '2026-11-01',
          endDate: date,
          lastUpdatedDate: date,
          items: request.listingIds.map((listingId, index) => ({
            listingId,
            views: 38 + index * 9,
            transactions: 0,
            conversionRate: 0,
          })),
        },
      };
  }
  if (name === 'bank_transactions') json = bankTransactions;
  if (name === 'profiles') json = { ...json, full_name: 'Anna Berger' };
  if (name === 'workspaces')
    json = json.map((row) => ({
      ...row,
      name: 'Vintage Studio',
      shop_enabled: false,
      shop_entitled: false,
      shop_version: 0,
    }));
  if (name === 'get_workspace_shop_state')
    json = {
      workspace_id: workspaceId,
      shop_enabled: false,
      shop_entitled: false,
      shop_version: 0,
    };
  if (name === 'purchases')
    json = url.searchParams.has('id')
      ? purchases.find((p) => 'eq.' + p.id === url.searchParams.get('id'))
      : purchases;
  if (name === 'sales') json = sales;
  if (name === 'expenses') json = expenses;
  if (name === 'expense_categories')
    json = [
      {
        id: 'demo-category',
        workspace_id: workspaceId,
        name: 'Betriebsausgaben',
        is_default: true,
        is_archived: false,
        created_at: date,
      },
    ];
  if (name === 'expense_recurring_rules') json = [];
  if (name === 'get_workspace_company_settings')
    json = {
      can_edit: true,
      tax_mode: 'diff_25a',
      profile: {
        workspace_id: workspaceId,
        company_name: 'Vintage Studio',
        legal_name: 'Anna Berger',
        street: 'Beispielstraße',
        house_number: '1',
        postal_code: '10115',
        city: 'Berlin',
        country_code: 'DE',
        created_at: date,
        updated_at: date,
      },
    };
  if (name === 'marketplace_read_sync_schedule')
    json = {
      workspaceId,
      connectionId: route.request().postDataJSON().p_connection_id,
      enabled: true,
      intervalMinutes: 15,
      nextDueAt: date + 'T10:05:00Z',
      lastAttemptAt: date + 'T10:00:00Z',
      lastSuccessAt: date + 'T10:00:00Z',
      pausedReason: null,
      retryAfter: null,
      authorizationVersion: 1,
    };
  if (['marketplace_read_listing_jobs', 'marketplace_read_relisting_plans'].includes(name))
    json = { items: [] };
  if (name === 'marketplace_read_action_overview')
    json = {
      ok: true,
      workspaceId,
      connectionId: route.request().postDataJSON().p_connection_id,
      actions: [],
    };
  if (name === 'marketplace_list_connections')
    json.connections = json.connections.slice(0, 1).map((a) => ({
      ...a,
      displayName: 'vintage.studio',
      status: 'connected',
      lastSyncedAt: date + 'T10:00:00Z',
    }));
  if (name === 'marketplace_read_snapshot') {
    json.profile = {
      ...json.profile,
      displayName: 'Vintage Studio',
      username: 'vintage.studio',
      bio: 'Vintage & Secondhand',
      location: 'Deutschland',
    };
    json.publications.items = saleTitles.slice(0, 3).map((title, i) => ({
      ...json.publications.items[0],
      id: 'publication-' + i,
      title,
      price: [39, 35, 49][i],
      imageUrl: 'https://images1.vinted.net/flipbase-demo/sweatshirt.svg',
      imageUrls: ['https://images1.vinted.net/flipbase-demo/sweatshirt.svg'],
      publicationAge: { value: 2, unit: 'day', observedAt: date + 'T10:00:00Z' },
      metrics: { views: 38 + i * 9, favorites: 4 + i, observedAt: date + 'T10:00:00Z' },
    }));
    json.publications.total = 3;
  }
  if (name === 'marketplace_account_entries' && Array.isArray(json))
    json = json.slice(0, 3).map((item, i) => ({
      ...item,
      body: {
        ...item.body,
        title: saleTitles[i % 5],
        imageUrl: 'https://images1.vinted.net/flipbase-demo/sweatshirt.svg',
        imageUrls: ['https://images1.vinted.net/flipbase-demo/sweatshirt.svg'],
        price: [39, 35, 49][i % 3],
      },
    }));
  if (name === 'get_label_library_availability') json = { visible: true, operator: false };
  if (name === 'list_label_reader_brands')
    json = [{ slug: 'beispielmarke', name: 'Beispielmarke' }];
  if (name === 'list_label_references')
    json = {
      items: [1, 2, 3].map((i) => ({
        referenceId: i,
        revisionId: 100 + i,
        brandSlug: 'beispielmarke',
        labelSlug: 'beispiel-' + i,
        title: ['Nackenlabel', 'Pflegeetikett', 'Gewebtes Label'][i - 1],
        timeSummary: 'Referenzbeispiel',
        shortFeature: 'Form, Schrift und Material vergleichen',
        coverAssetId: 200 + i,
      })),
      hasMore: false,
      catalogVersion: '1',
    };
  if (name === 'sniper_favorites_page') json = { items: [], next_cursor: null };
  if (name === 'sniper_supported_brands')
    json = [{ brand: 'Vintage' }, { brand: 'Nike' }, { brand: 'Levi’s' }];
  if (name === 'sniper_feed_search')
    json = {
      items: saleTitles.slice(0, 3).map((title, i) => ({
        id: `65000000-0000-4000-8000-00000000000${i + 1}`,
        title,
        url: 'https://www.vinted.de/items/' + (i + 1),
        image_urls: ['https://images1.vinted.net/flipbase-demo/sweatshirt.svg'],
        item_price: 18 + i * 5,
        total_price: 20 + i * 5,
        currency: 'EUR',
        brand: 'Vintage',
        size: 'M',
        condition: 'Sehr gut',
        is_hidden: false,
        first_seen_at: date + 'T10:00:00Z',
        catalog_id: 1049,
        category_path: 'Sweatshirts',
        reference_price: null,
        reference_scope: null,
        discount_percent: null,
        watchlist_title: null,
      })),
      covered: true,
      reported_at: date + 'T10:00:00Z',
    };
  if (name === 'ebay-account' && json && typeof json === 'object') {
    if (Array.isArray(json.items))
      json.items = json.items.slice(0, 5).map((item, i) => ({
        ...item,
        title: saleTitles[i],
        imageUrl: 'https://images1.vinted.net/flipbase-demo/sweatshirt.svg',
        price: [39, 35, 49, 28, 36][i],
      }));
    if (json.connection)
      json.connection = {
        ...json.connection,
        username: 'vintage.studio',
        lastReadAt: date + 'T10:00:00Z',
      };
  }
  if (name === 'kleinanzeigen-account' && json && typeof json === 'object') {
    if (Array.isArray(json.accounts))
      json.accounts = json.accounts.slice(0, 1).map((a) => ({
        ...a,
        displayName: 'Vintage Studio',
        listingCount: 3,
        lastSyncedAt: date + 'T10:00:00Z',
      }));
    if (Array.isArray(json.items)) {
      json.items = json.items.slice(0, 3).map((item, i) => ({
        ...item,
        title: saleTitles[i],
        state: 'active',
        priceCents: [3900, 3500, 4900][i],
        currency: 'EUR',
        publishedAt: '2026-11-04T10:00:00Z',
        observedAt: date + 'T10:00:00Z',
      }));
      json.total = json.items.length;
      json.nextId = null;
    }
  }
  return { ...options, json };
}
const pages = [
  ['overview', '/dashboard', 'src/app/features/dashboard/dashboard.component.html'],
  ['purchases', '/purchases', 'src/app/features/purchases/purchases.component.html'],
  ['sales', '/sales', 'src/app/features/sales/sales.component.html'],
  [
    'marketplaces',
    '/marketplaces/overview',
    'src/app/features/marketplaces/components/marketplace-overview/marketplace-overview.component.html',
  ],
  [
    'vinted',
    '/marketplaces/vinted/listings',
    'src/app/features/marketplaces/vinted-workspace.component.html',
  ],
  ['ebay', '/marketplaces/ebay', 'src/app/features/marketplaces/ebay-workspace.component.html'],
  [
    'kleinanzeigen',
    '/marketplaces/kleinanzeigen',
    'src/app/features/marketplaces/components/kleinanzeigen-workspace/kleinanzeigen-workspace.component.html',
  ],
  ['expenses', '/expenses', 'src/app/features/expenses/expenses.component.html'],
  ['accounting', '/accounting', 'src/app/features/accounting/accounting.component.html'],
  ['reports', '/analytics', 'src/app/features/analytics/analytics.component.html'],
  ['feed', '/vinted-bot', 'src/app/features/deal-monitor/deal-monitor.component.html'],
  [
    'brands',
    '/tools/brand-labels',
    'src/app/features/brand-labels/pages/label-library/label-library.component.html',
  ],
  ['photos', '/image-optimizer', 'src/app/features/image-optimizer/image-optimizer.component.html'],
];
const contentTypes = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  try {
    let file = resolve(app, '.' + new URL(request.url, 'http://localhost').pathname);
    if (
      !file.startsWith(resolve(app) + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))
    )
      throw new Error('Invalid path');
    if (!(await stat(file).catch(() => null))?.isFile()) file = join(app, 'index.html');
    response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'text/html');
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const manifest = selected.length
  ? JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
  : { sourceCommit, capture: 'actual-angular-pages', syntheticData: true, pages: {} };
if (selected.some((key) => !pages.some(([page]) => page === key)))
  throw new Error('Unknown capture page');
await mkdir(output, { recursive: true });
const pendingCaptures = new Map();
try {
  const garmentPage = await browser.newPage();
  await garmentPage.setContent(
    '<img width="1600" height="2000" src="data:image/svg+xml;base64,' +
      Buffer.from(shirt).toString('base64') +
      '">',
  );
  const garment = await garmentPage.locator('img').screenshot();
  await garmentPage.close();
  for (const mode of ['desktop', 'mobile'])
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: { width: mode === 'desktop' ? 1280 : 390, height: 1100 },
        deviceScaleFactor: 1,
        hasTouch: mode === 'mobile',
        colorScheme: theme,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(DEMO_CAPTURE_TIME));
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      const proxy = new Proxy(page, {
        get(target, key) {
          if (key === 'route')
            return async (pattern, handler) =>
              target.route(pattern, (route) =>
                handler(
                  new Proxy(route, {
                    get(r, k) {
                      if (k === 'fulfill')
                        return (options) => r.fulfill(prepareResponse(r, options));
                      const value = Reflect.get(r, k);
                      return typeof value === 'function' ? value.bind(r) : value;
                    },
                  }),
                ),
              );
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      await mockKleinanzeigen(proxy);
      await page.route('**/marketplace-browser/healthz', (route) =>
        route.fulfill({
          json: {
            ok: true,
            readOnly: false,
            apiVersion: 2,
            scheduledSync: {
              enabled: true,
              allowedIntervals: [3, 5, 10, 15, 30, 60],
              authorizationVersion: 2,
            },
          },
        }),
      );
      await page.route('**/demo-garment.svg', (route) =>
        route.fulfill({ contentType: 'image/svg+xml', body: shirt }),
      );
      await page.route('https://images1.vinted.net/flipbase-demo/sweatshirt.svg', (route) =>
        route.fulfill({ contentType: 'image/svg+xml', body: shirt }),
      );
      await page.route(
        'https://img.kleinanzeigen.de/api/v1/prod-ads/images/preview-test',
        (route) => route.fulfill({ contentType: 'image/svg+xml', body: shirt }),
      );
      await page.route('**/functions/v1/brand-label-media', (route) =>
        route.fulfill({
          json: {
            signedUrl:
              'http://127.0.0.1:54351/storage/v1/object/sign/label-images/' +
              route.request().postDataJSON().assetId +
              '.png?token=demo',
          },
        }),
      );
      await page.route('**/storage/v1/object/sign/label-images/**', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240"><rect width="360" height="240" fill="#e5e5e0"/><rect x="50" y="45" width="260" height="150" rx="4" fill="#f8f8f0" stroke="#555"/><text x="180" y="109" text-anchor="middle" fill="#333" font-family="serif" font-size="23">BEISPIELMARKE</text><text x="180" y="147" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="17">M \u00b7 COTTON</text></svg>',
        }),
      );
      await page.addInitScript(
        ({ theme, id }) => {
          localStorage.setItem('flipbase_theme', theme);
          localStorage.setItem('flipbase_active_workspace_id', id);
        },
        { theme, id: workspaceId },
      );
      for (const [key, path, component] of pages) {
        if (selected.length && !selected.includes(key)) continue;
        const viewport = demoCaptureViewport(key, mode);
        await page.setViewportSize(viewport);
        await page.goto(origin + path);
        await expect(page.locator('[data-page-content] h1').first()).toBeVisible();
        if (key === 'overview')
          await expect(page.locator('app-revenue-chart .apexcharts-svg')).toBeVisible();
        if (key === 'accounting')
          await page.getByRole('button', { name: 'Bankabgleich', exact: true }).click();
        if (key === 'photos') {
          await page.locator('input[type=file]').first().setInputFiles({
            name: 'Vintage-Sweatshirt.png',
            mimeType: 'image/png',
            buffer: garment,
          });
          await page.locator('app-platform-selector button[aria-pressed]').first().click();
          await expect(page.locator('app-crop-editor')).toBeVisible();
        }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        const panel = page.locator('[data-page-content]');
        const text = await panel.innerText();
        const cardPositions =
          key === 'feed'
            ? await panel.locator('app-deal-card').evaluateAll((elements) =>
                elements.map((element) => {
                  const { left, top, width } = element.getBoundingClientRect();
                  return { left, top, width };
                }),
              )
            : [];
        const audit = inspectDemoCapture(key, mode, text, cardPositions);
        await page.mouse.move(0, 0);
        const png = await panel.screenshot({
          style:
            'app-header, app-sidebar, app-bottom-nav, [aria-label="Updateprüfung"], [aria-label="Benachrichtigungen"] { visibility: hidden; }',
        });
        const webp = await page.evaluate(async (encoded) => {
          const image = new Image();
          image.src = 'data:image/png;base64,' + encoded;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          return canvas.toDataURL('image/webp', 0.96).split(',')[1];
        }, png.toString('base64'));
        const filename = `${key}-${mode}-${theme}.webp`;
        const bytes = Buffer.from(webp, 'base64');
        pendingCaptures.set(filename, bytes);
        manifest.pages[key] ??= { route: path, component, captures: {} };
        if (key === 'overview')
          manifest.pages[key].figures = await panel.evaluate((element) => ({
            metrics: Array.from(element.querySelectorAll('[data-kpi] .metric-value')).map((e) =>
              e.textContent.trim(),
            ),
            chart: Array.from(element.querySelectorAll('#revenue-chart-summary tbody tr')).map(
              (row) => Array.from(row.querySelectorAll('td')).map((e) => e.textContent.trim()),
            ),
            recentSales: element.querySelectorAll('.sales-table tbody tr').length,
          }));
        if (key === 'overview') manifest.themeColors ??= {};
        if (key === 'overview')
          manifest.themeColors[theme] = await panel.evaluate((element) =>
            Object.fromEntries(
              [
                '--fb-bg-app',
                '--fb-bg-sidebar',
                '--fb-bg-header',
                '--fb-bg-surface',
                '--fb-border-subtle',
                '--fb-text-primary',
                '--fb-text-secondary',
                '--fb-text-muted',
              ].map((name) => [
                name,
                getComputedStyle(element.closest('app-shell')).getPropertyValue(name).trim(),
              ]),
            ),
          );
        manifest.pages[key].captures[mode + '-' + theme] = {
          file: filename,
          viewport,
          audit,
          width: png.readUInt32BE(16),
          height: png.readUInt32BE(20),
          sha256: createHash('sha256').update(bytes).digest('hex'),
        };
        console.log(
          'Captured',
          key,
          mode,
          theme,
          png.readUInt32BE(16) + 'x' + png.readUInt32BE(20),
          bytes.length,
        );
      }
      if (errors.length) throw new Error(errors.join('\n'));
      await context.close();
    }
  for (const [filename, bytes] of pendingCaptures) await writeFile(join(output, filename), bytes);
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await unlink(fixtureFile);
  await rmdir(temporary);
}

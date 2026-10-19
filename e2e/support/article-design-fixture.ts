import type { Page } from '@playwright/test';
import { mockMarketplace, workspaceId } from './marketplace-account-fixture';
export const productId = '35000000-0000-4000-8000-000000000001';
export const itemId = '35000000-0000-4000-8000-000000000011';
export async function mockArticleArea(page: Page) {
  await mockMarketplace(page);
  const writes: { path: string; method: string; body: unknown }[] = [];
  const products: Record<string, unknown>[] = [
    'Leinenhemd · Salbeigrün',
    'Vintage-Strickpullover',
    'Jeans · Levi’s 501',
    'Sneaker · New Balance',
  ].map((title, i) => ({
    id: i === 0 ? productId : '35000000-0000-4000-8000-00000000000' + (i + 1),
    workspace_id: workspaceId,
    title,
    description:
      'Gepflegtes Leinenhemd mit lockerer Passform. Leichtes Material, sorgfältig geprüft.',
    brand: 'Arket',
    brand_id: null,
    model: 'Linen Relaxed',
    sku: 'FB-1024',
    ean: null,
    size: 'M',
    color: 'Grün',
    material: 'Leinen',
    category: 'Hemden',
    category_id: null,
    condition: 'used',
    condition_notes: 'Sehr guter Zustand, keine sichtbaren Gebrauchsspuren.',
    tracking_mode: 'quantity',
    is_public_store: false,
    listing_price: 39,
    archived_at: null,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-18T10:00:00Z',
    catalog_product_media: [],
    seo_title: null,
    seo_description: null,
    url_handle: null,
  }));
  const item: Record<string, unknown> = {
    id: itemId,
    workspace_id: workspaceId,
    purchase_id: null,
    title: 'Lederjacke · Cognac',
    description: 'Weiche Lederjacke mit schöner Patina.',
    brand: 'Selected',
    category: 'Jacken',
    sku: 'FB-1031',
    condition: 'used',
    status: 'ready',
    sale_state: 'no_active_sale',
    active_sale_count: 0,
    is_public_store: false,
    listing_price: 79,
    estimated_market_value: 79,
    allocated_purchase_cost: 24,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-18T10:00:00Z',
    costs: [],
    media: [],
    purchase: null,
    archived_at: null,
  };
  const lots = products.slice(0, 3).map((product, i) => ({
    id: 'lot-' + i,
    workspace_id: workspaceId,
    purchase_id: 'purchase-demo',
    purchase_line_id: 'line-' + i,
    catalog_product_id: product.id,
    received_quantity: 4,
    remaining_quantity: i + 1,
    unit_cost: 12,
    unit_tax_purchase_cost: 12,
    remaining_unit_costs: Array(i + 1).fill(12),
    remaining_tax_unit_costs: Array(i + 1).fill(12),
    received_at: '2026-10-10T10:00:00Z',
    catalog_product: product,
    purchase: {
      id: 'purchase-demo',
      workspace_id: workspaceId,
      title: 'Herbstkollektion',
      purchase_date: '2026-10-10',
    },
  }));
  await page.route('**/rest/v1/catalog_products?**', async (r) => {
    const req = r.request(),
      url = new URL(req.url()),
      id = url.searchParams.get('id')?.replace('eq.', '');
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON();
      writes.push({ path: 'catalog_products', method: 'PATCH', body });
      const p = products.find((p) => p.id === id);
      if (p) Object.assign(p, body);
      return r.fulfill({ json: p ?? null });
    }
    if (req.method() !== 'GET') {
      writes.push({ path: 'catalog_products', method: req.method(), body: req.postDataJSON() });
      return r.fulfill({
        status: 400,
        json: { message: 'Keine echte Schreiboperation in der Sichtprüfung' },
      });
    }
    return r.fulfill({ json: id ? (products.find((p) => p.id === id) ?? null) : products });
  });
  await page.route('**/rest/v1/inventory_items?**', (r) => {
    const id = new URL(r.request().url()).searchParams.get('id');
    return r.fulfill({ json: id ? item : [item] });
  });
  await page.route('**/rest/v1/inventory_item_sale_states?**', (r) =>
    r.fulfill({
      json: [
        {
          inventory_item_id: itemId,
          workspace_id: workspaceId,
          sale_state: 'no_active_sale',
          active_sale_count: 0,
          active_sale_id: null,
        },
      ],
    }),
  );
  await page.route('**/rest/v1/stock_lots?**', (r) => r.fulfill({ json: lots }));
  await page.route('**/rest/v1/brands?**', (r) =>
    r.fulfill({
      json: [
        { id: 'brand-1', workspace_id: workspaceId, name: 'Arket' },
        { id: 'brand-2', workspace_id: workspaceId, name: 'Selected' },
      ],
    }),
  );
  await page.route('**/rest/v1/rpc/get_workspace_company_settings', (r) =>
    r.fulfill({
      json: {
        can_edit: true,
        tax_mode: 'diff_25a',
        profile: {
          workspace_id: workspaceId,
          company_name: 'Testladen',
          legal_name: 'Clara Winter',
          street: 'Lindenstraße',
          house_number: '12',
          postal_code: '20357',
          city: 'Hamburg',
          country_code: 'DE',
          created_at: '2026-10-01T12:00:00Z',
          updated_at: '2026-10-01T12:00:00Z',
        },
      },
    }),
  );
  return { writes, products, item };
}

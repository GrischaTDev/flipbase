import type { TestWorkspace } from './fixtures';

export interface SampleItem {
  readonly id: string;
  readonly title: string;
}

async function call<T>(
  workspace: TestWorkspace,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await workspace.client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/**
 * Legt einen Einkauf über dieselben Datenbankfunktionen wie die App an, nimmt jede
 * Position als Einzelartikel an und schließt ihn ab. Die Artikel sind danach verkaufbar.
 */
export async function createFinalizedPurchase(
  workspace: TestWorkspace,
  input: {
    readonly title: string;
    readonly purchaseDate: string;
    readonly items: readonly { readonly title: string; readonly price: number }[];
  },
): Promise<{ purchaseId: string; items: SampleItem[] }> {
  const total = input.items.reduce((sum, item) => sum + item.price, 0);
  const created = await call<{ purchase: { id: string } }>(workspace, 'create_purchase', {
    p_workspace_id: workspace.id,
    p_purchase: {
      type: input.items.length === 1 ? 'single' : 'lot',
      title: input.title,
      purchase_date: input.purchaseDate,
      purchase_price: total,
      discount_amount: 0,
      content_status: 'known',
      pricing_mode: 'individual',
      shipment_status: 'arrived',
      cost_allocation_mode: 'even',
    },
    p_expenses: [],
    p_lines: input.items.map((item, index) => ({
      client_ref: `e2e-line-${index}`,
      catalog_product_id: null,
      title_snapshot: item.title,
      line_kind: 'individual',
      is_package: false,
      ordered_quantity: 1,
      price_mode: 'priced',
      unit_purchase_price: item.price,
      line_total: item.price,
      allocated_additional_cost: 0,
    })),
  });
  const purchaseId = created.purchase.id;

  const { data: lines, error: linesError } = await workspace.client
    .from('purchase_lines')
    .select('id, title_snapshot')
    .eq('workspace_id', workspace.id)
    .eq('purchase_id', purchaseId);
  if (linesError || !lines) throw new Error(`Positionen fehlen: ${linesError?.message}`);
  for (const line of lines) {
    await call(workspace, 'receive_individual_purchase_line', {
      p_workspace_id: workspace.id,
      p_purchase_id: purchaseId,
      p_purchase_line_id: line.id,
      p_item: { title: line.title_snapshot },
    });
  }
  await call(workspace, 'finalize_purchase_costing', {
    p_workspace_id: workspace.id,
    p_purchase_id: purchaseId,
  });

  const { data: items, error: itemsError } = await workspace.client
    .from('inventory_items')
    .select('id, title, status')
    .eq('workspace_id', workspace.id)
    .eq('purchase_id', purchaseId);
  if (itemsError || !items || items.length !== input.items.length) {
    throw new Error(`Artikel des Einkaufs fehlen: ${itemsError?.message ?? items?.length}`);
  }
  const notReady = items.filter((item) => item.status !== 'ready');
  if (notReady.length > 0) {
    throw new Error(
      `Artikel nach dem Abschluss nicht verkaufbar: ${notReady.map((item) => item.status).join(', ')}`,
    );
  }
  return { purchaseId, items: items.map((item) => ({ id: item.id, title: item.title })) };
}

export async function recordSale(
  workspace: TestWorkspace,
  input: {
    readonly saleDate: string;
    readonly lines: readonly { readonly item: SampleItem; readonly price: number }[];
  },
): Promise<void> {
  await call(workspace, 'record_sale', {
    p_workspace_id: workspace.id,
    p_sale: { platform: 'direct', sale_date: input.saleDate },
    p_lines: input.lines.map((line) => ({
      inventory_item_id: line.item.id,
      title_snapshot: line.item.title,
      quantity: 1,
      unit_sale_price: line.price,
    })),
  });
}

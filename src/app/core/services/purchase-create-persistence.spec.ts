import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase, Workspace } from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
import { PurchaseService, type CreatePurchasePayload } from './purchase.service';
import { SyncStatusService } from './sync-status.service';

const workspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
  created_at: '2026-08-24T10:00:00.000Z',
};

const gespeicherterEinkauf: Purchase = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspace.id,
  type: 'single',
  title: 'Konsole',
  purchase_date: '2026-08-24',
  purchase_price: 80,
  shipping_cost: 0,
  source_id: null,
  supplier_id: null,
  cost_allocation_mode: 'even',
  created_at: '2026-08-24T10:01:00.000Z',
};

const gespeicherterArtikel: InventoryItem = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: workspace.id,
  purchase_id: gespeicherterEinkauf.id,
  title: 'Konsole',
  condition: 'used',
  status: 'received',
  sku: null,
  category: null,
  brand: null,
  model: null,
  ean: null,
  description: null,
  allocated_purchase_cost: 80,
  expected_value: 120,
  created_at: '2026-08-24T10:02:00.000Z',
};

const centgenauePosition: NonNullable<CreatePurchasePayload['purchase_lines']>[number] = {
  draftId: 'money-line',
  catalogProductId: null,
  titleSnapshot: 'Geldprüfung',
  lineKind: 'individual',
  orderedQuantity: 1,
  condition: 'used',
  priceMode: 'priced',
  unitPurchasePrice: 10,
  lineTotal: 10,
  estimatedMarketValue: 20,
  allocatedAdditionalCost: 0,
};

function erstelleGeldPayload(
  overrides: Partial<CreatePurchasePayload> = {},
): CreatePurchasePayload {
  return {
    type: 'single',
    title: 'Geldprüfung',
    purchase_date: '2026-08-31',
    purchase_price: null,
    purchase_lines: [centgenauePosition],
    ...overrides,
  };
}

function erstelleDienste(client: unknown) {
  const syncStatus = new SyncStatusService();
  const inventory = Object.create(InventoryService.prototype) as InventoryService;
  Object.assign(inventory, {
    supabase: { client },
    syncStatus,
    workspaceService: { currentWorkspace: signal(workspace) },
    items: signal<InventoryItem[]>([]),
    selectedItem: signal<InventoryItem | null>(null),
    itemCosts: signal([]),
    activityLogs: signal([]),
    istGeladen: signal(true),
  });

  const purchase = Object.create(PurchaseService.prototype) as PurchaseService;
  Object.assign(purchase, {
    supabase: { client },
    syncStatus,
    workspaceService: { currentWorkspace: signal(workspace) },
    purchasesRaw: signal<Purchase[]>([]),
    selectedPurchaseRaw: signal<Purchase | null>(null),
    selectedPurchase: () => null,
    sourcesService: { sources: signal([]) },
    suppliersService: { suppliers: signal([]) },
    inventory,
    webhookService: { sendPurchaseNotification: vi.fn() },
  });

  return { purchase, inventory, syncStatus };
}

describe('PurchaseService – abhängige Schreibvorgänge beim Anlegen', () => {
  it('sendet die Paketkennzeichnung und den bekannten Paketpreis beim Erstellen und Bearbeiten', async () => {
    const rpc = vi.fn(async () => ({
      data: { purchase: gespeicherterEinkauf, purchase_lines: [], purchase_costs: [] },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });
    const payload = erstelleGeldPayload({
      purchase_lines: [
        { ...centgenauePosition, isPackage: true, unitPurchasePrice: 100, lineTotal: 100 },
      ],
    });
    expect((await purchase.createPurchase(payload)).error).toBeNull();
    expect((await purchase.updatePurchaseDraft(gespeicherterEinkauf.id, payload)).error).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'create_purchase',
      expect.objectContaining({
        p_lines: [
          expect.objectContaining({
            is_package: true,
            ordered_quantity: 1,
            unit_purchase_price: 100,
            line_total: 100,
          }),
        ],
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'update_purchase_draft',
      expect.objectContaining({
        p_lines: [
          expect.objectContaining({
            is_package: true,
            ordered_quantity: 1,
            unit_purchase_price: 100,
            line_total: 100,
          }),
        ],
      }),
    );
  });

  it('ordnet direkte Zusatzkosten atomar über die Draft-ID der erzeugten Position zu', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        purchase: gespeicherterEinkauf,
        purchase_costs: [],
        purchase_lines: [],
      },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });

    await purchase.createPurchase({
      type: 'lot',
      title: 'Direkte Frachtkosten',
      purchase_date: '2026-08-31',
      purchase_price: 10,
      initial_costs: [
        {
          type: 'shipping',
          amount: 4.5,
          description: 'Sperrgut',
          allocationMethod: 'direct',
          targetPurchaseLineId: 'draft-heavy-item',
        },
      ],
      purchase_lines: [
        {
          draftId: 'draft-heavy-item',
          catalogProductId: 'catalog-1',
          titleSnapshot: 'Schweres Paket',
          lineKind: 'quantity',
          orderedQuantity: 1,
          condition: 'very_good',
          priceMode: 'priced',
          unitPurchasePrice: 10,
          lineTotal: 10,
          estimatedMarketValue: null,
        },
      ],
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_purchase',
      expect.objectContaining({
        p_expenses: [
          expect.objectContaining({
            allocation_method: 'direct',
            target_purchase_line_ref: 'draft-heavy-item',
          }),
        ],
        p_lines: [
          expect.objectContaining({
            client_ref: 'draft-heavy-item',
            condition_snapshot: 'very_good',
            price_mode: 'priced',
          }),
        ],
      }),
    );
  });

  it.each([
    ['negativer Kaufpreis', erstelleGeldPayload({ purchase_price: -0.01 })],
    ['Kaufpreis mit Teilcent', erstelleGeldPayload({ purchase_price: 10.001 })],
    ['nicht endlicher Kaufpreis', erstelleGeldPayload({ purchase_price: Number.NaN })],
    [
      'negative Zusatzkosten',
      erstelleGeldPayload({ initial_costs: [{ type: 'shipping', amount: -0.01 }] }),
    ],
    [
      'Zusatzkosten mit Teilcent',
      erstelleGeldPayload({ initial_costs: [{ type: 'shipping', amount: 1.001 }] }),
    ],
    [
      'nicht endliche Zusatzkosten',
      erstelleGeldPayload({ initial_costs: [{ type: 'shipping', amount: Number.NaN }] }),
    ],
    [
      'negativer Marktwert',
      erstelleGeldPayload({
        purchase_lines: [{ ...centgenauePosition, estimatedMarketValue: -0.01 }],
      }),
    ],
    [
      'Marktwert mit Teilcent',
      erstelleGeldPayload({
        purchase_lines: [{ ...centgenauePosition, estimatedMarketValue: 20.001 }],
      }),
    ],
    [
      'nicht endlicher Marktwert',
      erstelleGeldPayload({
        purchase_lines: [{ ...centgenauePosition, estimatedMarketValue: Number.NaN }],
      }),
    ],
    [
      'negative manuelle Zuordnung',
      erstelleGeldPayload({
        cost_allocation_mode: 'manual',
        initial_costs: [{ type: 'shipping', amount: 1 }],
        purchase_lines: [{ ...centgenauePosition, allocatedAdditionalCost: -0.01 }],
      }),
    ],
    [
      'manuelle Zuordnung mit Teilcent',
      erstelleGeldPayload({
        cost_allocation_mode: 'manual',
        initial_costs: [{ type: 'shipping', amount: 1 }],
        purchase_lines: [{ ...centgenauePosition, allocatedAdditionalCost: 1.001 }],
      }),
    ],
    [
      'nicht endliche manuelle Zuordnung',
      erstelleGeldPayload({
        cost_allocation_mode: 'manual',
        initial_costs: [{ type: 'shipping', amount: 1 }],
        purchase_lines: [{ ...centgenauePosition, allocatedAdditionalCost: Number.NaN }],
      }),
    ],
  ])('lehnt %s vor dem create_purchase-Aufruf ab', async (_label, payload) => {
    const rpc = vi.fn(async () => ({
      data: {
        purchase: gespeicherterEinkauf,
        purchase_costs: [],
        purchase_lines: [],
      },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });

    const result = await purchase.createPurchase(payload);

    expect(result).toMatchObject({ status: 'failed', data: null, error: expect.any(Error) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('persistiert unbepreiste Mystery-Positionen ohne künstlichen Nullpreis', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        purchase: { ...gespeicherterEinkauf, type: 'mystery_pack', purchase_price: 45 },
        purchase_costs: [],
        purchase_lines: [],
      },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });

    const result = await purchase.createPurchase({
      type: 'mystery_pack',
      title: 'Mystery Box',
      purchase_date: '2026-08-31',
      purchase_price: 45,
      purchase_lines: [
        {
          draftId: 'draft-find',
          catalogProductId: null,
          titleSnapshot: 'Fundstück',
          lineKind: 'individual',
          orderedQuantity: 1,
          condition: 'used',
          priceMode: 'unpriced_mystery',
          unitPurchasePrice: null,
          lineTotal: null,
          estimatedMarketValue: 20,
        },
      ],
    });

    expect(result.status).toBe('success');
    expect(rpc).toHaveBeenCalledWith(
      'create_purchase',
      expect.objectContaining({
        p_lines: [
          expect.objectContaining({
            price_mode: 'unpriced_mystery',
            unit_purchase_price: null,
            line_total: null,
            estimated_market_value: 20,
          }),
        ],
      }),
    );
  });

  it('schreibt den Legacy-Zusatzkostenpfad mit dem validierten Workspace', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const { purchase } = erstelleDienste({
      from: () => ({ insert }),
    });
    const legacyPath = purchase as unknown as {
      legeZusatzkostenAn: (
        workspaceId: string,
        purchaseId: string,
        costs: { type: string; amount: number; description?: string | null }[],
      ) => Promise<{ error: Error | null; reportedBySyncStatus: boolean }>;
    };

    const result = await legacyPath.legeZusatzkostenAn(workspace.id, gespeicherterEinkauf.id, [
      { type: 'shipping', amount: 5, description: 'Versand' },
    ]);

    expect(result).toEqual({ error: null, reportedBySyncStatus: false });
    expect(insert).toHaveBeenCalledWith([
      {
        workspace_id: workspace.id,
        purchase_id: gespeicherterEinkauf.id,
        type: 'shipping',
        amount: 5,
        description: 'Versand',
      },
    ]);
  });

  it('legt Einkauf, Zusatzkosten und Positionen produktiv in genau einer RPC an', async () => {
    const rpc = vi.fn(async (_name: string, _payload: unknown) => ({
      data: {
        purchase: { ...gespeicherterEinkauf, total_purchase_cost: null },
        purchase_costs: [
          {
            id: 'cost-1',
            purchase_id: gespeicherterEinkauf.id,
            type: 'shipping',
            amount: 0.05,
            description: 'Versand',
          },
        ],
        purchase_lines: [
          {
            id: 'line-1',
            workspace_id: workspace.id,
            purchase_id: gespeicherterEinkauf.id,
            catalog_product_id: 'catalog-1',
            title_snapshot: 'LED-Lampe',
            line_kind: 'quantity',
            ordered_quantity: 3,
            received_quantity: 0,
            unit_purchase_price: 4.99,
            line_total: 14.97,
            allocated_additional_cost: 0.05,
          },
        ],
      },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });

    const ergebnis = await purchase.createPurchase({
      type: 'lot',
      title: 'LED-Lampen',
      purchase_date: '2026-08-29',
      purchase_price: 14.97,
      cost_allocation_mode: 'even',
      initial_costs: [{ type: 'shipping', amount: 0.05, description: 'Versand' }],
      purchase_lines: [
        {
          catalogProductId: 'catalog-1',
          titleSnapshot: 'LED-Lampe',
          lineKind: 'quantity',
          orderedQuantity: 3,
          unitPurchasePrice: 4.99,
          lineTotal: 14.97,
        },
      ],
    });

    expect(ergebnis).toMatchObject({
      status: 'success',
      data: { id: gespeicherterEinkauf.id, total_purchase_cost: 15.02 },
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('create_purchase', {
      p_workspace_id: workspace.id,
      p_purchase: expect.objectContaining({
        title: 'LED-Lampen',
        purchase_price: 14.97,
        cost_allocation_mode: 'even',
      }),
      p_expenses: [
        {
          type: 'shipping',
          amount: 0.05,
          description: 'Versand',
          tax_treatment: null,
          allocation_method: 'value_weighted',
          target_purchase_line_ref: null,
        },
      ],
      p_lines: [
        expect.objectContaining({
          client_ref: null,
          catalog_product_id: 'catalog-1',
          ordered_quantity: 3,
          price_mode: 'priced',
          line_total: 14.97,
        }),
      ],
    });
    const rpcPayload = rpc.mock.calls[0]?.[1] as { p_purchase: Record<string, unknown> };
    expect(rpcPayload.p_purchase).not.toHaveProperty('total_purchase_cost');
  });

  it('normalisiert unbekannte Positionspreise nicht über Number(null) zu echten Nullbeträgen', async () => {
    const rpc = vi.fn(async () => ({
      data: { purchase_lines: [] },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });

    const ergebnis = await purchase.createPurchaseLines(gespeicherterEinkauf.id, [
      {
        catalogProductId: 'catalog-1',
        titleSnapshot: 'Noch unbepreiste LED-Lampe',
        lineKind: 'quantity',
        orderedQuantity: 1,
        unitPurchasePrice: null,
        lineTotal: null,
      },
    ]);

    expect(ergebnis).toMatchObject({ data: null, error: expect.any(Error) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('behält ausdrücklich numerische Nullpreise im realen Normalisierungspfad bei', async () => {
    const rpc = vi.fn(async (_name: string, _payload: unknown) => ({
      data: { purchase_lines: [] },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });

    const ergebnis = await purchase.createPurchaseLines(gespeicherterEinkauf.id, [
      {
        catalogProductId: 'catalog-1',
        titleSnapshot: 'Ausdrücklich kostenlose LED-Lampe',
        lineKind: 'quantity',
        orderedQuantity: 1,
        unitPurchasePrice: 0,
        lineTotal: 0,
      },
    ]);

    expect(ergebnis).toMatchObject({ data: [], error: null });
    expect(rpc).toHaveBeenCalledWith(
      'add_purchase_lines',
      expect.objectContaining({
        p_lines: [expect.objectContaining({ unit_purchase_price: 0, line_total: 0 })],
      }),
    );
  });

  it('übergibt initiale Mengenpositionen erst mit der bestätigten Datenbank-ID', async () => {
    const aufrufe: { tabelle: string; payload: unknown }[] = [];
    const finalerEinkauf = { ...gespeicherterEinkauf, id: '44444444-4444-4444-8444-444444444444' };
    const client = {
      rpc: async (_name: string, payload: unknown) => {
        aufrufe.push({ tabelle: 'create_purchase', payload });
        return {
          data: {
            purchase: finalerEinkauf,
            purchase_costs: [],
            purchase_lines: [
              {
                id: 'line-1',
                workspace_id: workspace.id,
                purchase_id: finalerEinkauf.id,
                catalog_product_id: 'catalog-1',
                title_snapshot: 'LED-Lampe',
                line_kind: 'quantity',
                ordered_quantity: 5,
                received_quantity: 0,
                unit_purchase_price: 4.99,
                line_total: 24.95,
                allocated_additional_cost: 0,
              },
            ],
          },
          error: null,
        };
      },
    };
    const { purchase } = erstelleDienste(client);

    const ergebnis = await purchase.createPurchase({
      type: 'lot',
      title: 'Nachkauf LED-Lampe Abnahme',
      purchase_date: '2026-08-28',
      purchase_price: 24.95,
      purchase_lines: [
        {
          catalogProductId: 'catalog-1',
          titleSnapshot: 'LED-Lampe',
          lineKind: 'quantity',
          orderedQuantity: 5,
          unitPurchasePrice: 4.99,
          lineTotal: 24.95,
        },
      ],
    });

    expect(ergebnis).toMatchObject({ status: 'success', data: { id: finalerEinkauf.id } });
    expect(aufrufe.map(({ tabelle }) => tabelle)).toEqual(['create_purchase']);
    expect(aufrufe[0].payload).toEqual(
      expect.objectContaining({
        p_workspace_id: workspace.id,
        p_lines: [
          expect.objectContaining({
            catalog_product_id: 'catalog-1',
            ordered_quantity: 5,
            unit_purchase_price: 4.99,
            line_total: 24.95,
          }),
        ],
      }),
    );
  });

  it('rollt bei einem Fehler der initialen Positionen den gesamten Einkauf zurück', async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { code: '23503', message: 'catalog product missing' },
      }),
    };
    const { purchase } = erstelleDienste(client);

    const ergebnis = await purchase.createPurchase({
      type: 'lot',
      title: 'Nachkauf LED-Lampe Abnahme',
      purchase_date: '2026-08-28',
      purchase_price: 24.95,
      purchase_lines: [
        {
          catalogProductId: 'catalog-1',
          titleSnapshot: 'LED-Lampe',
          lineKind: 'quantity',
          orderedQuantity: 5,
          unitPurchasePrice: 4.99,
          lineTotal: 24.95,
        },
      ],
    });

    expect(ergebnis).toMatchObject({
      status: 'failed',
      data: null,
      error: expect.any(Error),
      problems: [],
    });
  });

  it('legt bei einem positionslosen Entwurf noch keinen Inventarartikel an', async () => {
    const aufrufe: { tabelle: string; payload: unknown }[] = [];
    const client = {
      rpc: async () => ({
        data: { purchase: gespeicherterEinkauf, purchase_costs: [], purchase_lines: [] },
        error: null,
      }),
      from(tabelle: string) {
        return {
          insert(payload: unknown) {
            aufrufe.push({ tabelle, payload });
            if (tabelle === 'inventory_items') {
              return {
                select: () => ({
                  single: async () => ({ data: gespeicherterArtikel, error: null }),
                }),
              };
            }
            if (tabelle === 'activity_logs') {
              return Promise.resolve({
                error: { code: '23503', message: 'inventory item missing' },
              });
            }
            throw new Error(`Unerwartete Tabelle: ${tabelle}`);
          },
        };
      },
    };
    const { purchase, syncStatus } = erstelleDienste(client);

    const ergebnis = await purchase.createPurchase({
      type: 'single',
      title: 'Konsole',
      purchase_date: '2026-08-24',
      purchase_price: 80,
      single_item_title: 'Konsole',
      single_item_condition: 'used',
      single_item_expected_value: 120,
    });

    expect(ergebnis).toMatchObject({
      status: 'success',
      data: { id: gespeicherterEinkauf.id },
      error: null,
      problems: [],
    });
    expect(aufrufe).toEqual([]);
    expect(syncStatus.hatFehler()).toBe(false);
  });

  it('rollt bei fehlgeschlagenen Zusatzkosten den gesamten Einkauf zurück', async () => {
    const client = {
      rpc: async () => ({ data: null, error: { code: '42501', message: 'denied' } }),
    };
    const { purchase } = erstelleDienste(client);

    const ergebnis = await purchase.createPurchase({
      type: 'mystery_pack',
      title: 'Kiste',
      purchase_date: '2026-08-24',
      purchase_price: 80,
      initial_costs: [{ type: 'shipping', amount: 7, description: 'Versand' }],
    });

    expect(ergebnis).toMatchObject({
      status: 'failed',
      data: null,
      error: expect.any(Error),
      problems: [],
    });
  });

  it('aktualisiert einen persistierten Draft samt Positionen und direkten Kosten in genau einer RPC', async () => {
    const aktualisierterEinkauf = {
      ...gespeicherterEinkauf,
      title: 'Konsole mit Controller',
      entry_status: 'draft' as const,
    };
    const rpc = vi.fn(async () => ({
      data: {
        purchase: aktualisierterEinkauf,
        purchase_costs: [
          {
            id: 'cost-1',
            type: 'shipping',
            amount: 5,
            allocation_method: 'direct',
            target_purchase_line_id: 'line-1',
          },
        ],
        purchase_lines: [
          {
            id: 'line-1',
            workspace_id: workspace.id,
            purchase_id: gespeicherterEinkauf.id,
            catalog_product_id: null,
            title_snapshot: 'Konsole mit Controller',
            line_kind: 'individual',
            ordered_quantity: 1,
            received_quantity: 0,
            price_mode: 'priced',
            unit_purchase_price: 70,
            line_total: 70,
            condition_snapshot: 'very_good',
            estimated_market_value: 90,
          },
        ],
      },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });

    const result = await purchase.updatePurchaseDraft(gespeicherterEinkauf.id, {
      type: 'single',
      title: 'Konsole mit Controller',
      purchase_date: '2026-08-31',
      purchase_price: 70,
      initial_costs: [
        {
          type: 'shipping',
          amount: 5,
          description: 'Direktversand',
          taxTreatment: 'purchase_price',
          allocationMethod: 'direct',
          targetPurchaseLineId: 'line-1',
        },
      ],
      purchase_lines: [
        {
          draftId: 'line-1',
          catalogProductId: null,
          titleSnapshot: 'Konsole mit Controller',
          lineKind: 'individual',
          orderedQuantity: 1,
          condition: 'very_good',
          priceMode: 'priced',
          unitPurchasePrice: 70,
          lineTotal: 70,
          estimatedMarketValue: 90,
        },
      ],
    });

    expect(result).toMatchObject({
      data: {
        id: gespeicherterEinkauf.id,
        title: 'Konsole mit Controller',
        purchase_lines: [{ id: 'line-1', title_snapshot: 'Konsole mit Controller' }],
      },
      error: null,
      reportedBySyncStatus: false,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('update_purchase_draft', {
      p_workspace_id: workspace.id,
      p_purchase_id: gespeicherterEinkauf.id,
      p_purchase: expect.objectContaining({
        type: 'single',
        title: 'Konsole mit Controller',
        purchase_price: 70,
      }),
      p_expenses: [
        expect.objectContaining({
          allocation_method: 'direct',
          target_purchase_line_ref: 'line-1',
          tax_treatment: 'purchase_price',
        }),
      ],
      p_lines: [
        expect.objectContaining({
          client_ref: 'line-1',
          title_snapshot: 'Konsole mit Controller',
          condition_snapshot: 'very_good',
          estimated_market_value: 90,
        }),
      ],
    });
  });

  it('meldet einen atomar abgelehnten Draft-Update ohne lokalen Teilstand', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: '22023', message: 'Die direkte Kostenzuordnung ist ungültig.' },
    }));
    const { purchase } = erstelleDienste({ rpc });

    const result = await purchase.updatePurchaseDraft(gespeicherterEinkauf.id, {
      type: 'single',
      title: 'Darf nicht lokal erscheinen',
      purchase_date: '2026-08-31',
      purchase_price: 70,
      initial_costs: [
        {
          type: 'shipping',
          amount: 5,
          allocationMethod: 'direct',
          targetPurchaseLineId: 'unknown-line',
        },
      ],
      purchase_lines: [],
    });

    expect(result).toMatchObject({ data: null, error: expect.any(Error) });
    expect(
      (
        purchase as unknown as { purchasesRaw: ReturnType<typeof signal<Purchase[]>> }
      ).purchasesRaw(),
    ).toEqual([]);
  });

  it('lehnt eine manuelle Draft-Zuordnung mit Teilcent vor dem Update-RPC ab', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        purchase: gespeicherterEinkauf,
        purchase_costs: [],
        purchase_lines: [],
      },
      error: null,
    }));
    const { purchase } = erstelleDienste({ rpc });

    const result = await purchase.updatePurchaseDraft(
      gespeicherterEinkauf.id,
      erstelleGeldPayload({
        cost_allocation_mode: 'manual',
        initial_costs: [{ type: 'shipping', amount: 1 }],
        purchase_lines: [
          { ...centgenauePosition, draftId: 'line-1', allocatedAdditionalCost: 1.001 },
        ],
      }),
    );

    expect(result).toMatchObject({ data: null, error: expect.any(Error) });
    expect(rpc).not.toHaveBeenCalled();
  });
});

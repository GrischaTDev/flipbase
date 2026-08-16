import { Injectable, signal } from '@angular/core';
import {
  Workspace,
  Source,
  Supplier,
  Purchase,
  InventoryItem,
  Sale,
  ActivityLog,
  ItemCost,
} from '../models/reflip.models';

const DEMO_WS_ID = 'demo-workspace-1';

@Injectable({
  providedIn: 'root',
})
export class MockDataStoreService {
  readonly isDemoMode = signal<boolean>(false);

  readonly demoWorkspace: Workspace = {
    id: DEMO_WS_ID,
    name: 'ReFlip Demo Store',
    currency: 'EUR',
    min_roi_percent: 30,
    min_profit_amount: 15,
    created_at: new Date().toISOString(),
  };

  readonly demoSources: Source[] = [
    { id: 'src-1', workspace_id: DEMO_WS_ID, name: 'Kleinanzeigen', type: 'online_marketplace', is_active: true },
    { id: 'src-2', workspace_id: DEMO_WS_ID, name: 'eBay', type: 'online_marketplace', is_active: true },
    { id: 'src-3', workspace_id: DEMO_WS_ID, name: 'Vinted', type: 'online_marketplace', is_active: true },
    { id: 'src-4', workspace_id: DEMO_WS_ID, name: 'Flohmarkt', type: 'flea_market', is_active: true },
    { id: 'src-5', workspace_id: DEMO_WS_ID, name: 'B-Stock / Retourenhandel', type: 'b2b_wholesaler', is_active: true },
  ];

  readonly demoSuppliers: Supplier[] = [
    { id: 'sup-1', workspace_id: DEMO_WS_ID, name: 'Privatverkäufer vor Ort', contact_info: 'Abholung bar' },
    { id: 'sup-2', workspace_id: DEMO_WS_ID, name: 'Retouren König GmbH', contact_info: 'info@retourenkoenig.de' },
  ];

  readonly demoPurchases: Purchase[] = [
    {
      id: 'pur-1',
      workspace_id: DEMO_WS_ID,
      source_id: 'src-1',
      supplier_id: 'sup-1',
      title: 'Bosch Akkubohrer Paket',
      type: 'single',
      purchase_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      purchase_price: 35.0,
      total_purchase_cost: 35.0,
      cost_allocation_mode: 'manual',
      items_count: 1,
      source: { id: 'src-1', workspace_id: DEMO_WS_ID, name: 'Kleinanzeigen', type: 'online_marketplace', is_active: true, is_default: false },
      supplier: { id: 'sup-1', workspace_id: DEMO_WS_ID, name: 'Privatverkäufer vor Ort' },
    },
    {
      id: 'pur-2',
      workspace_id: DEMO_WS_ID,
      source_id: 'src-5',
      supplier_id: 'sup-2',
      title: 'Gaming & Elektronik Mystery Box (10er)',
      type: 'mystery_pack',
      purchase_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      purchase_price: 180.0,
      total_purchase_cost: 190.0, // 180 € + 10 € Versand
      cost_allocation_mode: 'even',
      items_count: 10,
      source: { id: 'src-5', workspace_id: DEMO_WS_ID, name: 'B-Stock / Retourenhandel', type: 'b2b_wholesaler', is_active: true, is_default: false },
      supplier: { id: 'sup-2', workspace_id: DEMO_WS_ID, name: 'Retouren König GmbH' },
    },
    {
      id: 'pur-3',
      workspace_id: DEMO_WS_ID,
      source_id: 'src-5',
      supplier_id: 'sup-2',
      title: 'Amazon Retouren-Palette A3',
      type: 'pallet',
      purchase_date: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      purchase_price: 1400.0,
      total_purchase_cost: 1600.0, // 1400 € + 200 € Transport
      cost_allocation_mode: 'even',
      items_count: 50,
      source: { id: 'src-5', workspace_id: DEMO_WS_ID, name: 'B-Stock / Retourenhandel', type: 'b2b_wholesaler', is_active: true, is_default: false },
      supplier: { id: 'sup-2', workspace_id: DEMO_WS_ID, name: 'Retouren König GmbH' },
    },
  ];

  readonly demoItems: InventoryItem[] = [
    {
      id: 'item-1',
      workspace_id: DEMO_WS_ID,
      purchase_id: 'pur-1',
      title: 'Bosch Akku-Bohrschrauber GSR 18V-55',
      brand: 'Bosch Professional',
      model: 'GSR 18V-55',
      category: 'Heimwerken & Werkzeug',
      condition: 'very_good',
      status: 'listed',
      allocated_purchase_cost: 35.0,
      expected_value: 75.0,
      created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      purchase: {
        id: 'pur-1',
        workspace_id: DEMO_WS_ID,
        title: 'Bosch Akkubohrer Paket',
        type: 'single',
        purchase_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        purchase_price: 35.0,
        cost_allocation_mode: 'manual',
        source: { id: 'src-1', workspace_id: DEMO_WS_ID, name: 'Kleinanzeigen', type: 'online_marketplace', is_active: true, is_default: false },
      },
    },
    {
      id: 'item-2',
      workspace_id: DEMO_WS_ID,
      purchase_id: 'pur-2',
      title: 'Nintendo Switch OLED Konsole',
      brand: 'Nintendo',
      model: 'Switch OLED',
      category: 'Gaming & Konsolen',
      condition: 'like_new',
      status: 'sold',
      allocated_purchase_cost: 19.0,
      expected_value: 180.0,
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      purchase: {
        id: 'pur-2',
        workspace_id: DEMO_WS_ID,
        title: 'Gaming & Elektronik Mystery Box (10er)',
        type: 'mystery_pack',
        purchase_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        purchase_price: 180.0,
        cost_allocation_mode: 'even',
        source: { id: 'src-5', workspace_id: DEMO_WS_ID, name: 'B-Stock / Retourenhandel', type: 'b2b_wholesaler', is_active: true, is_default: false },
      },
    },
    {
      id: 'item-3',
      workspace_id: DEMO_WS_ID,
      purchase_id: 'pur-2',
      title: 'Sony PS5 DualSense Wireless Controller',
      brand: 'Sony',
      model: 'DualSense',
      category: 'Gaming & Konsolen',
      condition: 'used',
      status: 'ready',
      allocated_purchase_cost: 19.0,
      expected_value: 45.0,
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      purchase: {
        id: 'pur-2',
        workspace_id: DEMO_WS_ID,
        title: 'Gaming & Elektronik Mystery Box (10er)',
        type: 'mystery_pack',
        purchase_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        purchase_price: 180.0,
        cost_allocation_mode: 'even',
        source: { id: 'src-5', workspace_id: DEMO_WS_ID, name: 'B-Stock / Retourenhandel', type: 'b2b_wholesaler', is_active: true, is_default: false },
      },
    },
    {
      id: 'item-4',
      workspace_id: DEMO_WS_ID,
      purchase_id: 'pur-3',
      title: 'Alpha Industries Vintage Bomberjacke MA-1',
      brand: 'Alpha Industries',
      model: 'MA-1',
      category: 'Kleidung & Mode',
      condition: 'very_good',
      status: 'listed',
      allocated_purchase_cost: 32.0,
      expected_value: 70.0,
      created_at: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'item-5',
      workspace_id: DEMO_WS_ID,
      purchase_id: 'pur-3',
      title: 'Dyson V11 Absolute Akkusauger (Akkuschwäche)',
      brand: 'Dyson',
      model: 'V11 Absolute',
      category: 'Haushalt & Elektronik',
      condition: 'defective',
      status: 'needs_review',
      allocated_purchase_cost: 32.0,
      expected_value: 130.0,
      created_at: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  readonly demoSales: Sale[] = [
    {
      id: 'sale-1',
      workspace_id: DEMO_WS_ID,
      inventory_item_id: 'item-2',
      platform: 'kleinanzeigen',
      sale_price: 185.0,
      sale_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      platform_fee: 0,
      shipping_cost: 6.99,
      packaging_cost: 1.5,
      other_costs: 0,
      external_order_id: 'ORD-9874',
      buyer_notes: 'Barzahlung bei Abholung',
      inventory_item: {
        id: 'item-2',
        workspace_id: DEMO_WS_ID,
        title: 'Nintendo Switch OLED Konsole',
        condition: 'like_new',
        status: 'sold',
        allocated_purchase_cost: 19.0,
      },
    },
    {
      id: 'sale-2',
      workspace_id: DEMO_WS_ID,
      inventory_item_id: 'item-4',
      platform: 'ebay',
      sale_price: 75.0,
      sale_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      platform_fee: 8.5,
      shipping_cost: 5.49,
      packaging_cost: 1.2,
      other_costs: 0,
      external_order_id: 'EBAY-44129',
      buyer_notes: 'Sofort versendet',
      inventory_item: {
        id: 'item-4',
        workspace_id: DEMO_WS_ID,
        title: 'Alpha Industries Vintage Bomberjacke MA-1',
        condition: 'very_good',
        status: 'sold',
        allocated_purchase_cost: 32.0,
      },
    },
  ];

  // Helper with 800ms timeout
  async withTimeout<T>(promiseLike: any, fallback: T, ms: number = 800): Promise<T> {
    const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
    try {
      return await Promise.race([Promise.resolve(promiseLike), timeout]);
    } catch {
      return fallback;
    }
  }
}

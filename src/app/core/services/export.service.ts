import { Injectable } from '@angular/core';
import { Sale, Purchase, InventoryItem } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  /**
   * Generates a semicolon-separated CSV string for Sales (Excel/German accounting friendly).
   */
  generateSalesCsv(sales: Sale[]): string {
    const headers = [
      'Verkaufsdatum',
      'Artikel',
      'Plattform',
      'Verkaufspreis (€)',
      'Plattformgebuehr (€)',
      'Versandkosten (€)',
      'Verpackung (€)',
      'Sonstige Kosten (€)',
      'Nettogewinn (€)',
      'ROI (%)',
      'Haltedauer (Tage)',
      'Bestell-ID',
      'Notizen',
    ];

    const rows = sales.map((s) => [
      s.sale_date,
      this.escapeCsv(s.inventory_item?.title || 'Unbekannter Artikel'),
      this.escapeCsv(s.platform),
      s.sale_price.toFixed(2),
      s.platform_fee.toFixed(2),
      s.shipping_cost.toFixed(2),
      s.packaging_cost.toFixed(2),
      s.other_costs.toFixed(2),
      (s.net_profit || 0).toFixed(2),
      (s.roi || 0).toFixed(2),
      s.holding_duration_days || 0,
      this.escapeCsv(s.external_order_id || ''),
      this.escapeCsv(s.buyer_notes || ''),
    ]);

    return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  }

  /**
   * Generates CSV for Purchases.
   */
  generatePurchasesCsv(purchases: Purchase[]): string {
    const headers = [
      'Kaufdatum',
      'Titel',
      'Typ',
      'Quelle',
      'Lieferant',
      'Kaufpreis (€)',
      'Gesamtkosten (€)',
      'Kostenverteilung',
      'Artikelanzahl',
    ];

    const rows = purchases.map((p) => [
      p.purchase_date,
      this.escapeCsv(p.title),
      p.type,
      this.escapeCsv(p.source?.name || 'Direktkauf'),
      this.escapeCsv(p.supplier?.name || ''),
      p.purchase_price.toFixed(2),
      (p.total_purchase_cost ?? p.purchase_price).toFixed(2),
      p.cost_allocation_mode,
      p.items_count || 1,
    ]);

    return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  }

  /**
   * Generates CSV for Inventory.
   */
  generateInventoryCsv(items: InventoryItem[]): string {
    const headers = [
      'ID',
      'Titel',
      'Marke',
      'Modell',
      'Kategorie',
      'Zustand',
      'Status',
      'Anschaffungskosten (€)',
      'Gesamtkosten (€)',
      'Marktwert (€)',
      'Gewinnpotenzial (€)',
      'SKU',
      'EAN',
    ];

    const rows = items.map((i) => [
      i.id,
      this.escapeCsv(i.title),
      this.escapeCsv(i.brand || ''),
      this.escapeCsv(i.model || ''),
      this.escapeCsv(i.category || ''),
      i.condition,
      i.status,
      i.allocated_purchase_cost.toFixed(2),
      (i.total_item_cost ?? i.allocated_purchase_cost).toFixed(2),
      (Number(i.expected_value) || 0).toFixed(2),
      (i.profit_potential ?? 0).toFixed(2),
      this.escapeCsv(i.sku || ''),
      this.escapeCsv(i.ean || ''),
    ]);

    return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  }

  /**
   * Triggers a browser file download.
   */
  downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private escapeCsv(value: string): string {
    if (!value) return '';
    const clean = value.replace(/"/g, '""');
    return clean.includes(';') || clean.includes('\n') || clean.includes('"') ? `"${clean}"` : clean;
  }
}

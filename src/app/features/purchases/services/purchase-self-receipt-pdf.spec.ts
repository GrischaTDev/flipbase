import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { Purchase } from '../../../core/models/flipbase.models';
import { buildSelfReceiptContent, createSelfReceiptPdf } from './purchase-self-receipt-pdf';

const purchase = {
  id: 'purchase-1',
  record_number: 'E-2026-17',
  purchase_date: '2026-09-23',
  receipt_mode: 'self',
  seller_name: null,
  supplier_reference: 'V-123',
  purchase_price: 25,
  discount_amount: 0,
  source: { name: 'Vinted' },
  purchase_lines: [{ ordered_quantity: 1, title_snapshot: 'Grüner Pullover', line_total: 25 }],
  costs: [
    { type: 'shipping', description: 'Versand', amount: 3.49 },
    { type: 'fee', description: 'Plattformgebühr', amount: 1.95 },
  ],
} as Purchase;

describe('purchase self receipt PDF', () => {
  it('shows the available evidence without inventing a seller and keeps costs separate', () => {
    const content = buildSelfReceiptContent(
      purchase,
      'Mein Laden',
      new Date('2026-09-23T10:00:00Z'),
    );
    expect(content.title).toBe('Eigenbeleg E-2026-17');
    expect(content.lines).toContain('Verkäuferangabe: Nicht bekannt');
    expect(content.lines).toContain('Referenznummer: V-123');
    expect(content.lines).toContain('1 x Grüner Pullover – 25,00 EUR');
    expect(content.lines).toContain('Gesamtbetrag: 30,44 EUR');
  });

  it('creates a readable PDF with many positions and unsupported symbols', async () => {
    const content = buildSelfReceiptContent(
      {
        ...purchase,
        purchase_lines: Array.from({ length: 90 }, (_, index) => ({
          ...purchase.purchase_lines![0],
          title_snapshot: `Artikel ${index + 1} 🧥`,
        })),
      },
      'Mein Laden',
      new Date('2026-09-23T10:00:00Z'),
    );
    const bytes = await createSelfReceiptPdf(content);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toBe('Eigenbeleg E-2026-17');
  });
});

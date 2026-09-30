import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { Purchase } from '../../../core/models/flipbase.models';
import { buildSelfReceiptContent, createSelfReceiptPdf } from './purchase-self-receipt-pdf';
import { creditNoteSnapshotFixture } from '../../../../test-support/company-document.fixture';

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
  it('embeds the saved PNG logo and still produces a PDF when the image is corrupt', async () => {
    const content = buildSelfReceiptContent(
      purchase,
      creditNoteSnapshotFixture().seller,
      new Date('2026-09-30T10:00:00Z'),
    );
    const png = new Blob(
      [
        new Uint8Array(
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
            'base64',
          ),
        ),
      ],
      { type: 'image/png' },
    );
    const withLogo = await PDFDocument.load(await createSelfReceiptPdf(content, png));
    const images = withLogo.getPages()[0].node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    expect(images?.keys()).toHaveLength(1);
    const withoutLogo = await PDFDocument.load(
      await createSelfReceiptPdf(content, new Blob(['invalid'], { type: 'image/png' })),
    );
    expect(withoutLogo.getPageCount()).toBe(1);
    expect(withoutLogo.getTitle()).toBe(content.title);
  });
  it('shows the available evidence without inventing a seller and keeps costs separate', () => {
    const content = buildSelfReceiptContent(
      purchase,
      creditNoteSnapshotFixture().seller,
      new Date('2026-09-23T10:00:00Z'),
    );
    expect(content.title).toBe('Eigenbeleg E-2026-17');
    expect(content.lines).toContain('Aussteller: Anna Beispiel');
    expect(content.lines).toContain('Geschäftsanschrift: Testweg 1, 12345 Bonn, DE');
    expect(content.lines).toContain('Steuernummer: 123/456/789');
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
      creditNoteSnapshotFixture().seller,
      new Date('2026-09-23T10:00:00Z'),
    );
    const bytes = await createSelfReceiptPdf(content);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toBe('Eigenbeleg E-2026-17');
  });
});

import { Purchase, PurchaseCost, PurchaseLine } from '../../../core/models/flipbase.models';

export interface SelfReceiptContent {
  readonly title: string;
  readonly lines: readonly string[];
}

function money(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} EUR`;
}

export function buildSelfReceiptContent(
  purchase: Purchase,
  workspaceName: string,
  issuedAt: Date,
): SelfReceiptContent {
  const lines: string[] = [
    `Einkaufsnummer: ${purchase.record_number ?? purchase.id}`,
    `Ausgestellt am: ${issuedAt.toLocaleDateString('de-DE')}`,
    `Kaufdatum: ${new Date(`${purchase.purchase_date}T12:00:00`).toLocaleDateString('de-DE')}`,
    `Aussteller: ${workspaceName}`,
    `Bezugsquelle: ${purchase.source?.name ?? 'Nicht angegeben'}`,
    `Verkäuferangabe: ${purchase.seller_name ?? 'Nicht bekannt'}`,
    `Referenznummer: ${purchase.supplier_reference ?? 'Nicht angegeben'}`,
    '',
    'Gekaufte Artikel',
  ];

  const purchaseLines: readonly PurchaseLine[] = purchase.purchase_lines ?? [];
  for (const line of purchaseLines) {
    lines.push(
      `${line.ordered_quantity} x ${line.title_snapshot} – ${line.line_total === null ? 'Preis offen' : money(Number(line.line_total))}`,
    );
  }
  if (purchaseLines.length === 0) lines.push(purchase.notes ?? purchase.title);

  lines.push('', `Warenbetrag: ${money(Number(purchase.purchase_price ?? 0))}`);
  if (Number(purchase.discount_amount ?? 0) > 0) {
    lines.push(`Rabatt: -${money(Number(purchase.discount_amount))}`);
  }
  const costs: readonly PurchaseCost[] = purchase.costs ?? [];
  for (const cost of costs) {
    lines.push(`${cost.description?.trim() || cost.type}: ${money(Number(cost.amount))}`);
  }
  const total =
    Number(purchase.purchase_price ?? 0) -
    Number(purchase.discount_amount ?? 0) +
    costs.reduce((sum, cost) => sum + Number(cost.amount), 0);
  lines.push('', `Gesamtbetrag: ${money(total)}`);
  lines.push('', 'Grund: Verkäufer nicht vollständig identifizierbar.');
  lines.push('Externe Nachweise sind, sofern vorhanden, separat beim Einkauf hinterlegt.');
  return { title: `Eigenbeleg ${purchase.record_number ?? purchase.id}`, lines };
}

export async function createSelfReceiptPdf(content: SelfReceiptContent): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());
  const printable = (value: string): string =>
    Array.from(value, (character) =>
      supported.has(character.codePointAt(0) ?? 0) ? character : '?',
    ).join('');

  let page = pdf.addPage([595, 842]);
  let y = 790;
  const drawLine = (value: string, headline = false): void => {
    const activeFont = headline ? bold : font;
    const size = headline ? 17 : 10;
    const words = printable(value).split(/\s+/u);
    let row = '';
    const rows: string[] = [];
    for (const word of words) {
      const candidate = row ? `${row} ${word}` : word;
      if (activeFont.widthOfTextAtSize(candidate, size) > 495 && row) {
        rows.push(row);
        row = word;
      } else {
        row = candidate;
      }
    }
    rows.push(row);
    for (const text of rows) {
      if (y < 55) {
        page = pdf.addPage([595, 842]);
        y = 790;
      }
      if (text) page.drawText(text, { x: 50, y, size, font: activeFont, color: rgb(0, 0, 0) });
      y -= headline ? 27 : 17;
    }
  };

  drawLine(content.title, true);
  y -= 8;
  for (const line of content.lines) drawLine(line);
  pdf.setTitle(content.title);
  return pdf.save();
}

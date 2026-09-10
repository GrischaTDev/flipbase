import { CatalogProduct, ItemCondition } from '../../../../core/models/flipbase.models';
import { parseCsv } from '../../../../shared/utils/csv';
import { canonicalGtin, normalizeGtin } from '../../../../shared/utils/gtin';

export interface PurchaseImportPreviewRow {
  readonly rowNumber: number;
  readonly title: string;
  readonly ean: string | null;
  readonly quantity: number | null;
  readonly condition: ItemCondition | null;
  readonly unitPrice: number | null;
  readonly total: number | null;
  readonly productId: string | null;
  readonly candidateIds: readonly string[];
  readonly errors: readonly string[];
  readonly assignmentError: string | null;
}

export function previewPurchaseImport(
  text: string,
  products: readonly CatalogProduct[],
  workspaceId: string,
): readonly PurchaseImportPreviewRow[] {
  const parsed = parseCsv(text);
  if (!parsed.headers.includes('title')) throw new Error('CSV benötigt die Spalte „title“.');
  if (parsed.rows.length > 1000)
    throw new Error('Höchstens 1.000 Einkaufspositionen sind erlaubt.');
  if (!parsed.rows.length) throw new Error('CSV enthält keine Datenzeilen.');
  const byEan = new Map<string, CatalogProduct[]>();
  const byTitle = new Map<string, CatalogProduct[]>();
  for (const product of products) {
    if (product.workspace_id !== workspaceId) continue;
    const ean = canonicalGtin(product.ean);
    const title = product.title.trim().toLocaleLowerCase('de');
    if (ean) byEan.set(ean, [...(byEan.get(ean) ?? []), product]);
    byTitle.set(title, [...(byTitle.get(title) ?? []), product]);
  }
  return parsed.rows.map((row, index) => {
    const errors: string[] = [];
    const title = row['title']?.trim() ?? '';
    if (!title) errors.push('Produktname fehlt.');
    const rawEan = row['ean']?.trim() ?? '';
    const ean = rawEan ? normalizeGtin(rawEan) : null;
    if (rawEan && !ean) errors.push('EAN/GTIN ist ungültig.');
    const rawQuantity = row['quantity']?.trim() || '1';
    let quantity: number | null = Number(rawQuantity);
    if (
      !/^\d+$/.test(rawQuantity) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 100000
    ) {
      errors.push('Menge muss eine ganze Zahl zwischen 1 und 100.000 sein.');
      quantity = null;
    }
    const rawCondition = row['condition']?.trim() ?? '';
    const conditions: readonly string[] = [
      'new',
      'like_new',
      'very_good',
      'used',
      'heavily_used',
      'defective',
    ];
    const condition = conditions.includes(rawCondition) ? (rawCondition as ItemCondition) : null;
    if (rawCondition && !condition) errors.push('Zustand ist ungültig.');
    const rawPrice = row['unit_purchase_price']?.trim() ?? '';
    let cents: number | null = null;
    if (rawPrice) {
      const value = Number(rawPrice.replace(',', '.'));
      if (
        !/^\d+(?:[.,]\d{1,2})?$/.test(rawPrice) ||
        !Number.isFinite(value) ||
        value > 9999999999.99
      ) {
        errors.push(
          'Stückpreis muss ein nichtnegativer Betrag mit höchstens zwei Nachkommastellen sein.',
        );
      } else {
        cents = Math.round(value * 100);
      }
    }
    let totalCents = cents === null || quantity === null ? null : cents * quantity;
    if (totalCents !== null && (!Number.isSafeInteger(totalCents) || totalCents > 999999999999)) {
      errors.push('Gesamtbetrag ist zu groß.');
      totalCents = null;
    }
    const matches = rawEan
      ? (byEan.get(canonicalGtin(ean) ?? '') ?? [])
      : (byTitle.get(title.toLocaleLowerCase('de')) ?? []);
    const productId =
      matches.length === 1 && (!condition || matches[0].condition === condition)
        ? matches[0].id
        : null;
    const assignmentError =
      matches.length === 0
        ? 'Produkt zuordnen.'
        : matches.length > 1
          ? 'Mehrere Produkte passen. Bitte zuordnen.'
          : productId
            ? null
            : 'Produktzustand weicht ab oder fehlt. Bitte bewusst zuordnen.';
    if (assignmentError) errors.push(assignmentError);
    return {
      rowNumber: index + 2,
      title,
      ean,
      quantity,
      condition,
      unitPrice: cents === null ? null : cents / 100,
      total: totalCents === null ? null : totalCents / 100,
      productId,
      candidateIds: matches.map((product) => product.id),
      errors,
      assignmentError,
    };
  });
}

import { Purchase, PurchaseLine } from '../models/flipbase.models';

export interface ProductLineCostPlan {
  readonly line: PurchaseLine;
  readonly totalCents: number;
  readonly additionalCents: number;
  readonly unitCents: readonly number[];
}

function cents(value: number | null): number {
  if (
    value === null ||
    !Number.isFinite(value) ||
    value < 0 ||
    value !== Number(value.toFixed(2)) ||
    value > 9999999999.99
  ) {
    throw new Error('Kosten müssen als nichtnegative ganze Cent angegeben sein.');
  }
  return Math.round(value * 100);
}

function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || weights.length === 0)
    throw new Error('Ungültige Kostenverteilung.');
  const sum = weights.reduce((value, weight) => value + BigInt(weight), 0n);
  if (total === 0) return weights.map(() => 0);
  if (sum === 0n) throw new Error('Die Summe der Verteilungsgewichte muss positiv sein.');
  const shares = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return { index, cents: Number(numerator / sum), remainder: numerator % sum };
  });
  const rest = total - shares.reduce((value, share) => value + share.cents, 0);
  const order = [...shares].sort((left, right) =>
    left.remainder === right.remainder
      ? left.index - right.index
      : left.remainder > right.remainder
        ? -1
        : 1,
  );
  for (const share of order.slice(0, rest)) share.cents += 1;
  return shares.map((share) => share.cents);
}

/** Dieselbe stabile Centverteilung wie der SQL-Kostenplan, ohne Bestandsmutation. */
export function buildProductCostPlan(
  purchase: Purchase,
  input: readonly PurchaseLine[],
): readonly ProductLineCostPlan[] {
  const lines = [...input].sort(
    (left, right) =>
      (left.created_at ?? '').localeCompare(right.created_at ?? '') ||
      left.id.localeCompare(right.id),
  );
  const units = lines.reduce((sum, line) => sum + line.ordered_quantity, 0);
  if (
    !lines.length ||
    lines.length > 1000 ||
    units > 100000 ||
    lines.some(
      (line) =>
        !Number.isInteger(line.ordered_quantity) ||
        line.ordered_quantity < 1 ||
        line.workspace_id !== purchase.workspace_id ||
        line.purchase_id !== purchase.id,
    )
  ) {
    throw new Error('Die Einkaufspositionen sind ungültig.');
  }
  const discount = cents(purchase.discount_amount ?? 0);
  const costs = [...(purchase.costs ?? [])].sort(
    (left, right) =>
      (left.created_at ?? '').localeCompare(right.created_at ?? '') ||
      (left.id ?? '').localeCompare(right.id ?? ''),
  );
  const additional = costs.reduce((sum, cost) => sum + cents(cost.amount), 0);
  if (
    (purchase.pricing_mode ?? (purchase.type === 'mystery_pack' ? 'total' : 'individual')) ===
    'total'
  ) {
    if (lines.some((line) => line.unit_purchase_price !== null || line.line_total !== null))
      throw new Error('Gesamtpreispositionen müssen unbepreist sein.');
    const goods = cents(purchase.purchase_price) - discount;
    const goodsUnits = allocate(goods, Array<number>(units).fill(1));
    const totalUnits = allocate(goods + additional, Array<number>(units).fill(1));
    let offset = 0;
    return lines.map((line) => {
      const unitCents = totalUnits.slice(offset, offset + line.ordered_quantity);
      const goodsCents = goodsUnits
        .slice(offset, offset + line.ordered_quantity)
        .reduce((sum, value) => sum + value, 0);
      offset += line.ordered_quantity;
      const totalCents = unitCents.reduce((sum, value) => sum + value, 0);
      return { line, totalCents, additionalCents: totalCents - goodsCents, unitCents };
    });
  }
  const goods = lines.map((line) => {
    const unit = cents(line.unit_purchase_price);
    const total = cents(line.line_total);
    if (unit * line.ordered_quantity !== total)
      throw new Error('Der Positionsbetrag widerspricht Menge und Stückpreis.');
    return total;
  });
  const goodsTotal = goods.reduce((sum, value) => sum + value, 0);
  if (purchase.purchase_price !== null && cents(purchase.purchase_price) !== goodsTotal)
    throw new Error('Der Warenbetrag widerspricht den Positionspreisen.');
  if (discount > goodsTotal) throw new Error('Der Rabatt überschreitet den Warenbetrag.');
  const discounts = allocate(discount, goods);
  const extras = lines.map(() => 0);
  for (const cost of costs) {
    const amount = cents(cost.amount);
    let shares: number[];
    if (cost.allocation_method === 'direct') {
      const index = lines.findIndex((line) => line.id === cost.target_purchase_line_id);
      if (index < 0)
        throw new Error('Direkte Zusatzkosten benötigen eine Position desselben Einkaufs.');
      shares = lines.map((_line, position) => (position === index ? amount : 0));
    } else {
      shares = allocate(
        amount,
        cost.allocation_method === 'quantity' ? lines.map((line) => line.ordered_quantity) : goods,
      );
    }
    shares.forEach((share, index) => {
      extras[index] += share;
    });
  }
  return lines.map((line, index) => {
    const totalCents = goods[index] - discounts[index] + extras[index];
    const weights = Array<number>(line.ordered_quantity).fill(1);
    const goodsUnits = allocate(goods[index] - discounts[index], weights);
    const extraUnits = allocate(extras[index], weights);
    return {
      line,
      totalCents,
      additionalCents: extras[index],
      unitCents: goodsUnits.map((value, position) => value + extraUnits[position]),
    };
  });
}

/** Reine Anzeigeprojektionen. Buchungs- und Kostenregeln bleiben im DashboardReportService. */
export function platformLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    ebay: 'eBay',
    vinted: 'Vinted',
    kleinanzeigen: 'Kleinanzeigen',
    direct: 'Direktverkauf',
    custom_store: 'Shop',
  };
  return labels[value] ?? value;
}

export function platformDistribution(rows: readonly { platform: string; revenue: number }[]) {
  const cents = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isFinite(row.revenue)) continue;
    cents.set(row.platform, (cents.get(row.platform) ?? 0) + Math.round(row.revenue * 100));
  }
  const sorted = [...cents].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
  const total = sorted.reduce((sum, [, amount]) => sum + amount, 0);
  const drawable = total > 0 && sorted.every(([, amount]) => amount >= 0);
  const shown = sorted.length > 4 ? sorted.slice(0, 3) : sorted;
  const entries = shown.map(([key, amount]) => ({ key, label: platformLabel(key), amount }));
  if (sorted.length > 4) {
    entries.push({
      key: '__other__',
      label: 'Sonstige',
      amount: sorted.slice(3).reduce((sum, [, amount]) => sum + amount, 0),
    });
  }
  let offset = 0;
  return {
    total: total / 100,
    drawable,
    entries: entries.map((entry, index) => {
      const share = drawable ? (entry.amount / total) * 100 : 0;
      const result = { ...entry, revenue: entry.amount / 100, share, offset, index };
      offset += share;
      return result;
    }),
  };
}

interface StockItem {
  readonly status: string;
  readonly purchase?: { readonly purchase_date?: string };
  readonly created_at?: string;
}

interface StockLot {
  readonly remaining_quantity: number;
  readonly received_at: string;
}

/** Kalendertage statt Stunden: Eine Zeitumstellung darf keinen Artikel in eine andere Gruppe verschieben. */
function calendarDay(value: string | undefined): number | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day)
    return null;
  return date.getTime() / 86400000;
}

export function stockOverview(
  items: readonly StockItem[],
  lots: readonly StockLot[],
  now = new Date(),
) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
  const result = { units: 0, slow: 0, old: 0, unknownAge: 0 };
  const add = (quantity: number, date: string | undefined) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    result.units += quantity;
    const day = calendarDay(date);
    if (day === null || day > today) result.unknownAge += quantity;
    else if (today - day > 90) result.old += quantity;
    else if (today - day > 60) result.slow += quantity;
  };
  // Derselbe physische Bestand wie in DashboardReportService.inventoryValue, auch reservierte Ware.
  for (const item of items) {
    if (item.status !== 'sold' && item.status !== 'archived')
      add(1, item.purchase?.purchase_date ?? item.created_at);
  }
  for (const lot of lots) add(lot.remaining_quantity, lot.received_at);
  return result;
}

export function sparklinePath(values: readonly (number | null)[]): string {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!known.length) return '';
  const low = Math.min(...known);
  const span = Math.max(...known) - low;
  let penDown = false;
  return values
    .map((value, index) => {
      if (value === null || !Number.isFinite(value)) {
        penDown = false;
        return '';
      }
      const x = values.length === 1 ? 50 : 2 + (index / (values.length - 1)) * 96;
      const y = span === 0 ? 28 : 46 - ((value - low) / span) * 40;
      const command = `${penDown ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
      penDown = true;
      return command;
    })
    .join(' ');
}

export function salesVolumes(
  points: readonly { date: string }[],
  rows: readonly { date: string }[],
  monthly: boolean,
): number[] {
  const counts = new Map<string, number>();
  const key = (date: string) => date.slice(0, monthly ? 7 : 10);
  for (const row of rows) counts.set(key(row.date), (counts.get(key(row.date)) ?? 0) + 1);
  return points.map((point) => counts.get(key(point.date)) ?? 0);
}

import { record } from './analysis.ts';
import {
  parseListingPublicationLabel,
  readVintedListingPage,
  vintedListingUrl,
} from './listing-details.ts';

export interface ComparisonListingDate {
  status: 'within_window' | 'outside_window' | 'unknown';
  earliest: string | null;
  latest: string | null;
  label: string | null;
  checkedAt: string | null;
  source: 'vinted_listing' | 'unverified';
}

const day = 86_400_000;
const windowDays = 30;
const maxListings = 6;
const minimumIntervalMs = 2500;
const verificationBudgetMs = 20_000;

function unknownDate(): ComparisonListingDate {
  return {
    status: 'unknown',
    earliest: null,
    latest: null,
    label: null,
    checkedAt: null,
    source: 'unverified',
  };
}

/** Relative Quellenangaben liefern ein Intervall, niemals ein erfundenes exaktes Datum. */
export function parseComparisonListingDate(
  label: string | null,
  checkedAt: Date,
  windowEnd: Date = checkedAt,
): ComparisonListingDate {
  const result: ComparisonListingDate = {
    ...unknownDate(),
    label,
    checkedAt: checkedAt.toISOString(),
    source: 'vinted_listing',
  };
  if (!label) return result;
  const text = label
    .trim()
    .toLowerCase()
    .replace(/^vor\s+/, '');
  let earliest: number;
  let latest: number;
  // Nur ausdrücklich als Uploadangabe gelesene ISO-Daten, keine Foto-/Indexzeitstempel.
  const iso = /^\d{4}-\d{2}-\d{2}(?:t\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:z|[+-]\d{2}:\d{2}))?$/i;
  if (iso.test(text)) {
    const dateOnly = text.slice(0, 10);
    const date = Date.parse(`${dateOnly}T00:00:00Z`);
    if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== dateOnly)
      return result;
    earliest = Date.parse(label.length === 10 ? `${label}T00:00:00Z` : label);
    // Eine reine Datumsangabe enthält keine Uhrzeit. Zeitzonen bleiben konservativ offen.
    latest = label.length === 10 ? earliest + day + 14 * 3_600_000 : earliest;
    if (label.length === 10) earliest -= 14 * 3_600_000;
  } else if (['heute', 'gerade eben', 'soeben', 'jetzt'].includes(text)) {
    earliest = checkedAt.getTime() - day;
    latest = checkedAt.getTime();
  } else if (text === 'gestern') {
    earliest = checkedAt.getTime() - 2 * day;
    latest = checkedAt.getTime();
  } else {
    const relative =
      /^(\d{1,4}|ein(?:e|er|em|en)?)\s*(min(?:\.|ute[n]?)?|h|stunde[n]?|tag(?:e|en)?|woche[n]?|monat(?:e|en)?|jahr(?:e|en)?)$/i.exec(
        text,
      );
    if (!relative) return result;
    const count = /^ein/.test(relative[1]) ? 1 : Number(relative[1]);
    const unit = relative[2];
    const range = unit.startsWith('min')
      ? [60_000, 60_000]
      : unit === 'h' || unit.startsWith('stunde')
        ? [3_600_000, 3_600_000]
        : unit.startsWith('tag')
          ? [day, day]
          : unit.startsWith('woche')
            ? [7 * day, 7 * day]
            : unit.startsWith('monat')
              ? [28 * day, 31 * day]
              : [365 * day, 366 * day];
    // Ohne bekannte Rundungsregel je eine volle Einheit Unsicherheit berücksichtigen.
    earliest = checkedAt.getTime() - (count + 1) * range[1];
    latest = checkedAt.getTime() - Math.max(0, count - 1) * range[0];
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest) || earliest > latest) return result;
  result.earliest = new Date(earliest).toISOString();
  result.latest = new Date(latest).toISOString();
  const end = windowEnd.getTime();
  const start = end - windowDays * day;
  if (earliest >= start && latest <= end) result.status = 'within_window';
  else if (latest < start) result.status = 'outside_window';
  return result;
}

function waitForNextRequest(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const finish = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Prüft höchstens sechs tatsächliche Vinted-Quellen innerhalb des Recherchezeitbudgets. */
export async function verifyComparisonDates(
  comparisons: unknown[],
  now: Date,
  signal: AbortSignal,
): Promise<unknown[]> {
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(verificationBudgetMs)]);
  const checked = new Map<string, ComparisonListingDate>();
  let previousStartedAt: number | null = null;
  const results: unknown[] = [];
  for (const value of comparisons) {
    const comparison = record(value);
    if (!comparison) {
      results.push(value);
      continue;
    }
    // Übergebene KI-Datumsangaben sind kein Nachweis und werden immer ersetzt.
    let listingDate = unknownDate();
    const target = ['asking', 'sold'].includes(String(comparison['kind']))
      ? vintedListingUrl(comparison['url'])
      : null;
    if (target && checked.has(target.itemId)) {
      listingDate = checked.get(target.itemId)!;
    } else if (target && checked.size < maxListings && !boundedSignal.aborted) {
      checked.set(target.itemId, listingDate);
      try {
        if (previousStartedAt !== null) {
          const wait = minimumIntervalMs - (Date.now() - previousStartedAt);
          if (wait > 0) await waitForNextRequest(wait, boundedSignal);
        }
        boundedSignal.throwIfAborted();
        previousStartedAt = Date.now();
        const { html, itemId } = await readVintedListingPage(
          target.url.href,
          AbortSignal.any([boundedSignal, AbortSignal.timeout(5000)]),
        );
        listingDate = parseComparisonListingDate(
          parseListingPublicationLabel(html, itemId),
          new Date(Math.max(now.getTime(), Date.now())),
        );
        checked.set(target.itemId, listingDate);
      } catch {
        // Nicht erreichbare, zu große oder verspätete Quellen bleiben zeitlich unbelegt.
      }
    }
    results.push({ ...comparison, listingDate });
  }
  return results;
}

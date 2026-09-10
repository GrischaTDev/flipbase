import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { BusinessEvent } from '../../../core/models/business-event.models';

interface RecordHistoryDetail {
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|password|api[_-]?key|authorization|webhook[_-]?url/iu.test(key);
}

function equalSnapshotValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => equalSnapshotValue(value, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && equalSnapshotValue(left[key], right[key]))
    );
  }
  return false;
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  before: 'Vorher',
  after: 'Nachher',
  purchase_price: 'Einkaufspreis',
  total_purchase_cost: 'Gesamte Einkaufskosten',
  allocated_total_cost: 'Zugeordnete Gesamtkosten',
  entry_status: 'Status',
  sale_id: 'Verkauf',
  refund_amount: 'Erstattungsbetrag',
  returned_at: 'Retourniert am',
  is_full_refund: 'Vollerstattung',
  restock_action: 'Wiedereinlagerung',
  restocked_quantity: 'Wiedereingelagerte Menge',
  migration: 'Übernahme',
  item_count: 'Artikelanzahl',
  purchase: 'Einkauf',
  costs: 'Kosten',
  inventory_items: 'Bestandsartikel',
  lines: 'Positionen',
  title: 'Bezeichnung',
  title_snapshot: 'Bezeichnung',
  ordered_quantity: 'Menge',
  unit_purchase_price: 'Stückpreis',
  line_total: 'Positionssumme',
  amount: 'Betrag',
  description: 'Beschreibung',
  type: 'Art',
  allocation_method: 'Kostenverteilung',
  target_line: 'Zielposition',
  source_id: 'Bezugsquelle',
  supplier_id: 'Verkäufer',
  purchase_date: 'Einkaufsdatum',
  cost_allocation_mode: 'Kostenverteilung',
  notes: 'Notizen',
  tracking_number: 'Sendungsnummer',
  tracking_carrier: 'Versanddienstleister',
  tracking_status: 'Sendungsstatus',
  original_url: 'Angebotslink',
  content_status: 'Inhaltskenntnis',
  pricing_mode: 'Preisführung',
  supplier_reference: 'Verkäuferreferenz',
  discount_amount: 'Rabatt',
  catalog_product_id: 'Katalogartikel',
  ean_snapshot: 'EAN',
  line_kind: 'Positionsart',
  allocated_additional_cost: 'Zugeordnete Zusatzkosten',
  price_mode: 'Preisführung',
  condition_snapshot: 'Zustand',
  estimated_market_value: 'Geschätzter Marktwert',
  direct_costs: 'Direkte Kosten',
};

function humanizeKey(key: string): string {
  const label = FIELD_LABELS[key];
  if (label) return label;
  const words = key.replaceAll('_', ' ').replaceAll('-', ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Wert';
}

function formatValue(value: unknown, key: string): string {
  if (isSensitiveKey(key)) return '[geschützt]';
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  if (typeof value === 'number') return new Intl.NumberFormat('de-DE').format(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return `${value.length} Einträge`;
  return 'Mehrere Werte';
}

export function mapRecordHistoryDetails(changes: unknown): readonly RecordHistoryDetail[] {
  const result: RecordHistoryDetail[] = [];

  const compare = (before: unknown, after: unknown, path: readonly string[]): void => {
    if (before === after || (before == null && after == null)) return;
    const key = path.at(-1) ?? '';
    const sensitive = path.some(isSensitiveKey);
    if (!sensitive && (isRecord(before) || isRecord(after))) {
      const previous = isRecord(before) ? before : {};
      const current = isRecord(after) ? after : {};
      for (const field of new Set([...Object.keys(previous), ...Object.keys(current)])) {
        compare(previous[field], current[field], [...path, field]);
      }
      return;
    }
    if (!sensitive && (Array.isArray(before) || Array.isArray(after))) {
      const previous: readonly unknown[] = Array.isArray(before) ? before : [];
      const current: readonly unknown[] = Array.isArray(after) ? after : [];
      const matched = new Set<number>();
      previous.forEach((value, index) => {
        const match = current.findIndex(
          (candidate, candidateIndex) =>
            !matched.has(candidateIndex) && equalSnapshotValue(value, candidate),
        );
        if (match >= 0) matched.add(match);
        else compare(value, undefined, [...path, 'before', String(index + 1)]);
      });
      current.forEach((value, index) => {
        if (!matched.has(index)) compare(undefined, value, [...path, 'after', String(index + 1)]);
      });
      return;
    }
    result.push({
      label: path.map(humanizeKey).join(' · ') || 'Wert',
      before: sensitive ? '[geschützt]' : formatValue(before, key),
      after: sensitive ? '[geschützt]' : formatValue(after, key),
    });
  };

  const visit = (value: unknown, path: readonly string[]): void => {
    if (!isRecord(value)) return;
    if ('before' in value || 'after' in value) {
      compare(value['before'], value['after'], path);
      return;
    }
    for (const [key, nestedValue] of Object.entries(value)) {
      visit(nestedValue, [...path, key]);
    }
  };

  visit(changes, []);
  return result;
}

@Component({
  selector: 'app-record-history',
  imports: [],
  templateUrl: './record-history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordHistoryComponent {
  readonly heading = input('Änderungsverlauf');
  readonly events = input<readonly BusinessEvent[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly hasMore = input(false);

  readonly retryRequested = output<void>();
  readonly loadMoreRequested = output<void>();
  readonly expandedEventId = signal<string | null>(null);
  readonly latestEvent = computed(() =>
    this.events().reduce<BusinessEvent | null>(
      (latest, event) =>
        !latest || Date.parse(event.createdAt) > Date.parse(latest.createdAt) ? event : latest,
      null,
    ),
  );

  toggleDetails(eventId: string): void {
    this.expandedEventId.update((expandedId) => (expandedId === eventId ? null : eventId));
  }

  detailsFor(event: BusinessEvent): readonly RecordHistoryDetail[] {
    return mapRecordHistoryDetails(event.changes);
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  actorLabel(event: BusinessEvent): string {
    return event.actorId ?? 'Automatisches System';
  }
}

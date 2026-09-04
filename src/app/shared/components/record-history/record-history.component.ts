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

const FIELD_LABELS: Readonly<Record<string, string>> = {
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

  const visit = (value: unknown, path: readonly string[]): void => {
    if (!isRecord(value)) return;
    if ('before' in value || 'after' in value) {
      const key = path.at(-1) ?? '';
      result.push({
        label: path.map(humanizeKey).join(' · ') || 'Wert',
        before: formatValue(value['before'], key),
        after: formatValue(value['after'], key),
      });
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

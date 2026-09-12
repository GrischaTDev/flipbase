import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { BusinessEvent } from '../../../core/models/business-event.models';
import { mapRecordChanges } from '../../utils/record-changes';

interface RecordHistoryDetail {
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

/**
 * Der eigentliche Vergleich liegt in `mapRecordChanges`; hier wird er nur auf
 * die Vorher-/Nachher-Darstellung dieses Verlaufs übersetzt.
 */
export function mapRecordHistoryDetails(changes: unknown): readonly RecordHistoryDetail[] {
  return mapRecordChanges(changes).map((change) => ({
    label: change.label,
    before: change.from ?? '—',
    after: change.to ?? '—',
  }));
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

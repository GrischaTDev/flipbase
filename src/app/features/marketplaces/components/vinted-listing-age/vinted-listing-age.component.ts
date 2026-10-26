import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import {
  validListingTimestamp,
  vintedListingAge,
  type VintedPublicationAge,
} from '../../models/vinted-listing-age';
import type { VintedPublicationState } from '../../models/vinted-publication-state';
import { VintedListingClockService } from '../../services/vinted-listing-clock.service';

@Component({
  selector: 'app-vinted-listing-age',
  imports: [BadgeComponent],
  templateUrl: './vinted-listing-age.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedListingAgeComponent {
  readonly publishedAt = input<string | null | undefined>(null);
  readonly publishedOn = input<string | null | undefined>(null);
  readonly publicationAge = input<VintedPublicationAge | null | undefined>(null);
  readonly createdAt = input<string | null | undefined>(null);
  readonly publicationState = input<VintedPublicationState | 'processing' | undefined>(undefined);
  readonly compact = input(false);
  private readonly clock = inject(VintedListingClockService);
  private readonly canShowPublication = computed(() => {
    const state = this.publicationState();
    return state === undefined || state === 'active' || state === 'reserved';
  });
  readonly age = computed(() => {
    const age = vintedListingAge(
      this.canShowPublication() ? this.publishedAt() : null,
      this.clock.now(),
      this.canShowPublication() || this.publicationState() === 'unknown'
        ? this.publicationAge()
        : null,
      this.canShowPublication() ? this.publishedOn() : null,
      this.createdAt(),
    );
    // Eine gelesene Altersangabe bleibt verwertbar, bestätigt aber keinen aktuellen Onlinestatus.
    return this.publicationState() === 'unknown' && age.approximate
      ? {
          ...age,
          compact: age.compact === 'Neu' ? '< 1 Tag' : age.compact,
          text: age.text.replace(' online', ' · Vinted-Angabe'),
          tone: 'neutral' as const,
          overdue: false,
        }
      : age;
  });
  readonly label = computed(() => this.age().text);
  readonly dateTitle = computed(() => {
    const title = this.age().dateOnly
      ? `${this.label()} · Veröffentlicht am: ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(this.publishedOn()! + 'T00:00:00Z'))}`
      : this.age().tone === 'neutral' || this.age().approximate
        ? this.label() + (this.age().approximate ? ' · Gerundete Angabe von Vinted' : '')
        : `${this.label()} · Veröffentlicht: ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(this.publishedAt()!))}`;
    const created = validListingTimestamp(this.createdAt(), this.clock.now());
    return created === null
      ? title
      : `${title} · Erstellt: ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(created)}`;
  });
}

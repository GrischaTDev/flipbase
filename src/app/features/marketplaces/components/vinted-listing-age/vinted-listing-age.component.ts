import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { vintedListingAge } from '../../models/vinted-listing-age';
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
  readonly compact = input(false);
  private readonly clock = inject(VintedListingClockService);
  readonly age = computed(() => vintedListingAge(this.publishedAt(), this.clock.now()));
  readonly label = computed(
    () => this.age().text + (this.age().overdue ? ' · Wochenziel überschritten' : ''),
  );
  readonly dateTitle = computed(() =>
    this.age().tone === 'neutral'
      ? this.label()
      : `${this.label()} · Veröffentlicht: ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(this.publishedAt()!))}`,
  );
}

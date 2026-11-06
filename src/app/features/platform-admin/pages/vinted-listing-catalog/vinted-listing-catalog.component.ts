import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LucideRefreshCw, LucideTag } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import {
  vintedListingCatalogCurrentPercent,
  type VintedListingCatalogStatus,
} from '../../models/vinted-listing-catalog-status';
import { VintedListingCatalogAdminService } from '../../services/vinted-listing-catalog-admin.service';

/** Stand des lokalen Vinted-Katalogs mit Neu-Einlesen auf Knopfdruck. */
@Component({
  selector: 'app-vinted-listing-catalog',
  imports: [DatePipe, DecimalPipe, ButtonComponent, CardComponent, PageHeaderComponent],
  templateUrl: './vinted-listing-catalog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingCatalogComponent {
  private readonly api = inject(VintedListingCatalogAdminService);
  readonly catalogIcon = LucideTag;
  readonly refreshIcon = LucideRefreshCw;
  readonly status = signal<VintedListingCatalogStatus | null>(null);
  readonly loading = signal(false);
  readonly requesting = signal(false);
  readonly error = signal<string | null>(null);
  readonly currentPercent = computed(() => {
    const status = this.status();
    return status ? vintedListingCatalogCurrentPercent(status) : 0;
  });
  /** Ein offener Auftrag ist erledigt, sobald nichts mehr fällig ist. */
  readonly refreshRunning = computed(() => {
    const status = this.status();
    return !!status?.refreshRequestedAt && status.leavesDue > 0;
  });

  constructor() {
    void this.load();
    // Fortschritt eines Auftrags sichtbar halten, ohne die Seite neu zu laden.
    const timer = setInterval(() => void this.load(), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      this.status.set(await this.api.status());
      this.error.set(null);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Der Stand konnte nicht geladen werden.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async requestRefresh(): Promise<void> {
    if (this.requesting()) return;
    this.requesting.set(true);
    try {
      await this.api.requestRefresh();
      this.error.set(null);
      await this.load();
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Das Neu-Einlesen konnte nicht angefordert werden.',
      );
    } finally {
      this.requesting.set(false);
    }
  }
}

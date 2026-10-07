import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { SniperAdminState } from '../../services/sniper-admin-state';
import { formatBotUptime, queryStatusLabel } from '../../models/sniper-query.model';
import { VintedCategoriesComponent } from '../vinted-categories/vinted-categories.component';
import { SniperBrowserConnectComponent } from '../../components/sniper-browser-connect/sniper-browser-connect.component';
import { SniperBrowserService } from '../../services/sniper-browser.service';
import type { SniperBrowserStatus } from '../../models/sniper-browser.model';

@Component({
  selector: 'app-sniper-operation',
  imports: [
    DatePipe,
    DecimalPipe,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    VintedCategoriesComponent,
    SniperBrowserConnectComponent,
  ],
  templateUrl: './sniper-operation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SniperAdminState],
})
export class SniperOperationComponent {
  readonly state = inject(SniperAdminState);
  readonly problemQueries = computed(() =>
    this.state
      .queries()
      .filter((q) => ['rate_limited', 'forbidden', 'failed'].includes(q.last_status)),
  );
  readonly stoppedQueries = computed(() => this.problemQueries().filter((q) => !q.is_active));
  readonly activeProblemQueries = computed(() => this.problemQueries().filter((q) => q.is_active));
  readonly activeCount = computed(() => this.state.queries().filter((q) => q.is_active).length);
  readonly categoriesOpen = signal(false);
  readonly browserOpen = signal(false);
  readonly browserStatus = signal<SniperBrowserStatus | null>(null);
  readonly browserError = signal<string | null>(null);
  readonly manualRequired = computed(() =>
    ['interaction_required', 'manual'].includes(this.browserStatus()?.state ?? ''),
  );
  private readonly browserApi = inject(SniperBrowserService);
  private statusPending = false;
  private destroyed = false;
  readonly statusLabel = queryStatusLabel;
  readonly formatBotUptime = formatBotUptime;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
    });
    effect(() => {
      void this.state.runtime()?.reported_at;
      void this.loadBrowserStatus();
    });
  }
  async loadBrowserStatus(): Promise<void> {
    if (this.statusPending || this.destroyed) return;
    this.statusPending = true;
    try {
      const status = await this.browserApi.status();
      if (!this.destroyed) {
        this.browserStatus.set(status);
        this.browserError.set(null);
      }
    } catch (error) {
      if (!this.destroyed) {
        this.browserStatus.set(null);
        this.browserError.set(
          error instanceof Error ? error.message : 'Browserstatus nicht verfügbar.',
        );
      }
    } finally {
      this.statusPending = false;
    }
  }
  async closeBrowser(): Promise<void> {
    this.browserOpen.set(false);
    await Promise.all([this.loadBrowserStatus(), this.state.refreshAfterMutation()]);
  }
}

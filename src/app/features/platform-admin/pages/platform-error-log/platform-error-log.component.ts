import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LucideActivity as Activity, LucideRefreshCw as RefreshCw } from '@lucide/angular';
import { map } from 'rxjs';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import {
  PlatformErrorEvent,
  platformErrorAreaBySlug,
  platformErrorCodeLabel,
  platformErrorSeverity,
  platformErrorSourceLabel,
} from '../../models/platform-error-log';
import {
  PLATFORM_ERROR_PAGE_SIZE,
  PlatformErrorLogService,
} from '../../services/platform-error-log.service';

/** Detailanalyse eines Bereichs: jeder protokollierte Abbruch als Tabellenzeile. */
@Component({
  selector: 'app-platform-error-log',
  imports: [DatePipe, BadgeComponent, ButtonComponent, DataTableComponent, PageHeaderComponent],
  templateUrl: './platform-error-log.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformErrorLogComponent {
  private readonly log = inject(PlatformErrorLogService);
  private readonly slug = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('area'))),
    { initialValue: null },
  );

  readonly systemIcon = Activity;
  readonly refreshIcon = RefreshCw;
  readonly area = computed(() => platformErrorAreaBySlug(this.slug()));
  readonly events = signal<PlatformErrorEvent[]>([]);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly hasMore = signal(false);
  readonly error = signal<string | null>(null);
  private revision = 0;

  readonly sourceLabel = platformErrorSourceLabel;
  readonly codeLabel = platformErrorCodeLabel;
  readonly severity = platformErrorSeverity;

  constructor() {
    effect(() => {
      if (this.area()) void this.load();
    });
  }

  async load(): Promise<void> {
    const area = this.area();
    if (!area) return;
    const revision = ++this.revision;
    this.loading.set(true);
    this.error.set(null);
    try {
      const events = await this.log.list(area.area);
      if (revision !== this.revision) return;
      this.events.set(events);
      this.hasMore.set(events.length >= PLATFORM_ERROR_PAGE_SIZE);
    } catch {
      if (revision === this.revision) {
        this.events.set([]);
        this.error.set('Das Fehlerprotokoll konnte nicht geladen werden.');
      }
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const area = this.area();
    const last = this.events().at(-1);
    if (!area || !last || this.loadingMore()) return;
    const revision = this.revision;
    this.loadingMore.set(true);
    try {
      const older = await this.log.list(area.area, last.id);
      if (revision !== this.revision) return;
      this.events.update((events) => [...events, ...older]);
      this.hasMore.set(older.length >= PLATFORM_ERROR_PAGE_SIZE);
    } catch {
      if (revision === this.revision)
        this.error.set('Ältere Einträge konnten nicht geladen werden.');
    } finally {
      this.loadingMore.set(false);
    }
  }
}

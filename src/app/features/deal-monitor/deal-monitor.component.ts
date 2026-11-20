import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LucideBot } from '@lucide/angular';
import { WorkspaceService } from '../../core/services/workspace.service';
import { PageLayoutService } from '../../core/services/page-layout.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DealFeedSearchComponent } from './components/deal-feed-search/deal-feed-search.component';
import { DealMonitorService } from './services/deal-monitor.service';
import { VintedCategory } from '../platform-admin/models/vinted-category.model';
import { collectedCategorySource } from './models/collected-category-source';
import { ButtonComponent } from '../../shared/components/button/button.component';

/** Mehr Suchen nebeneinander machen selbst auf 49 Zoll die Spalten zu schmal. */
export const MAX_FEED_SEARCHES = 4;

@Component({
  selector: 'app-deal-monitor',
  imports: [PageHeaderComponent, DealFeedSearchComponent, ButtonComponent],
  templateUrl: './deal-monitor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealMonitorComponent {
  private readonly api = inject(DealMonitorService);
  private readonly destroyRef = inject(DestroyRef);
  readonly workspace = inject(WorkspaceService).currentWorkspace;
  private readonly categories = signal<VintedCategory[]>([]);
  private readonly collectedCategoryIds = signal<number[]>([]);
  readonly categoryError = signal(false);
  readonly categorySource = computed(() =>
    collectedCategorySource(this.categories(), this.collectedCategoryIds()),
  );
  readonly widescreen = inject(PageLayoutService).widescreen;
  readonly pageIcon = LucideBot;
  /** Feste Nummern je Suche, damit Felder beim Entfernen anderer Suchen ihre ID behalten. */
  private readonly searchNumbers = signal<number[]>([1]);
  private nextSearchNumber = 2;
  // Ohne Widescreen bleibt nur die erste Suche sichtbar; die übrigen kommen beim Einschalten neu.
  readonly searches = computed(() =>
    this.widescreen() ? this.searchNumbers() : this.searchNumbers().slice(0, 1),
  );
  readonly canAddSearch = computed(
    () => this.widescreen() && this.searchNumbers().length < MAX_FEED_SEARCHES,
  );
  readonly searchColumns = computed(() => `repeat(${this.searches().length}, minmax(0, 1fr))`);

  constructor() {
    effect(() => {
      if (this.workspace()) untracked(() => void this.loadCategories());
    });
  }

  async loadCategories(): Promise<void> {
    const workspace = this.workspace()?.id;
    if (!workspace) return;
    this.categoryError.set(false);
    try {
      const [categories, collected] = await Promise.all([
        this.api.categories(),
        this.api.collectedCategoryIds(workspace),
      ]);
      if (this.destroyRef.destroyed || this.workspace()?.id !== workspace) return;
      this.categories.set(categories);
      this.collectedCategoryIds.set(collected);
    } catch {
      if (!this.destroyRef.destroyed) this.categoryError.set(true);
    }
  }

  addSearch(): void {
    if (!this.canAddSearch()) return;
    this.searchNumbers.update((numbers) => [...numbers, this.nextSearchNumber++]);
  }

  removeSearch(searchNumber: number): void {
    if (searchNumber === 1) return;
    this.searchNumbers.update((numbers) => numbers.filter((number) => number !== searchNumber));
  }
}

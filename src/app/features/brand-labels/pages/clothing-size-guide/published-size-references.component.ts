import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../../core/services/workspace-access.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { SizeReferenceService } from '../../services/size-reference.service';
import type { SizeReference } from '../../models/size-reference';
import type { GuideFilters } from '../../models/clothing-size-guide';

@Component({
  selector: 'app-published-size-references',
  imports: [CardComponent, BadgeComponent, ButtonComponent, DataTableComponent],
  templateUrl: './published-size-references.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishedSizeReferencesComponent {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly service = inject(SizeReferenceService);
  private readonly destroyRef = inject(DestroyRef);
  readonly filters = input.required<GuideFilters>();
  readonly brandsLoaded = output<readonly string[]>();
  private readonly scope = computed(() => {
    const user = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace()?.id ?? '';
    const operator = this.operator.operator();
    const active = this.access
      .access()
      .some((entry) => entry.workspace_id === workspace && entry.access_status === 'active');
    return user && (operator || active) ? `${user}:${workspace}:${operator}` : null;
  });
  private readonly response = signal<{ scope: string; items: readonly SizeReference[] } | null>(
    null,
  );
  readonly items = computed(() =>
    this.response()?.scope === this.scope() ? (this.response()?.items ?? []) : [],
  );
  readonly visibleItems = computed(() => {
    const filters = this.filters();
    const query = filters.query.trim().toLocaleLowerCase('de');
    return this.items().filter(
      (item) =>
        (!filters.category || item.content.category === filters.category) &&
        (!filters.audience ||
          item.content.audience === filters.audience ||
          item.content.audience === 'unisex') &&
        (!filters.brand || item.brandName === filters.brand) &&
        (!query ||
          [
            item.content.title,
            item.brandName ?? '',
            item.content.notes,
            ...item.content.rows.flat(),
          ]
            .join(' ')
            .toLocaleLowerCase('de')
            .includes(query)),
    );
  });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private generation = 0;

  constructor() {
    effect(() => {
      const scope = this.scope();
      untracked(() => {
        this.response.set(null);
        this.error.set(null);
        this.brandsLoaded.emit([]);
        void this.load(scope);
      });
    });
    this.destroyRef.onDestroy(() => this.generation++);
  }

  async load(scope = this.scope()): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(false);
    this.error.set(null);
    if (!scope) return;
    this.loading.set(true);
    try {
      const references = await this.service.list(false);
      if (!this.current(generation, scope)) return;
      const items = references.filter((reference) => reference.published && !reference.archived);
      this.response.set({ scope, items });
      this.brandsLoaded.emit(
        items.flatMap((reference) => (reference.brandName ? [reference.brandName] : [])),
      );
    } catch {
      if (this.current(generation, scope)) {
        this.response.set(null);
        this.brandsLoaded.emit([]);
        this.error.set(
          'Zusätzliche veröffentlichte Tabellen konnten nicht geladen werden. Die recherchierte Größenübersicht bleibt verfügbar.',
        );
      }
    } finally {
      if (this.current(generation, scope)) this.loading.set(false);
    }
  }

  private current(generation: number, scope: string): boolean {
    return !this.destroyRef.destroyed && generation === this.generation && scope === this.scope();
  }
}

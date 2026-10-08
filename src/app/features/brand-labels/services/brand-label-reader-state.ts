import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../core/services/workspace-access.service';
import { PlatformOperatorService } from '../../../core/services/platform-operator.service';
import type { LabelPage, LabelReadFilter } from '../models/brand-label.models';
import type { LabelDetail } from '../models/brand-label-reader';
import {
  BrandLabelReaderService,
  LabelReadError,
  type LabelReaderBrand,
} from './brand-label-reader.service';

export interface LabelReaderView {
  readonly brands: readonly LabelReaderBrand[];
  readonly phase: 'loading' | 'ready' | 'unavailable' | 'error';
  readonly page: LabelPage | null;
  readonly detail: LabelDetail | null;
  readonly loadingMore: boolean;
  readonly operator: boolean;
  readonly error: string | null;
  readonly notice: string | null;
}
type ReadIntent =
  | { readonly type: 'list'; readonly filter: LabelReadFilter }
  | { readonly type: 'detail'; readonly brand: string; readonly slug: string };
const empty = (phase: LabelReaderView['phase']): LabelReaderView => ({
  phase,
  brands: [],
  page: null,
  detail: null,
  loadingMore: false,
  operator: false,
  error: null,
  notice: null,
});

/** Seitenlokaler Zustand: keine persistierten Leserdaten und keine Rolle aus Nutzer-Metadaten. */
@Injectable()
export class BrandLabelReaderState {
  private readonly service = inject(BrandLabelReaderService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly intent = signal<ReadIntent | null>(null);
  private readonly result = signal<{
    scope: string;
    intent: ReadIntent;
    value: LabelReaderView;
  } | null>(null);
  private generation = 0;

  private readonly scope = computed(() => {
    const user = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace()?.id ?? '';
    const operator = this.operator.operator();
    const active = this.access
      .access()
      .some((entry) => entry.workspace_id === workspace && entry.access_status === 'active');
    return user && (operator || active) ? `${user}:${workspace}:${operator}` : null;
  });
  readonly view = computed(() => {
    const result = this.result();
    const scope = this.scope();
    return !this.destroyRef.destroyed &&
      scope !== null &&
      result?.scope === scope &&
      result.intent === this.intent()
      ? result.value
      : empty(scope === null ? 'unavailable' : 'loading');
  });

  constructor() {
    effect(() => {
      const scope = this.scope();
      const intent = this.intent();
      untracked(() => {
        if (scope !== null && intent) void this.load(scope, intent);
        else {
          this.generation++;
          this.result.set(null);
        }
      });
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.result.set(null);
    });
  }
  search(filter: LabelReadFilter): void {
    this.intent.set({ type: 'list', filter: Object.freeze({ ...filter }) });
  }
  show(brand: string, slug: string): void {
    this.intent.set({ type: 'detail', brand, slug });
  }
  refresh(): void {
    this.intent.update((intent) => (intent ? { ...intent } : null));
  }

  async more(): Promise<void> {
    const view = this.view();
    const page = view.page;
    const scope = this.scope();
    const intent = this.intent();
    if (
      scope === null ||
      intent?.type !== 'list' ||
      view.phase !== 'ready' ||
      view.loadingMore ||
      !page?.hasMore
    )
      return;
    const generation = ++this.generation;
    this.result.set({ scope, intent, value: { ...view, loadingMore: true, notice: null } });
    try {
      const next = await this.service.list(intent.filter, page.items.length);
      if (!this.current(generation, scope, intent)) return;
      const ids = new Set(page.items.map((entry) => entry.referenceId));
      if (
        next.catalogVersion !== page.catalogVersion ||
        next.items.some((entry) => ids.has(entry.referenceId))
      ) {
        // Keine Seiten unterschiedlicher Sammlungsstände zusammensetzen.
        const first = await this.service.list(intent.filter, 0);
        if (!this.current(generation, scope, intent)) return;
        this.result.set({
          scope,
          intent,
          value: {
            ...view,
            page: first,
            loadingMore: false,
            notice: 'Die Sammlung wurde aktualisiert. Du siehst wieder die erste Seite.',
          },
        });
      } else {
        this.result.set({
          scope,
          intent,
          value: {
            ...view,
            loadingMore: false,
            page: { ...next, items: [...page.items, ...next.items] },
          },
        });
      }
    } catch (error) {
      if (this.current(generation, scope, intent)) this.failed(scope, intent, error);
    }
  }

  private current(generation: number, scope: string, intent: ReadIntent): boolean {
    return (
      !this.destroyRef.destroyed &&
      generation === this.generation &&
      scope === this.scope() &&
      intent === this.intent()
    );
  }
  private async load(scope: string, intent: ReadIntent): Promise<void> {
    const generation = ++this.generation;
    this.result.set({ scope, intent, value: empty('loading') });
    try {
      const availability = await this.service.availability();
      if (!this.current(generation, scope, intent)) return;
      if (!availability.visible) throw new LabelReadError('unavailable');
      const brands = intent.type === 'list' ? await this.service.brands() : [];
      if (!this.current(generation, scope, intent)) return;
      const data =
        intent.type === 'list'
          ? { page: await this.service.list(intent.filter, 0), detail: null }
          : { page: null, detail: await this.service.detail(intent.brand, intent.slug) };
      if (!this.current(generation, scope, intent)) return;
      this.result.set({
        scope,
        intent,
        value: { ...empty('ready'), ...data, brands, operator: availability.operator },
      });
    } catch (error) {
      if (this.current(generation, scope, intent)) this.failed(scope, intent, error);
    }
  }
  private failed(scope: string, intent: ReadIntent, error: unknown): void {
    const safeError = error instanceof LabelReadError ? error : new LabelReadError('network');
    this.result.set({
      scope,
      intent,
      value: {
        ...empty(safeError.reason === 'unavailable' ? 'unavailable' : 'error'),
        error: safeError.message,
      },
    });
  }
}

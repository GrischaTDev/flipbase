import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucidePause, LucidePencil, LucidePlay } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { SniperQueryEditorComponent } from '../../components/sniper-query-editor/sniper-query-editor.component';
import { SniperAdminService } from '../../services/sniper-admin.service';
import { SniperAdminState } from '../../services/sniper-admin-state';
import { QueryDraft, SniperQuery, queryStatusLabel } from '../../models/sniper-query.model';

@Component({
  selector: 'app-sniper-queries',
  imports: [
    DatePipe,
    ButtonComponent,
    TableActionButtonComponent,
    BadgeComponent,
    LoadingIndicatorComponent,
    ModalShellComponent,
    DataTableComponent,
    SniperQueryEditorComponent,
  ],
  templateUrl: './sniper-queries.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SniperAdminState],
})
export class SniperQueriesComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly editor = viewChild(SniperQueryEditorComponent);
  readonly state = inject(SniperAdminState);
  private readonly api = inject(SniperAdminService);
  private readonly destroyRef = inject(DestroyRef);
  readonly editorOpen = signal(false);
  readonly editing = signal<SniperQuery | null>(null);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly pendingCheckBaselines = signal<Record<string, string | null>>({});
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly filtered = computed(() => {
    const term = this.search().toLocaleLowerCase('de');
    return this.state
      .queries()
      .filter((q) =>
        [q.title, q.notes, q.brand_id].join(' ').toLocaleLowerCase('de').includes(term),
      );
  });
  readonly activeCount = computed(
    () => this.state.queries().filter((query) => query.is_active).length,
  );
  readonly statusLabel = queryStatusLabel;
  readonly editIcon = LucidePencil;
  readonly pauseIcon = LucidePause;
  readonly activateIcon = LucidePlay;

  hasUnsavedChanges(): boolean {
    return this.editor()?.form.dirty ?? false;
  }
  isSaving(): boolean {
    return this.saving() || this.busyId() !== null;
  }

  queryTitle(query: SniperQuery): string {
    return query.title || (query.brand_id ? `Marke ${query.brand_id}` : 'Unbenannter Markenfilter');
  }

  isBrandOnly(query: SniperQuery): boolean {
    return (
      query.marketplace === 'vinted' &&
      query.brand_id !== null &&
      query.search_text === null &&
      query.catalog_id === null &&
      query.price_from === null &&
      query.price_to === null &&
      query.query_key === `vinted|search=|catalog=-|brand=${query.brand_id}|price_from=-|price_to=-`
    );
  }

  openEditor(query: SniperQuery | null = null): void {
    if (query && !this.isBrandOnly(query)) return;
    this.editing.set(query);
    this.error.set(null);
    this.message.set(null);
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    this.editorOpen.set(false);
    afterNextRender(
      () =>
        this.element.nativeElement
          .querySelector<HTMLButtonElement>('[data-new-query] button')
          ?.focus(),
      { injector: this.injector },
    );
  }

  modalClosed(): void {
    if (this.isSaving()) return;
    if (this.hasUnsavedChanges() && !globalThis.confirm('Ungespeicherte Änderungen verwerfen?'))
      return;
    this.closeEditor();
  }

  async save(draft: QueryDraft): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.save(draft);
      if (this.destroyRef.destroyed) return;
      this.closeEditor();
      this.message.set(
        draft.id
          ? 'Änderungen gespeichert.'
          : 'Markenfilter gespeichert. Du kannst ihn jetzt aktivieren.',
      );
      await this.state.refreshAfterMutation();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggle(query: SniperQuery): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(query.id);
    this.error.set(null);
    try {
      await this.api.setActive(query.id, !query.is_active);
      if (query.is_active) {
        this.pendingCheckBaselines.update((baselines) => {
          const next = { ...baselines };
          delete next[query.id];
          return next;
        });
      } else {
        this.pendingCheckBaselines.update((baselines) => ({
          ...baselines,
          [query.id]: query.last_polled_at,
        }));
      }
      this.message.set(
        query.is_active
          ? 'Markenfilter pausiert. Eine bereits laufende Abfrage kann noch abgeschlossen werden.'
          : 'Markenfilter aktiviert. Die erste Vinted-Abfrage läuft jetzt an.',
      );
      await this.state.refreshAfterMutation();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Status konnte nicht geändert werden.',
      );
    } finally {
      this.busyId.set(null);
    }
  }

  isCheckPending(query: SniperQuery): boolean {
    const baselines = this.pendingCheckBaselines();
    if (!Object.prototype.hasOwnProperty.call(baselines, query.id)) return false;
    return query.last_polled_at === baselines[query.id];
  }
}

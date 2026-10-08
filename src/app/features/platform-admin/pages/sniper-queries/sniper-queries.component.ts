import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucidePause, LucidePencil, LucidePlay, LucideTrash2 } from '@lucide/angular';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { SniperQueryEditorComponent } from '../../components/sniper-query-editor/sniper-query-editor.component';
import { SniperAdminService } from '../../services/sniper-admin.service';
import { SniperAdminState } from '../../services/sniper-admin-state';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { SniperBrowserService } from '../../services/sniper-browser.service';
import type { SniperBrowserStatus } from '../../models/sniper-browser.model';
import { QueryDraft, SniperQuery, queryStatusLabel } from '../../models/sniper-query.model';

@Component({
  selector: 'app-sniper-queries',
  imports: [
    DatePipe,
    RouterLink,
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
  private readonly categoryApi = inject(VintedCategoryService);
  readonly categoryPaths = signal<ReadonlyMap<number, string>>(new Map());
  private readonly confirmation = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  readonly editorOpen = signal(false);
  readonly editing = signal<SniperQuery | null>(null);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly pendingCheckBaselines = signal<Record<string, string | null>>({});
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly browserStatus = signal<SniperBrowserStatus | null>(null);
  readonly browserError = signal<string | null>(null);
  readonly manualRequired = computed(() =>
    ['interaction_required', 'manual'].includes(this.browserStatus()?.state ?? ''),
  );
  private readonly browserApi = inject(SniperBrowserService);
  private browserStatusPending = false;
  readonly search = signal('');
  readonly filtered = computed(() => {
    const term = this.search().toLocaleLowerCase('de');
    return this.state
      .queries()
      .filter((q) =>
        [q.title, q.notes, this.queryConditions(q)]
          .join(' ')
          .toLocaleLowerCase('de')
          .includes(term),
      );
  });
  readonly activeCount = computed(
    () => this.state.queries().filter((query) => query.is_active).length,
  );
  readonly statusLabel = queryStatusLabel;
  readonly editIcon = LucidePencil;
  readonly pauseIcon = LucidePause;
  readonly activateIcon = LucidePlay;
  readonly deleteIcon = LucideTrash2;

  constructor() {
    void this.loadCategoryPaths();
    effect(() => {
      void this.state.runtime()?.reported_at;
      void this.loadBrowserStatus();
    });
  }

  private async loadBrowserStatus(): Promise<void> {
    if (this.browserStatusPending || this.destroyRef.destroyed) return;
    this.browserStatusPending = true;
    try {
      const status = await this.browserApi.status();
      if (!this.destroyRef.destroyed) {
        this.browserStatus.set(status);
        this.browserError.set(null);
      }
    } catch (error) {
      if (!this.destroyRef.destroyed) {
        this.browserStatus.set(null);
        this.browserError.set(
          error instanceof Error ? error.message : 'Browserstatus nicht verfügbar.',
        );
      }
    } finally {
      this.browserStatusPending = false;
    }
  }

  private async loadCategoryPaths(): Promise<void> {
    try {
      const snapshot = await this.categoryApi.readSnapshot();
      if (!this.destroyRef.destroyed)
        this.categoryPaths.set(
          new Map(snapshot.categories.map((category) => [category.id, category.path])),
        );
    } catch {
      /* Ein fehlender Kategoriestand darf die Verwaltung nicht blockieren. */
    }
  }

  queryConditions(query: SniperQuery): string {
    const category =
      query.catalog_id === null
        ? 'Alle Kategorien'
        : (this.categoryPaths().get(query.catalog_id) ?? 'Kategorie momentan nicht verfügbar');
    const names = query.brand_names?.length
      ? query.brand_names.join(' oder ')
      : query.brand_id
        ? 'Gespeicherte Marke'
        : 'Alle Marken';
    const terms = query.title_keywords?.length
      ? `${query.keyword_mode === 'any' ? 'Einer der Titelbegriffe' : 'Alle Titelbegriffe'}: ${query.title_keywords.join(', ')}`
      : '';
    const legacy = query.search_text ? `Vinted-Suchtext: ${query.search_text}` : '';
    return [category, names, terms, legacy].filter(Boolean).join(' · ');
  }

  hasUnsavedChanges(): boolean {
    return this.editor()?.hasUnsavedChanges() || false;
  }
  isSaving(): boolean {
    return this.saving() || this.busyId() !== null;
  }

  queryTitle(query: SniperQuery): string {
    return query.title || 'Unbenannter Suchfilter';
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
    if (this.isSaving()) return;
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

  async modalClosed(): Promise<void> {
    if (this.isSaving()) return;
    if (this.hasUnsavedChanges()) {
      const discard = await this.confirmation.frage({
        titel: 'Änderungen verwerfen?',
        text: 'Deine Änderungen am Suchfilter wurden noch nicht gespeichert.',
        bestaetigenText: 'Verwerfen',
        gefahr: true,
      });
      if (!discard || this.destroyRef.destroyed) return;
    }
    this.closeEditor();
  }

  async delete(query: SniperQuery): Promise<void> {
    if (this.isSaving() || this.editorOpen()) return;
    this.busyId.set(query.id);
    try {
      const confirmed = await this.confirmation.frage({
        titel: 'Suchfilter löschen?',
        text: `Der Filter „${this.queryTitle(query)}“ wird für alle Nutzer entfernt. Weitere Abfragen werden gestoppt. Bereits gefundene Artikel, Favoriten und persönliche Suchfilter bleiben erhalten. Eine laufende Abfrage kann noch abgeschlossen werden.`,
        bestaetigenText: 'Löschen',
        gefahr: true,
      });
      if (!confirmed || this.destroyRef.destroyed) return;
      this.error.set(null);
      await this.api.delete(query.id);
      if (this.destroyRef.destroyed) return;
      this.message.set(`Suchfilter „${this.queryTitle(query)}“ gelöscht.`);
      await this.state.refreshAfterMutation();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Löschen fehlgeschlagen.');
    } finally {
      this.busyId.set(null);
      if (!this.destroyRef.destroyed) {
        afterNextRender(
          () => {
            const origin = this.element.nativeElement.querySelector<HTMLButtonElement>(
              `[data-delete-query="${query.id}"] button`,
            );
            const fallback =
              this.element.nativeElement.querySelector<HTMLButtonElement>(
                '[data-new-query] button',
              );
            (origin ?? fallback)?.focus();
          },
          { injector: this.injector },
        );
      }
    }
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
          ? 'Änderungen gespeichert. Bei neuen Suchbedingungen bleibt der Filter bis zur Aktivierung pausiert.'
          : 'Suchfilter gespeichert. Du kannst ihn jetzt aktivieren.',
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
          ? 'Suchfilter pausiert. Eine bereits laufende Abfrage kann noch abgeschlossen werden.'
          : this.manualRequired()
            ? 'Suchfilter aktiviert. Der Bot wartet auf die manuelle Vinted-Prüfung im Botbetrieb.'
            : 'Suchfilter aktiviert. Der Bot fragt ihn ab, sobald Abrufe möglich sind.',
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
    if (
      !query.is_active ||
      this.manualRequired() ||
      this.browserStatus()?.state === 'unavailable' ||
      this.browserError() ||
      this.state.error()
    )
      return false;
    const baselines = this.pendingCheckBaselines();
    if (!Object.prototype.hasOwnProperty.call(baselines, query.id)) return false;
    return query.last_polled_at === baselines[query.id];
  }
}

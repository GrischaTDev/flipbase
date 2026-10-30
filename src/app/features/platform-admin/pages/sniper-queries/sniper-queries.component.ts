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
import { RouterLink } from '@angular/router';
import {
  LucidePause,
  LucidePencil,
  LucidePlay,
  LucideTrash2,
  LucidePlus,
  LucideActivity,
  LucideArrowRight,
  LucideLayoutGrid,
  LucideRows3,
  LucideX,
} from '@lucide/angular';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { SniperQueryEditorComponent } from '../../components/sniper-query-editor/sniper-query-editor.component';
import { SniperAdminService } from '../../services/sniper-admin.service';
import { SniperAdminState } from '../../services/sniper-admin-state';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { SniperBrowserService } from '../../services/sniper-browser.service';
import type { SniperBrowserStatus } from '../../models/sniper-browser.model';
import { QueryDraft, SniperQuery } from '../../models/sniper-query.model';
import { SniperFilterCardComponent } from '../../components/sniper-filter-card/sniper-filter-card.component';
import { SniperFilterDetailsComponent } from '../../components/sniper-filter-details/sniper-filter-details.component';
import { SniperOperationComponent } from '../sniper-operation/sniper-operation.component';
import { filterNeedsAttention, filterCategoryLabel } from '../../models/sniper-filter-presentation';

type FilterStatus = 'all' | 'active' | 'paused' | 'attention';

@Component({
  selector: 'app-sniper-queries',
  imports: [
    RouterLink,
    ButtonComponent,
    PageHeaderComponent,
    CustomSearchInputComponent,
    SniperFilterCardComponent,
    SniperFilterDetailsComponent,
    SniperOperationComponent,
    ModalShellComponent,
    CustomSelectComponent,
    SniperQueryEditorComponent,
  ],
  templateUrl: './sniper-queries.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  readonly duplicating = signal(false);
  readonly detailId = signal<string | null>(null);
  readonly detailQuery = computed(
    () => this.state.queries().find((query) => query.id === this.detailId()) ?? null,
  );
  readonly operationOpen = signal(false);
  readonly view = signal<'cards' | 'compact'>('cards');
  readonly sort = signal('updated');
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  private editorReturnId: string | null = null;
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
  readonly currentTime = signal(Date.now());
  readonly statusFilter = signal<FilterStatus>('all');
  readonly statusOptions = [
    { value: 'all' as const, label: 'Alle Status' },
    { value: 'active' as const, label: 'Aktiv' },
    { value: 'paused' as const, label: 'Pausiert' },
    { value: 'attention' as const, label: 'Aufmerksamkeit' },
  ];
  readonly sortOptions = [
    { value: 'updated', label: 'Zuletzt geändert' },
    { value: 'name', label: 'Name A–Z' },
    { value: 'finds', label: 'Meiste Funde' },
  ];
  readonly filtered = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('de');
    const rows = this.state
      .queries()
      .filter(
        (query) =>
          this.statusFilter() === 'all' ||
          (this.statusFilter() === 'attention'
            ? this.needsAttention(query)
            : query.is_active === (this.statusFilter() === 'active')),
      )
      .filter((q) =>
        [q.title, q.notes, this.queryConditions(q)]
          .join(' ')
          .toLocaleLowerCase('de')
          .includes(term),
      );
    if (this.sort() === 'name')
      rows.sort((a, b) => this.queryTitle(a).localeCompare(this.queryTitle(b), 'de'));
    if (this.sort() === 'finds')
      rows.sort((a, b) => (this.state.counts()[b.id] ?? 0) - (this.state.counts()[a.id] ?? 0));
    if (this.sort() === 'updated')
      rows.sort((a, b) => Date.parse(b.updated_at ?? '') - Date.parse(a.updated_at ?? ''));
    return rows;
  });
  readonly activeCount = computed(
    () => this.state.queries().filter((query) => query.is_active).length,
  );
  readonly editIcon = LucidePencil;
  readonly pauseIcon = LucidePause;
  readonly activateIcon = LucidePlay;
  readonly deleteIcon = LucideTrash2;
  readonly plusIcon = LucidePlus;
  readonly activityIcon = LucideActivity;
  readonly arrowIcon = LucideArrowRight;
  readonly gridIcon = LucideLayoutGrid;
  readonly rowsIcon = LucideRows3;
  readonly closeIcon = LucideX;
  readonly attentionCount = computed(
    () => this.state.queries().filter((query) => this.needsAttention(query)).length,
  );
  readonly statusTabs = computed(() => [
    { value: 'all' as const, label: 'Alle', count: this.state.queries().length },
    { value: 'active' as const, label: 'Aktiv', count: this.activeCount() },
    {
      value: 'paused' as const,
      label: 'Pausiert',
      count: this.state.queries().length - this.activeCount(),
    },
    { value: 'attention' as const, label: 'Aufmerksamkeit', count: this.attentionCount() },
  ]);
  readonly operationLabel = computed(() => {
    if (!this.state.loaded() && !this.state.error()) return 'Botstatus wird geladen …';
    if (this.state.error() || this.browserError()) return 'Botstand nicht verfügbar';
    if (this.state.stale()) return 'Betriebsmeldung veraltet';
    if (this.manualRequired()) return 'Manuelle Prüfung erforderlich';
    if (this.browserStatus()?.state !== 'ready' || this.state.vintedUptimeSeconds() === null)
      return 'Vinted-Zugriff nicht bestätigt';
    if (this.state.runtime()?.last_cycle_error) return 'Bot meldet einen Fehler';
    return 'Bot läuft';
  });

  constructor() {
    const clock = setInterval(() => this.currentTime.set(Date.now()), 60000);
    this.destroyRef.onDestroy(() => clearInterval(clock));
    void this.loadCategoryPaths();
    effect(() => {
      void this.state.runtime()?.reported_at;
      void this.loadBrowserStatus();
    });
    effect(() => {
      const available = new Set(this.state.queries().map((query) => query.id));
      const selection = this.selectedIds();
      const next = new Set([...selection].filter((id) => available.has(id)));
      if (next.size !== selection.size) this.selectedIds.set(next);
      const detail = this.detailId();
      if (detail && !available.has(detail)) this.detailId.set(null);
    });
  }

  needsAttention(query: SniperQuery): boolean {
    return filterNeedsAttention(query) || (query.is_active && this.manualRequired());
  }

  categoryLabel(query: SniperQuery): string {
    return filterCategoryLabel(query, this.categoryPaths());
  }

  openDetails(query: SniperQuery): void {
    if (!this.isSaving() && !this.editorOpen()) {
      this.error.set(null);
      this.message.set(null);
      this.detailId.set(query.id);
    }
  }

  setSelected(id: string, checked: boolean): void {
    if (this.isSaving()) return;
    this.selectedIds.update((selection) => {
      const next = new Set(selection);
      if (checked && this.state.queries().some((query) => query.id === id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  selectVisible(): void {
    if (!this.isSaving())
      this.selectedIds.update(
        (selection) => new Set([...selection, ...this.filtered().map((query) => query.id)]),
      );
  }

  clearSelection(): void {
    if (!this.isSaving()) this.selectedIds.set(new Set());
  }

  resetSearch(): void {
    if (!this.state.queries().length) {
      this.openEditor();
      return;
    }
    this.search.set('');
    this.statusFilter.set('all');
  }

  async setSelectedActive(active: boolean): Promise<void> {
    if (this.isSaving() || this.editorOpen()) return;
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.busyId.set('selection');
    this.error.set(null);
    this.message.set(null);
    const completed = new Set<string>();
    const failures: string[] = [];
    let changed = 0;
    try {
      for (const id of ids) {
        if (this.destroyRef.destroyed) return;
        const query = this.state.queries().find((row) => row.id === id);
        if (!query || query.is_active === active) {
          completed.add(id);
          continue;
        }
        try {
          await this.api.setActive(query.id, active);
          this.rememberActivation(query, active);
          completed.add(id);
          changed++;
        } catch (error) {
          failures.push(
            `${this.queryTitle(query)}: ${error instanceof Error ? error.message : 'Status konnte nicht gespeichert werden.'}`,
          );
        }
      }
      if (this.destroyRef.destroyed) return;
      this.selectedIds.update(
        (selection) =>
          new Set(
            [...selection].filter(
              (id) => !completed.has(id) && this.state.queries().some((query) => query.id === id),
            ),
          ),
      );
      this.message.set(
        changed
          ? `${changed} Suchfilter ${active ? 'aktiviert' : 'pausiert'}. ${active ? 'Abrufe starten, sobald sie möglich sind.' : 'Bereits laufende Abfragen können noch abgeschlossen werden.'}`
          : failures.length
            ? null
            : 'Die ausgewählten Filter haben bereits diesen Status.',
      );
      if (failures.length) this.error.set(`Nicht gespeichert: ${failures.join(' · ')}`);
      if (changed) await this.state.refreshAfterMutation();
    } finally {
      this.busyId.set(null);
    }
  }

  private rememberActivation(query: SniperQuery, active: boolean): void {
    this.pendingCheckBaselines.update((baselines) => {
      const next = { ...baselines };
      if (active) next[query.id] = query.last_polled_at;
      else delete next[query.id];
      return next;
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
    const excluded = query.excluded_title_keywords?.length
      ? `ohne: ${query.excluded_title_keywords.join(', ')}`
      : '';
    const price = [
      query.price_from == null ? '' : `ab ${query.price_from.toLocaleString('de-DE')} €`,
      query.price_to == null ? '' : `bis ${query.price_to.toLocaleString('de-DE')} €`,
    ]
      .filter(Boolean)
      .join(' ');
    return [category, names, terms, excluded, legacy, price].filter(Boolean).join(' · ');
  }

  queryBriefConditions(query: SniperQuery): string {
    const path =
      query.catalog_id == null ? 'Alle Kategorien' : this.categoryPaths().get(query.catalog_id);
    const categoryParts = path?.split(' > ') ?? [];
    const category =
      categoryParts.length > 1
        ? `${categoryParts[0]} › ${categoryParts.at(-1)}`
        : (categoryParts[0] ?? 'Kategorie nicht verfügbar');
    const brands = query.brand_names?.length
      ? query.brand_names.slice(0, 2).join(' / ') +
        (query.brand_names.length > 2 ? ` +${query.brand_names.length - 2}` : '')
      : query.brand_id
        ? 'Gespeicherte Marke'
        : 'alle Marken';
    const count = query.title_keywords?.length ?? 0;
    const terms = count
      ? query.keyword_mode === 'any'
        ? `${count} ${count === 1 ? 'Titelvariante' : 'Titelvarianten'}`
        : `${count} ${count === 1 ? 'Titelbegriff' : 'Titelbegriffe (alle)'}`
      : '';
    const exclusions = query.excluded_title_keywords?.length
      ? `${query.excluded_title_keywords.length} ${query.excluded_title_keywords.length === 1 ? 'Ausschluss' : 'Ausschlüsse'}`
      : '';
    const prices = [
      query.price_from == null ? '' : `ab ${query.price_from.toLocaleString('de-DE')} €`,
      query.price_to == null ? '' : `bis ${query.price_to.toLocaleString('de-DE')} €`,
    ]
      .filter(Boolean)
      .join(' ');
    return [category, brands, terms, exclusions, query.search_text ? 'Vinted-Suchtext' : '', prices]
      .filter(Boolean)
      .join(' · ');
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

  openEditor(query: SniperQuery | null = null, duplicate = false): void {
    if (this.isSaving()) return;
    this.editing.set(query);
    this.editorReturnId = query?.id ?? null;
    this.duplicating.set(duplicate);
    this.detailId.set(null);
    this.error.set(null);
    this.message.set(null);
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    this.editorOpen.set(false);
    afterNextRender(
      () => {
        const origin = Array.from(
          this.element.nativeElement.querySelectorAll<HTMLElement>('[data-query-title]'),
        )
          .find((element) => element.dataset['queryTitle'] === this.editorReturnId)
          ?.querySelector<HTMLButtonElement>('button');
        (
          origin ??
          this.element.nativeElement.querySelector<HTMLButtonElement>('[data-new-query] button')
        )?.focus();
      },
      { injector: this.injector },
    );
  }

  closeDetails(): void {
    if (!this.isSaving()) this.detailId.set(null);
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
            const origin = Array.from(
              this.element.nativeElement.querySelectorAll<HTMLButtonElement>(
                `[data-delete-query="${query.id}"] button`,
              ),
            ).find((button) => button.getClientRects().length > 0);
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
    if (this.isSaving() || this.editorOpen()) return;
    this.busyId.set(query.id);
    this.error.set(null);
    this.message.set(null);
    try {
      await this.api.setActive(query.id, !query.is_active);
      this.rememberActivation(query, !query.is_active);
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

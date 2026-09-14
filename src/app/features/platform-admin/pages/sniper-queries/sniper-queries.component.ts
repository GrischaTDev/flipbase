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
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { SniperQueryEditorComponent } from '../../components/sniper-query-editor/sniper-query-editor.component';
import { SniperAdminService } from '../../services/sniper-admin.service';
import { SniperAdminState } from '../../services/sniper-admin-state';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { VintedCategory } from '../../models/vinted-category.model';
import { QueryDraft, SniperQuery, queryStatusLabel } from '../../models/sniper-query.model';

@Component({
  selector: 'app-sniper-queries',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    BadgeComponent,
    TextFieldComponent,
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
  private readonly destroyRef = inject(DestroyRef);
  readonly categories = signal<VintedCategory[]>([]);
  readonly categoryError = signal<string | null>(null);
  readonly editorOpen = signal(false);
  readonly editing = signal<SniperQuery | null>(null);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly search = new FormControl('', { nonNullable: true });
  private readonly term = toSignal(this.search.valueChanges, { initialValue: '' });
  readonly filtered = computed(() => {
    const term = this.term().toLocaleLowerCase('de');
    return this.state
      .queries()
      .filter((q) =>
        [q.search_text, this.categoryPath(q), q.notes, q.brand_id]
          .join(' ')
          .toLocaleLowerCase('de')
          .includes(term),
      );
  });
  readonly statusLabel = queryStatusLabel;

  constructor() {
    void this.loadCategories();
  }

  hasUnsavedChanges(): boolean {
    return this.editor()?.form.dirty ?? false;
  }
  isSaving(): boolean {
    return this.saving() || this.busyId() !== null;
  }

  async loadCategories(): Promise<void> {
    try {
      const categories = await this.categoryApi.listLeaves();
      if (this.destroyRef.destroyed) return;
      this.categories.set(categories);
      this.categoryError.set(null);
    } catch {
      if (!this.destroyRef.destroyed)
        this.categoryError.set('Die Kategorien konnten nicht geladen werden.');
    }
  }

  categoryPath(query: SniperQuery): string {
    return (
      this.categories().find((c) => c.id === query.catalog_id)?.path ??
      (query.catalog_id ? `Kategorie ${query.catalog_id}` : 'Alle Kategorien')
    );
  }

  openEditor(query: SniperQuery | null = null): void {
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
          : 'Auftrag gespeichert. Du kannst ihn jetzt aktivieren.',
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
      this.message.set(
        query.is_active
          ? 'Auftrag pausiert. Eine bereits laufende Abfrage kann noch abgeschlossen werden.'
          : 'Auftrag aktiviert. Der Bot übernimmt ihn im nächsten verfügbaren Takt.',
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
}

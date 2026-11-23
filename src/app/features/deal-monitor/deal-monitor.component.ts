import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  LucideBot,
  LucideEdit2,
  LucidePause,
  LucidePlay,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../shared/components/modal-shell/modal-shell.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { UnsavedEntryPage } from '../../shared/guards/unsaved-entry.guard';
import { DealFeedSearchComponent } from './components/deal-feed-search/deal-feed-search.component';
import { PersonalFeedEditorComponent } from './components/personal-feed-editor/personal-feed-editor.component';
import { PersonalFeed, PersonalFeedDraft } from './models/deal-monitor.model';
import { DealMonitorService } from './services/deal-monitor.service';

@Component({
  selector: 'app-deal-monitor',
  imports: [
    ButtonComponent,
    CustomSelectComponent,
    DealFeedSearchComponent,
    ModalShellComponent,
    PageHeaderComponent,
    PersonalFeedEditorComponent,
  ],
  templateUrl: './deal-monitor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealMonitorComponent implements UnsavedEntryPage {
  private readonly api = inject(DealMonitorService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspace = inject(WorkspaceService).currentWorkspace;
  private readonly currentUser = inject(AuthService).currentUser;
  private readonly editor = viewChild(PersonalFeedEditorComponent);
  readonly workspaceId = computed(() => (this.currentUser() && this.workspace()?.id) || null);
  readonly icons = {
    feed: LucideBot,
    add: LucidePlus,
    edit: LucideEdit2,
    start: LucidePlay,
    stop: LucidePause,
    delete: LucideTrash2,
  };
  readonly feeds = signal<PersonalFeed[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly selectedFeed = computed(() => this.feeds().find(({ id }) => id === this.selectedId()));
  readonly feedOptions = computed(() =>
    this.feeds().map(({ id, title }) => ({ value: id, label: title })),
  );
  readonly loadingFeeds = signal(false);
  readonly editorOpen = signal(false);
  readonly editing = signal<PersonalFeed | null>(null);
  readonly pending = signal<'save' | 'toggle' | 'delete' | null>(null);
  readonly error = signal<string | null>(null);
  readonly editorError = signal<string | null>(null);
  readonly message = signal('');
  private listGeneration = 0;
  private workspaceGeneration = 0;

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId();
      const user = this.currentUser()?.id;
      untracked(() => {
        this.workspaceGeneration++;
        this.listGeneration++;
        this.feeds.set([]);
        this.selectedId.set(null);
        this.loadingFeeds.set(false);
        this.editorOpen.set(false);
        this.editing.set(null);
        this.pending.set(null);
        this.error.set(null);
        this.editorError.set(null);
        this.message.set('');
        if (user && workspaceId) void this.loadFeeds(workspaceId);
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return this.editor()?.hasChanges() ?? false;
  }

  isSaving(): boolean {
    return this.pending() !== null;
  }

  async loadFeeds(workspaceId = this.workspaceId(), selectId = this.selectedId()): Promise<void> {
    if (!workspaceId) return;
    const generation = ++this.listGeneration;
    this.loadingFeeds.set(true);
    this.error.set(null);
    try {
      const rows = await this.api.personalFeeds(workspaceId);
      if (this.destroyRef.destroyed || generation !== this.listGeneration) return;
      this.feeds.set(rows);
      this.selectedId.set(
        rows.some(({ id }) => id === selectId) ? selectId : (rows[0]?.id ?? null),
      );
    } catch {
      if (generation === this.listGeneration && !this.destroyRef.destroyed)
        this.error.set('Deine Feeds konnten nicht geladen werden.');
    } finally {
      if (generation === this.listGeneration && !this.destroyRef.destroyed)
        this.loadingFeeds.set(false);
    }
  }

  openEditor(feed: PersonalFeed | null = null): void {
    this.editing.set(feed);
    this.editorError.set(null);
    this.editorOpen.set(true);
  }

  async closeEditor(): Promise<void> {
    if (this.isSaving()) return;
    const generation = this.workspaceGeneration;
    if (
      this.hasUnsavedChanges() &&
      !(await this.confirm.frage({
        titel: 'Änderungen verwerfen?',
        text: 'Deine ungespeicherten Änderungen gehen verloren.',
        bestaetigenText: 'Verwerfen',
        abbrechenText: 'Weiter bearbeiten',
        gefahr: true,
      }))
    )
      return;
    if (this.isCurrent(generation)) this.editorOpen.set(false);
  }

  async save(draft: PersonalFeedDraft): Promise<void> {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.isSaving()) return;
    const generation = this.workspaceGeneration;
    this.pending.set('save');
    this.editorError.set(null);
    this.message.set('');
    try {
      const id = await this.api.save(workspaceId, draft);
      if (!this.isCurrent(generation)) return;
      this.editorOpen.set(false);
      await this.loadFeeds(workspaceId, id);
      if (this.isCurrent(generation) && !this.error()) this.message.set('Feed gespeichert.');
    } catch (error) {
      if (this.isCurrent(generation))
        this.editorError.set(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    } finally {
      if (this.isCurrent(generation)) this.pending.set(null);
    }
  }

  async toggle(feed: PersonalFeed): Promise<void> {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.isSaving()) return;
    const generation = this.workspaceGeneration;
    const active = !feed.is_active;
    this.pending.set('toggle');
    this.error.set(null);
    this.message.set('');
    try {
      await this.api.setActive(workspaceId, feed.id, active);
      if (!this.isCurrent(generation)) return;
      if (!active)
        this.feeds.update((rows) =>
          rows.map((row) => (row.id === feed.id ? { ...row, is_active: false } : row)),
        );
      await this.loadFeeds(workspaceId, feed.id);
      if (this.isCurrent(generation) && !this.error())
        this.message.set(active ? 'Feed gestartet.' : 'Feed gestoppt.');
    } catch (error) {
      if (this.isCurrent(generation))
        this.error.set(
          error instanceof Error ? error.message : 'Feed konnte nicht umgeschaltet werden.',
        );
    } finally {
      if (this.isCurrent(generation)) this.pending.set(null);
    }
  }

  async remove(feed: PersonalFeed): Promise<void> {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.isSaving()) return;
    const generation = this.workspaceGeneration;
    const confirmed = await this.confirm.frage({
      titel: 'Feed löschen?',
      text: `„${feed.title}“ wird gelöscht. Deine Favoriten bleiben erhalten.`,
      bestaetigenText: 'Feed löschen',
      abbrechenText: 'Abbrechen',
      gefahr: true,
    });
    if (!confirmed || !this.isCurrent(generation) || this.isSaving()) return;
    this.pending.set('delete');
    this.error.set(null);
    this.message.set('');
    try {
      await this.api.delete(workspaceId, feed.id);
      if (!this.isCurrent(generation)) return;
      this.feeds.update((rows) => rows.filter(({ id }) => id !== feed.id));
      await this.loadFeeds(workspaceId);
      if (this.isCurrent(generation) && !this.error()) this.message.set('Feed gelöscht.');
    } catch (error) {
      if (this.isCurrent(generation))
        this.error.set(error instanceof Error ? error.message : 'Löschen fehlgeschlagen.');
    } finally {
      if (this.isCurrent(generation)) this.pending.set(null);
    }
  }

  private isCurrent(generation: number): boolean {
    return !this.destroyRef.destroyed && generation === this.workspaceGeneration;
  }
}

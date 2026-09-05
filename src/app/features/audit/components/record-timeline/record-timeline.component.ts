import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { mapRecordHistoryDetails } from '../../../../shared/components/record-history/record-history.component';
import {
  canSubmitComment,
  mergeTimelineEntries,
  RecordTimelineEntityType,
  RecordTimelineEntry,
} from '../../models/record-timeline.models';
import { RecordTimelineService } from '../../services/record-timeline.service';

@Component({
  selector: 'app-record-timeline',
  templateUrl: './record-timeline.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordTimelineComponent {
  readonly entityType = input.required<RecordTimelineEntityType>();
  readonly entityId = input.required<string>();
  private readonly timeline = inject(RecordTimelineService);
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private contextVersion = 0;
  private loadVersion = 0;
  readonly entries = signal<readonly RecordTimelineEntry[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly posting = signal(false);
  readonly draft = signal('');
  readonly loadError = signal<string | null>(null);
  readonly postError = signal<string | null>(null);
  readonly expandedId = signal<string | null>(null);
  readonly archived = computed(() => Boolean(this.workspace.currentWorkspace()?.archived_at));
  readonly canSubmit = computed(
    () => canSubmitComment(this.draft()) && !this.posting() && !this.loading() && !this.archived(),
  );
  readonly characterCount = computed(() => Array.from(this.draft().trim()).length);
  readonly groups = computed(() => {
    const groups: { day: string; entries: RecordTimelineEntry[] }[] = [];
    for (const entry of this.entries()) {
      const day = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full' }).format(
        new Date(entry.createdAt),
      );
      let group = groups.at(-1);
      if (group?.day !== day) {
        group = { day, entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    }
    return groups;
  });
  constructor() {
    effect(() => {
      const scope = this.scope();
      this.contextVersion++;
      this.loadVersion++;
      this.entries.set([]);
      this.nextCursor.set(null);
      this.draft.set('');
      this.posting.set(false);
      this.loading.set(false);
      this.postError.set(null);
      this.loadError.set(null);
      this.expandedId.set(null);
      if (scope.workspaceId && scope.entityId) void this.load(undefined);
    });
  }
  updateDraft(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }
  reload(): void {
    if (!this.loading() && !this.posting()) void this.load(undefined);
  }
  loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor && !this.loading() && !this.posting()) void this.load(cursor);
  }
  async post(): Promise<void> {
    if (
      this.posting() ||
      this.loading() ||
      !canSubmitComment(this.draft()) ||
      this.workspace.currentWorkspace()?.archived_at
    )
      return;
    const scope = this.scope();
    if (!scope.workspaceId) return;
    const version = this.contextVersion;
    this.posting.set(true);
    this.postError.set(null);
    try {
      const saved = await this.timeline.addComment(
        scope.workspaceId,
        scope.entityType,
        scope.entityId,
        this.draft(),
      );
      if (!this.isCurrent(scope, version)) return;
      this.entries.update((entries) => mergeTimelineEntries(entries, [saved]));
      this.draft.set('');
    } catch {
      if (this.isCurrent(scope, version))
        this.postError.set(
          'Der Kommentar konnte nicht gespeichert werden. Dein Text bleibt erhalten. Bitte erneut versuchen.',
        );
    } finally {
      if (this.isCurrent(scope, version)) this.posting.set(false);
    }
  }
  details(entry: RecordTimelineEntry) {
    return mapRecordHistoryDetails(entry.event?.changes);
  }
  toggleDetails(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }
  exactTime(value: string): string {
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeStyle: 'long' }).format(
      new Date(value),
    );
  }
  relativeTime(value: string): string {
    const seconds = Math.round((Date.parse(value) - Date.now()) / 1000);
    const relative = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });
    if (Math.abs(seconds) < 60) return relative.format(seconds, 'second');
    if (Math.abs(seconds) < 3600) return relative.format(Math.round(seconds / 60), 'minute');
    if (Math.abs(seconds) < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
    return relative.format(Math.round(seconds / 86400), 'day');
  }
  private async load(cursor: string | undefined): Promise<void> {
    const scope = this.scope();
    if (!scope.workspaceId) return;
    const contextVersion = this.contextVersion;
    const loadVersion = ++this.loadVersion;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const page = await this.timeline.list(
        scope.workspaceId,
        scope.entityType,
        scope.entityId,
        cursor,
      );
      if (!this.isCurrent(scope, contextVersion) || loadVersion !== this.loadVersion) return;
      this.entries.update((previous) => mergeTimelineEntries(cursor ? previous : [], page.entries));
      this.nextCursor.set(page.nextCursor);
    } catch {
      if (this.isCurrent(scope, contextVersion) && loadVersion === this.loadVersion)
        this.loadError.set('Die Chronik konnte nicht geladen werden. Bitte erneut versuchen.');
    } finally {
      if (this.isCurrent(scope, contextVersion) && loadVersion === this.loadVersion)
        this.loading.set(false);
    }
  }
  private scope() {
    return {
      workspaceId: this.workspace.currentWorkspace()?.id ?? null,
      entityType: this.entityType(),
      entityId: this.entityId(),
      userId: this.auth.currentUser()?.id ?? null,
    };
  }
  private isCurrent(scope: ReturnType<RecordTimelineComponent['scope']>, version: number): boolean {
    const current = this.scope();
    return (
      version === this.contextVersion &&
      scope.workspaceId === current.workspaceId &&
      scope.entityType === current.entityType &&
      scope.entityId === current.entityId &&
      scope.userId === current.userId
    );
  }
}

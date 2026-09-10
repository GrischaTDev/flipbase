import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { BusinessEntityType, BusinessEvent } from '../../../../core/models/business-event.models';
import { BusinessEventService } from '../../../../core/services/business-event.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { RecordHistoryComponent } from '../../../../shared/components/record-history/record-history.component';
import { RecordTimelineComponent } from '../record-timeline/record-timeline.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-record-history-container',
  imports: [RecordHistoryComponent, RecordTimelineComponent],
  templateUrl: './record-history.container.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordHistoryContainer {
  readonly entityType = input.required<BusinessEntityType>();
  readonly entityId = input.required<string>();
  readonly heading = input('Änderungsverlauf');
  readonly refreshKey = input(0);

  private readonly businessEventService = inject(BusinessEventService);
  private readonly workspaceService = inject(WorkspaceService);
  private requestVersion = 0;

  readonly events = signal<readonly BusinessEvent[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
      const entityType = this.entityType();
      const entityId = this.entityId();
      this.refreshKey();
      if (entityType === 'purchase' || entityType === 'sale') return;
      this.startOver(workspaceId, entityType, entityId);
    });
  }

  reload(): void {
    this.startOver(
      this.workspaceService.currentWorkspace()?.id ?? null,
      this.entityType(),
      this.entityId(),
    );
  }

  loadMore(): void {
    const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
    const cursor = this.nextCursor();
    if (!workspaceId || !cursor || this.loading()) return;
    void this.load(workspaceId, this.entityType(), this.entityId(), cursor, false);
  }

  private startOver(
    workspaceId: string | null,
    entityType: BusinessEntityType,
    entityId: string,
  ): void {
    this.requestVersion += 1;
    this.events.set([]);
    this.nextCursor.set(null);
    this.error.set(null);
    this.loading.set(false);
    if (!workspaceId || !entityId) return;
    void this.load(workspaceId, entityType, entityId, undefined, true);
  }

  private async load(
    workspaceId: string,
    entityType: BusinessEntityType,
    entityId: string,
    cursor: string | undefined,
    replace: boolean,
  ): Promise<void> {
    const version = ++this.requestVersion;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.businessEventService.listEntityEvents({
        workspaceId,
        entityType,
        entityId,
        cursor,
        pageSize: PAGE_SIZE,
      });
      if (version !== this.requestVersion) return;
      this.events.update((previous) => (replace ? page.events : [...previous, ...page.events]));
      this.nextCursor.set(page.nextCursor);
    } catch (cause: unknown) {
      if (version !== this.requestVersion) return;
      this.events.set([]);
      this.nextCursor.set(null);
      this.error.set(cause instanceof Error ? cause.message : 'Unbekannter Fehler');
    } finally {
      if (version === this.requestVersion) this.loading.set(false);
    }
  }
}

import { DatePipe, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { LucideArrowLeft, LucideDynamicIcon, LucidePrinter } from '@lucide/angular';
import { ActivatedRoute } from '@angular/router';
import { BusinessEntityType, BusinessEvent } from '../../../../core/models/business-event.models';
import {
  BusinessEventService,
  redactBusinessEventValue,
} from '../../../../core/services/business-event.service';
import { WorkspaceMemberService } from '../../../../core/services/workspace-member.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import {
  auditFiltersFromQueryParams,
  canExportAuditData,
  toBusinessEventFilter,
} from '../data-and-audit/data-and-audit.component';

export interface PrintableAuditEvent {
  readonly id: string;
  readonly entityReference: string;
  readonly label: string;
  readonly eventType: string;
  readonly actorId: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly changes: string;
}

export function summarizeAuditEvent(event: BusinessEvent): PrintableAuditEvent {
  return {
    id: event.id,
    entityReference: `${event.entityType} / ${event.entityId}`,
    label: event.eventLabel,
    eventType: event.eventType,
    actorId: event.actorId,
    reason: event.reason,
    createdAt: event.createdAt,
    changes: JSON.stringify(redactBusinessEventValue(event.changes), null, 2),
  };
}

export function printAuditDocument(print: () => void): void {
  print();
}

@Component({
  selector: 'app-audit-print',
  imports: [DatePipe, LucideDynamicIcon],
  templateUrl: './audit-print.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AuditPrintComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly memberService = inject(WorkspaceMemberService);
  private readonly eventsService = inject(BusinessEventService);

  readonly printIcon = LucidePrinter;
  readonly backIcon = LucideArrowLeft;
  readonly generatedAt = signal(new Date().toISOString());
  readonly events = signal<readonly PrintableAuditEvent[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly workspace = computed(() => this.workspaceService.currentWorkspace());
  readonly filters = auditFiltersFromQueryParams(this.route.snapshot.queryParamMap);
  private loadSequence = 0;

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (workspaceId) void this.load(workspaceId);
    });
  }

  print(): void {
    printAuditDocument(() => window.print());
  }

  back(): void {
    this.location.back();
  }

  actorLabel(actorId: string | null): string {
    if (!actorId) return 'System';
    const member = this.memberService.members().find((candidate) => candidate.user_id === actorId);
    return member?.full_name || member?.email || actorId;
  }

  private async load(workspaceId: string): Promise<void> {
    const sequence = ++this.loadSequence;
    if (!canExportAuditData(this.memberService.currentUserRole())) {
      this.error.set(
        'Für die globale Druckansicht ist eine Inhaber-, Admin- oder Buchhaltungsrolle erforderlich.',
      );
      this.events.set([]);
      return;
    }
    this.isLoading.set(true);
    this.error.set(null);
    const collected: BusinessEvent[] = [];
    try {
      const entityType = this.route.snapshot.queryParamMap.get(
        'entityType',
      ) as BusinessEntityType | null;
      const entityId = this.route.snapshot.queryParamMap.get('entityId');
      let cursor: string | undefined;
      do {
        const page =
          entityType && entityId
            ? await this.eventsService.listEntityEvents({
                workspaceId,
                entityType,
                entityId,
                cursor,
                pageSize: 100,
              })
            : await this.eventsService.listEvents({
                ...toBusinessEventFilter(workspaceId, this.filters, cursor),
                pageSize: 100,
              });
        collected.push(...page.events);
        cursor = page.nextCursor ?? undefined;
        if (collected.length >= 5000) {
          cursor = undefined;
          this.error.set(
            'Die Druckansicht ist auf 5.000 Vorgänge begrenzt. Nutze für vollständige Daten das ZIP-Archiv.',
          );
        }
      } while (cursor);
      if (
        sequence !== this.loadSequence ||
        this.workspaceService.currentWorkspace()?.id !== workspaceId
      ) {
        return;
      }
      this.events.set(collected.map(summarizeAuditEvent));
      this.generatedAt.set(new Date().toISOString());
    } catch (error) {
      if (sequence !== this.loadSequence) return;
      this.error.set(
        error instanceof Error ? error.message : 'Die Druckansicht konnte nicht geladen werden.',
      );
      this.events.set([]);
    } finally {
      if (sequence === this.loadSequence) this.isLoading.set(false);
    }
  }
}

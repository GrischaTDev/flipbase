import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  LucideCheck,
  LucideClock,
  LucideInfo,
  LucideListTodo,
  LucideRefreshCw,
  LucideTriangleAlert,
  LucideDynamicIcon,
} from '@lucide/angular';
import {
  BadgeComponent,
  type BadgeTone,
} from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import {
  describeVintedAction,
  groupVintedActions,
  type VintedAction,
  type VintedActionState,
} from '../../models/vinted-action-overview';

const statusLabels: Record<VintedActionState, string> = {
  queued: 'Wartet',
  running: 'Läuft',
  succeeded: 'Erledigt',
  failed: 'Fehlgeschlagen',
  outcome_unknown: 'Bestätigung unklar',
  cancelled: 'Abgebrochen',
  skipped: 'Ausgelassen',
};
@Component({
  selector: 'app-vinted-action-overview',
  imports: [
    DatePipe,
    LucideDynamicIcon,
    BadgeComponent,
    ButtonComponent,
    LoadingIndicatorComponent,
    NoticeBannerComponent,
  ],
  templateUrl: './vinted-action-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedActionOverviewComponent {
  readonly actions = input<readonly VintedAction[]>([]);
  readonly accountName = input('');
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly showHeading = input(true);
  readonly refreshed = output<void>();
  readonly queueIcon = LucideListTodo;
  readonly refreshIcon = LucideRefreshCw;
  readonly infoIcon = LucideInfo;
  readonly pendingCount = computed(
    () =>
      this.actions().filter((action) => action.state === 'running' || action.state === 'queued')
        .length,
  );
  readonly sections = computed(() => {
    const groups = groupVintedActions(this.actions());
    return [
      { label: 'Wird ausgeführt', actions: groups.running },
      { label: 'In der Warteschlange', actions: groups.queued },
      { label: 'Bitte prüfen', actions: groups.attention },
      { label: 'Zuletzt erledigt', actions: groups.recent },
    ]
      .filter((section) => section.actions.length)
      .map((section) => ({
        label: section.label,
        rows: section.actions.map((action) => {
          const tone: BadgeTone =
            action.state === 'failed'
              ? 'critical'
              : action.state === 'outcome_unknown'
                ? 'caution'
                : action.state === 'succeeded'
                  ? 'success'
                  : 'neutral';
          const amount =
            action.priceCents !== null && action.currency
              ? new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: action.currency,
                }).format(action.priceCents / 100)
              : null;
          return {
            action,
            title: describeVintedAction(action),
            subtitle:
              [action.partnerName, amount].filter(Boolean).join(' · ') || this.accountName(),
            detail: action.textPreview ?? action.itemTitle,
            status: statusLabels[action.state],
            tone,
            icon:
              action.state === 'succeeded'
                ? LucideCheck
                : action.state === 'failed' || action.state === 'outcome_unknown'
                  ? LucideTriangleAlert
                  : LucideClock,
          };
        }),
      }));
  });
}

import type { KleinanzeigenAction } from '../services/kleinanzeigen-action.store';
import type { VintedAccountActionEntry } from '../services/vinted-account-action.store';
import type { VintedListingActionEntry } from '../services/vinted-action-overview-header.store';
import type { VintedListingOperation } from '../services/vinted-listing-operation.store';
import type { VintedAction } from './vinted-action-overview';
import type { VintedAccountAction } from './vinted-account-action';
import { isVintedListingConfirmationPending, type VintedListingJob } from './vinted-listing-job';

export type ActionIndicator = 'running' | 'success' | 'error' | 'paused';

/** Ein Eintrag der Seitenleiste „Aktionen“, gleich welcher Herkunft. */
export type ActionDrawerItem = {
  readonly key: string;
  /** Läuft oder wartet noch; sonst gehört der Eintrag zu „Vergangen“. */
  readonly running: boolean;
  /** Start der Aktion; bestimmt bei fehlendem Termin die Reihenfolge. */
  readonly startedAt: number;
  /** Letzte Änderung; bestimmt die Reihenfolge im Verlauf. */
  readonly updatedAt: number;
} & (
  | { readonly kind: 'account'; readonly entry: VintedAccountActionEntry }
  | { readonly kind: 'operation'; readonly operation: VintedListingOperation }
  | {
      readonly kind: 'overview';
      readonly action: VintedAction;
      readonly accountName: string;
      readonly connectionId: string;
    }
  | { readonly kind: 'listing'; readonly entry: VintedListingActionEntry }
  | { readonly kind: 'kleinanzeigen'; readonly action: KleinanzeigenAction }
);

export function vintedAccountActionIndicator(
  action: VintedAccountAction,
  reconciliation?: VintedAccountAction,
): ActionIndicator {
  if (reconciliation?.state === 'running') return 'running';
  if (reconciliation?.state === 'queued') return 'paused';
  return action.state === 'queued' || action.state === 'cancelled'
    ? 'paused'
    : action.state === 'running'
      ? 'running'
      : action.state === 'succeeded'
        ? 'success'
        : 'error';
}

export function vintedListingJobIndicator(job: VintedListingJob): ActionIndicator {
  return job.state === 'confirmed' && job.providerState !== 'processing'
    ? 'success'
    : job.state === 'failed' ||
        (job.state === 'outcome_unknown' && !isVintedListingConfirmationPending(job))
      ? 'error'
      : job.state === 'paused' ||
          (!!job.scheduledAt &&
            job.state === 'queued' &&
            (!job.relistExternalId || !!job.relistDeletedAt))
        ? 'paused'
        : 'running';
}

const time = (value: string | null | undefined) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const visibleOverviewStates = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'outcome_unknown',
  'cancelled',
];

/** Führt alle Quellen zusammen; jede behält ihre eigene Darstellung und Bedienung. */
export function actionDrawerItems(sources: {
  readonly accountActions: readonly VintedAccountActionEntry[];
  readonly operations: readonly VintedListingOperation[];
  readonly overviewGroups: readonly {
    readonly scope: { readonly connectionId: string };
    readonly accountName: string;
    readonly actions: readonly VintedAction[];
  }[];
  readonly listings: readonly VintedListingActionEntry[];
  readonly kleinanzeigen: readonly KleinanzeigenAction[];
}): readonly ActionDrawerItem[] {
  return [
    ...sources.accountActions.map((entry): ActionDrawerItem => {
      const check = entry.reconciliation;
      return {
        kind: 'account',
        key: `account:${entry.action.id}`,
        entry,
        running:
          ['queued', 'running'].includes(entry.action.state) ||
          check?.state === 'queued' ||
          check?.state === 'running',
        startedAt: time(entry.action.createdAt),
        updatedAt: Math.max(time(entry.action.updatedAt), time(check?.updatedAt)),
      };
    }),
    ...sources.operations.map((operation): ActionDrawerItem => ({
      kind: 'operation',
      key: `operation:${operation.key}`,
      operation,
      running: operation.state === 'running',
      startedAt: time(operation.startedAt ?? operation.updatedAt),
      updatedAt: time(operation.updatedAt),
    })),
    ...sources.overviewGroups.flatMap((group) =>
      group.actions
        .filter((action) => visibleOverviewStates.includes(action.state))
        .map((action): ActionDrawerItem => ({
          kind: 'overview',
          key: `overview:${group.scope.connectionId}:${action.id}`,
          action,
          accountName: group.accountName,
          connectionId: group.scope.connectionId,
          running: action.state === 'queued' || action.state === 'running',
          startedAt: time(action.createdAt),
          updatedAt: time(action.updatedAt),
        })),
    ),
    ...sources.listings.map((entry): ActionDrawerItem => {
      const indicator = vintedListingJobIndicator(entry.job);
      return {
        kind: 'listing',
        key: `listing:${entry.job.id}`,
        entry,
        running: indicator === 'running' || indicator === 'paused',
        startedAt: time(entry.job.createdAt),
        updatedAt: time(entry.job.updatedAt),
      };
    }),
    ...sources.kleinanzeigen.map((action): ActionDrawerItem => ({
      kind: 'kleinanzeigen',
      key: `kleinanzeigen:${action.key}`,
      action,
      running: action.state === 'running',
      startedAt: time(action.updatedAt),
      updatedAt: time(action.updatedAt),
    })),
  ];
}

export function runningActionQueue(
  items: readonly ActionDrawerItem[],
): readonly { readonly item: ActionDrawerItem; readonly position: number }[] {
  const running = items
    .filter((item) => item.running)
    .sort(
      (left, right) =>
        nextActionTime(left) - nextActionTime(right) ||
        left.startedAt - right.startedAt ||
        left.key.localeCompare(right.key),
    );
  return running.map((item, index) => ({ item, position: index + 1 }));
}

function nextActionTime(item: ActionDrawerItem): number {
  if (item.kind !== 'listing' || item.entry.job.state !== 'queued') return item.startedAt;
  const job = item.entry.job;
  return (
    (!job.relistExternalId || job.relistDeletedAt ? time(job.scheduledAt) : 0) || item.startedAt
  );
}

/** Vergangene Aktionen wie ein Verlauf: zuletzt beendete oben. */
export function pastActions(items: readonly ActionDrawerItem[]): readonly ActionDrawerItem[] {
  return items
    .filter((item) => !item.running)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.key.localeCompare(right.key));
}

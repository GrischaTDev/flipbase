import { describe, expect, it } from 'vitest';
import type { VintedAccountActionEntry } from '../services/vinted-account-action.store';
import type { VintedListingActionEntry } from '../services/vinted-action-overview-header.store';
import type { VintedListingOperation } from '../services/vinted-listing-operation.store';
import { actionDrawerItems, pastActions, runningActionQueue } from './vinted-action-drawer';
import type { VintedAccountAction } from './vinted-account-action';
import type { VintedListingJob } from './vinted-listing-job';

const scope = { workspaceId: 'w', connectionId: 'c' };

function accountEntry(
  id: string,
  state: VintedAccountAction['state'],
  createdAt: string,
  updatedAt = createdAt,
): VintedAccountActionEntry {
  return {
    accountName: 'Konto',
    action: {
      ...scope,
      id,
      requestId: id,
      entryId: null,
      title: 'Artikel',
      kind: 'price_save',
      state,
      version: 1,
      waitReason: null,
      errorCode: null,
      result: null,
      blockedByActionId: null,
      historyPurged: false,
      resultExpired: false,
      createdAt,
      updatedAt,
      startedAt: null,
      finishedAt: null,
    },
  };
}

function listingEntry(
  id: string,
  state: VintedListingJob['state'],
  createdAt: string,
): VintedListingActionEntry {
  return {
    accountName: 'Konto',
    job: {
      id,
      workspaceId: 'w',
      connectionId: 'c',
      draftId: 'd',
      draftRevision: 1,
      executionMode: 'cloud',
      externalAccountId: '1',
      action: 'publish',
      state,
      version: 1,
      scheduledAt: null,
      timeZone: null,
      latePolicy: 'pause_after_30_minutes',
      errorCode: null,
      externalId: null,
      providerState: state === 'confirmed' ? 'active' : null,
      verifiedAt: null,
      createdAt,
      updatedAt: createdAt,
      replacesJobId: null,
      relistExternalId: '42',
      relistDeletedAt: null,
    } as VintedListingJob,
  };
}

const empty = {
  accountActions: [],
  operations: [],
  overviewGroups: [],
  listings: [],
  kleinanzeigen: [],
};

describe('Seitenleiste Aktionen', () => {
  it('zeigt laufende Aktionen ab Position 1 in Startreihenfolge', () => {
    const items = actionDrawerItems({
      ...empty,
      // Die Quellen liefern die Aktionen unabhängig von ihrer Startreihenfolge.
      accountActions: [accountEntry('price', 'running', '2026-11-16T00:00:00Z')],
      listings: [
        listingEntry('later-relist', 'queued', '2026-11-16T00:02:00Z'),
        listingEntry('next-relist', 'queued', '2026-11-16T00:01:00Z'),
      ],
    });
    const queue = runningActionQueue(items);
    expect(queue.map(({ item, position }) => [item.key, position])).toEqual([
      ['account:price', 1],
      ['listing:next-relist', 2],
      ['listing:later-relist', 3],
    ]);
  });

  it('ordnet geplante Relists nach ihrem aktuellen Termin', () => {
    const first = listingEntry('first', 'queued', '2026-11-16T00:01:00Z');
    const second = listingEntry('second', 'queued', '2026-11-16T00:02:00Z');
    const items = actionDrawerItems({
      ...empty,
      listings: [
        {
          ...first,
          job: {
            ...first.job,
            scheduledAt: '2026-11-16T00:05:00Z',
            relistDeletedAt: first.job.createdAt,
          },
        },
        {
          ...second,
          job: {
            ...second.job,
            scheduledAt: '2026-11-16T00:03:00Z',
            relistDeletedAt: second.job.createdAt,
          },
        },
      ],
    });
    expect(runningActionQueue(items).map(({ item, position }) => [item.key, position])).toEqual([
      ['listing:second', 1],
      ['listing:first', 2],
    ]);
  });

  it('trennt abgeschlossene Aktionen als Verlauf mit dem zuletzt beendeten oben', () => {
    const operation: VintedListingOperation = {
      key: 'op',
      kind: 'price',
      userId: 'u',
      workspaceId: 'w',
      connectionId: 'c',
      entryId: 'e',
      title: 'Jacke',
      imageUrl: null,
      startedAt: '2026-11-16T00:00:00Z',
      state: 'success',
      message: 'Preis geändert',
      updatedAt: '2026-11-16T00:05:00Z',
    };
    const items = actionDrawerItems({
      ...empty,
      accountActions: [
        accountEntry('old', 'succeeded', '2026-11-15T23:00:00Z', '2026-11-15T23:01:00Z'),
        accountEntry('waiting', 'queued', '2026-11-16T00:02:00Z'),
      ],
      operations: [operation],
      listings: [listingEntry('done', 'confirmed', '2026-11-16T00:03:00Z')],
    });
    expect(pastActions(items).map((item) => item.key)).toEqual([
      'operation:op',
      'listing:done',
      'account:old',
    ]);
    expect(runningActionQueue(items).map(({ item }) => item.key)).toEqual(['account:waiting']);
  });
});

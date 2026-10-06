import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { MarketplaceAccountPreview } from '../models/marketplace-read.models';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';

interface AccountPreviewState {
  readonly preview: MarketplaceAccountPreview | null;
  readonly error: boolean;
  readonly loading: boolean;
}

/** Kleine, getrennte Vorschauen aus bereits importierten Kontodaten. */
@Injectable()
export class VintedAccountPreviewsStore {
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly api = inject(MarketplaceApiService);
  private readonly states = signal<Readonly<Record<string, AccountPreviewState>>>({});
  private revision = 0;
  private readonly importKey = computed(() =>
    JSON.stringify([
      this.accounts.canManage(),
      this.accounts
        .connections()
        .slice()
        .sort((first, second) => first.connectionId.localeCompare(second.connectionId))
        .map(({ workspaceId, connectionId, lastSyncedAt }) => [
          workspaceId,
          connectionId,
          lastSyncedAt,
        ]),
    ]),
  );
  readonly tiles = computed(() =>
    (this.accounts.canManage() ? this.accounts.connections() : []).map((connection) => ({
      connection,
      ...(this.states()[`${connection.workspaceId}:${connection.connectionId}`] ?? {
        preview: null,
        error: false,
        loading: true,
      }),
    })),
  );

  constructor() {
    effect((onCleanup) => {
      this.importKey();
      const revision = ++this.revision;
      onCleanup(() => {
        this.revision++;
      });
      untracked(() => {
        const connections = this.accounts.connections();
        if (!this.accounts.canManage()) {
          this.states.set({});
          return;
        }
        this.states.update((previous) =>
          Object.fromEntries(
            connections.map((account) => {
              const key = `${account.workspaceId}:${account.connectionId}`;
              return [
                key,
                { preview: previous[key]?.preview ?? null, error: false, loading: true },
              ];
            }),
          ),
        );
        // Auch mit vielen Konten höchstens drei Vorschauen gleichzeitig lesen.
        void (async () => {
          for (
            let offset = 0;
            offset < connections.length && revision === this.revision;
            offset += 3
          ) {
            await Promise.all(
              connections.slice(offset, offset + 3).map(async (account) => {
                const key = `${account.workspaceId}:${account.connectionId}`;
                try {
                  const preview = await this.api.readAccountPreview(account);
                  if (revision === this.revision)
                    this.states.update((states) => ({
                      ...states,
                      [key]: { preview, error: false, loading: false },
                    }));
                } catch {
                  if (revision === this.revision)
                    this.states.update((states) => ({
                      ...states,
                      [key]: { preview: states[key]?.preview ?? null, error: true, loading: false },
                    }));
                }
              }),
            );
          }
        })();
      });
    });
  }
}

import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import {
  parseVintedLocalReadiness,
  type VintedLocalReadiness,
} from '../models/vinted-local-readiness';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';

/** Aktuelle Profilbereitschaft getrennt von gespeicherten Kontofreigaben. */
@Injectable()
export class VintedLocalRuntimeStore {
  private readonly bridge = inject(VintedLocalExtensionBridge);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly context = computed(() => {
    const user = this.auth.currentUser();
    const workspace = this.workspace.currentWorkspace();
    return user && workspace && !workspace.archived_at
      ? JSON.stringify([user.id, workspace.id])
      : null;
  });
  readonly contextKey = this.context;
  private readonly checked = signal<{
    context: string;
    readiness: VintedLocalReadiness | null;
    error: string | null;
  } | null>(null);
  private readonly checkingContext = signal<string | null>(null);
  private pending: { context: string; explicit: boolean; promise: Promise<void> } | null = null;
  private revision = 0;
  private destroyed = false;
  readonly readiness = computed(() =>
    this.checked()?.context === this.context() ? (this.checked()?.readiness ?? null) : null,
  );
  readonly error = computed(() =>
    this.checked()?.context === this.context() ? (this.checked()?.error ?? null) : null,
  );
  readonly checking = computed(
    () => this.context() !== null && this.checkingContext() === this.context(),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
    });
  }
  check(explicit = false): Promise<void> {
    const context = this.context();
    if (this.destroyed || !context || !this.bridge.installed()) return Promise.resolve();
    if (this.pending?.context === context) {
      if (explicit && !this.pending.explicit)
        return this.pending.promise.then(() =>
          this.context() === context ? this.check(true) : undefined,
        );
      return this.pending.promise;
    }
    const revision = ++this.revision;
    this.checkingContext.set(context);
    const valid = () => !this.destroyed && revision === this.revision && context === this.context();
    const promise = (async () => {
      try {
        const readiness = parseVintedLocalReadiness(
          await this.bridge.request(
            explicit ? 'FLIPBASE_VINTED_LOCAL_RECHECK' : 'FLIPBASE_VINTED_LOCAL_READINESS',
          ),
        );
        if (!valid()) return;
        if (!readiness)
          throw new Error('Die Erweiterung hat keinen gültigen Betriebsstatus geliefert.');
        this.checked.set({ context, readiness, error: null });
      } catch (error: unknown) {
        if (valid())
          this.checked.set({
            context,
            readiness: null,
            error:
              error instanceof Error
                ? error.message
                : 'Die lokale Verbindung ist nicht erreichbar.',
          });
      } finally {
        if (revision === this.revision) {
          this.checkingContext.set(null);
          this.pending = null;
        }
      }
    })();
    this.pending = { context, explicit, promise };
    return promise;
  }
}

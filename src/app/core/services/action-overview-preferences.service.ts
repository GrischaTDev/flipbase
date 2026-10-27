import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

interface PreferenceRequestContext {
  readonly userId: string;
  readonly token: string;
  readonly generation: number;
  readonly signal: AbortSignal;
}

@Injectable({ providedIn: 'root' })
export class ActionOverviewPreferencesService {
  private readonly auth = inject(AuthService);
  private readonly enabledState = signal(false);
  private readonly savingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly contextUserId = signal<string | null>(null);
  private generation = 0;
  private editRevision = 0;
  private observedMetadata: unknown;
  private controller = new AbortController();
  private queuedEnabled: boolean | null = null;
  private writing = false;

  readonly enabled: Signal<boolean> = computed(() =>
    this.auth.currentUser()?.id === this.contextUserId() ? this.enabledState() : false,
  );
  readonly saving: Signal<boolean> = computed(
    () => this.auth.currentUser()?.id === this.contextUserId() && this.savingState(),
  );
  readonly error: Signal<string | null> = computed(() =>
    this.auth.currentUser()?.id === this.contextUserId() ? this.errorState() : null,
  );

  constructor() {
    this.synchronizeContext();
    effect(() => {
      this.synchronizeContext();
    });
  }

  setEnabled(enabled: boolean): void {
    this.synchronizeContext();
    if (!this.auth.currentUser()) return;
    this.enabledState.set(enabled);
    this.errorState.set(null);
    this.editRevision += 1;
    if (!this.captureContext()) {
      this.errorState.set(this.errorMessage(new Error('Deine Sitzung ist nicht mehr aktuell.')));
      return;
    }
    this.queuedEnabled = enabled;
    this.savingState.set(true);
    void this.saveQueuedPreferences();
  }

  private synchronizeContext(): void {
    const user = this.auth.currentUser();
    const metadata: unknown = user?.user_metadata?.['flipbase_action_overview'];
    if ((user?.id ?? null) === this.contextUserId()) {
      if (metadata !== this.observedMetadata) {
        this.observedMetadata = metadata;
        if (!this.savingState() && !this.errorState()) this.enabledState.set(metadata === true);
      }
      return;
    }
    this.controller.abort();
    this.controller = new AbortController();
    this.contextUserId.set(user?.id ?? null);
    this.generation += 1;
    this.editRevision = 0;
    this.queuedEnabled = null;
    this.observedMetadata = metadata;
    this.enabledState.set(metadata === true);
    this.savingState.set(false);
    this.errorState.set(null);
    const context = this.captureContext();
    if (context) void this.refresh(context, this.editRevision);
  }

  private captureContext(): PreferenceRequestContext | null {
    const session = this.auth.session();
    const userId = this.auth.currentUser()?.id;
    if (
      !userId ||
      userId !== this.contextUserId() ||
      session?.user.id !== userId ||
      !session.access_token
    )
      return null;
    return {
      userId,
      token: session.access_token,
      generation: this.generation,
      signal: this.controller.signal,
    };
  }

  private async refresh(context: PreferenceRequestContext, revision: number): Promise<void> {
    try {
      const user = await this.requestUser(context, 'GET');
      if (!this.isCurrentUser(context) || this.editRevision !== revision) return;
      this.enabledState.set(this.readMetadata(user) === true);
    } catch {
      // Vorhandene Sitzungsmetadaten bleiben bei fehlender Verbindung nutzbar.
    }
  }

  private async saveQueuedPreferences(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.queuedEnabled !== null) {
        const context = this.captureContext();
        const enabled = this.queuedEnabled;
        this.queuedEnabled = null;
        if (!context) {
          this.errorState.set(
            this.errorMessage(new Error('Deine Sitzung ist nicht mehr aktuell.')),
          );
          break;
        }
        try {
          const user = await this.requestUser(context, 'PUT', enabled);
          if (this.readMetadata(user) !== enabled)
            throw new Error('Die Einstellung wurde nicht bestätigt.');
          if (this.isCurrentUser(context)) this.errorState.set(null);
        } catch (error: unknown) {
          if (this.isCurrentUser(context)) this.errorState.set(this.errorMessage(error));
        }
      }
    } finally {
      this.writing = false;
      if (this.queuedEnabled === null) this.savingState.set(false);
    }
  }

  private async requestUser(
    context: PreferenceRequestContext,
    method: 'GET' | 'PUT',
    enabled?: boolean,
  ): Promise<Record<string, unknown>> {
    // GoTrue-REST mit festgehaltenem Token verhindert, dass SDK-Locks oder späte
    // USER_UPDATED-Antworten die inzwischen gewechselte Anmeldung verändern.
    const response = await fetch(`${environment.supabaseUrl}/auth/v1/user`, {
      method,
      headers: {
        Authorization: `Bearer ${context.token}`,
        apikey: environment.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      signal: context.signal,
      ...(method === 'PUT'
        ? { body: JSON.stringify({ data: { flipbase_action_overview: enabled } }) }
        : {}),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message =
        this.isRecord(payload) && typeof payload['message'] === 'string'
          ? payload['message']
          : `HTTP ${response.status}`;
      throw new Error(message);
    }
    if (!this.isRecord(payload) || payload['id'] !== context.userId)
      throw new Error('Die Antwort gehört nicht zu Deinem Konto.');
    return payload;
  }

  private readMetadata(user: Record<string, unknown>): unknown {
    const metadata = user['user_metadata'];
    return this.isRecord(metadata) ? metadata['flipbase_action_overview'] : undefined;
  }
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  private isCurrentUser(context: PreferenceRequestContext): boolean {
    return this.generation === context.generation && this.auth.currentUser()?.id === context.userId;
  }
  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Deine Einstellung konnte nicht gespeichert werden: ${message || 'Unbekannter Fehler'}`;
  }
}

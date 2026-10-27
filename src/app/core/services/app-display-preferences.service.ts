import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

interface PreferenceRequestContext {
  readonly userId: string;
  readonly token: string;
  readonly generation: number;
  readonly signal: AbortSignal;
}
export interface AppDisplayPreferences {
  readonly actionOverviewEnabled: boolean;
  readonly workspaceSwitcherEnabled: boolean;
}
const defaultPreferences: AppDisplayPreferences = {
  actionOverviewEnabled: false,
  workspaceSwitcherEnabled: true,
};

@Injectable({ providedIn: 'root' })
export class AppDisplayPreferencesService {
  private readonly auth = inject(AuthService);
  private readonly preferencesState = signal(defaultPreferences);
  private readonly savingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly contextUserId = signal<string | null>(null);
  private generation = 0;
  private editRevision = 0;
  private observedPreferences = defaultPreferences;
  private fieldRevisions = { actionOverviewEnabled: 0, workspaceSwitcherEnabled: 0 };
  private controller = new AbortController();
  private queuedPreferences: Partial<AppDisplayPreferences> | null = null;
  private writing = false;

  private readonly currentPreferences = computed(() =>
    this.auth.currentUser()?.id === this.contextUserId()
      ? this.preferencesState()
      : defaultPreferences,
  );
  readonly actionOverviewEnabled = computed(() => this.currentPreferences().actionOverviewEnabled);
  readonly workspaceSwitcherEnabled = computed(
    () => this.currentPreferences().workspaceSwitcherEnabled,
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

  save(preferences: Partial<AppDisplayPreferences>): void {
    if (
      preferences.actionOverviewEnabled === undefined &&
      preferences.workspaceSwitcherEnabled === undefined
    )
      return;
    this.synchronizeContext();
    if (!this.auth.currentUser()) return;
    this.preferencesState.update((current) => ({ ...current, ...preferences }));
    this.errorState.set(null);
    this.editRevision += 1;
    if (preferences.actionOverviewEnabled !== undefined)
      this.fieldRevisions.actionOverviewEnabled = this.editRevision;
    if (preferences.workspaceSwitcherEnabled !== undefined)
      this.fieldRevisions.workspaceSwitcherEnabled = this.editRevision;
    if (!this.captureContext()) {
      this.errorState.set(this.errorMessage(new Error('Deine Sitzung ist nicht mehr aktuell.')));
      return;
    }
    this.queuedPreferences = { ...this.queuedPreferences, ...preferences };
    this.savingState.set(true);
    void this.saveQueuedPreferences();
  }

  private synchronizeContext(): void {
    const user = this.auth.currentUser();
    const preferences = this.readPreferences(user?.user_metadata);
    if ((user?.id ?? null) === this.contextUserId()) {
      if (
        preferences.actionOverviewEnabled !== this.observedPreferences.actionOverviewEnabled ||
        preferences.workspaceSwitcherEnabled !== this.observedPreferences.workspaceSwitcherEnabled
      ) {
        this.observedPreferences = preferences;
        if (!this.savingState() && !this.errorState()) this.preferencesState.set(preferences);
      }
      return;
    }
    this.controller.abort();
    this.controller = new AbortController();
    this.contextUserId.set(user?.id ?? null);
    this.generation += 1;
    this.editRevision = 0;
    this.fieldRevisions = { actionOverviewEnabled: 0, workspaceSwitcherEnabled: 0 };
    this.queuedPreferences = null;
    this.observedPreferences = preferences;
    this.preferencesState.set(preferences);
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
      if (!this.isCurrentUser(context)) return;
      this.adoptPreferences(user, revision);
    } catch {
      // Vorhandene Sitzungsmetadaten bleiben bei fehlender Verbindung nutzbar.
    }
  }

  private async saveQueuedPreferences(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.queuedPreferences !== null) {
        const context = this.captureContext();
        const preferences = this.queuedPreferences;
        const revision = this.editRevision;
        this.queuedPreferences = null;
        if (!context) {
          this.errorState.set(
            this.errorMessage(new Error('Deine Sitzung ist nicht mehr aktuell.')),
          );
          break;
        }
        try {
          const user = await this.requestUser(context, 'PUT', preferences);
          const confirmed = this.readPreferences(user['user_metadata']);
          if (
            (preferences.actionOverviewEnabled !== undefined &&
              confirmed.actionOverviewEnabled !== preferences.actionOverviewEnabled) ||
            (preferences.workspaceSwitcherEnabled !== undefined &&
              confirmed.workspaceSwitcherEnabled !== preferences.workspaceSwitcherEnabled)
          )
            throw new Error('Die Einstellung wurde nicht bestätigt.');
          if (this.isCurrentUser(context)) {
            this.adoptPreferences(user, revision);
            this.errorState.set(null);
          }
        } catch (error: unknown) {
          if (this.isCurrentUser(context)) this.errorState.set(this.errorMessage(error));
        }
      }
    } finally {
      this.writing = false;
      if (this.queuedPreferences === null) this.savingState.set(false);
    }
  }

  private async requestUser(
    context: PreferenceRequestContext,
    method: 'GET' | 'PUT',
    preferences?: Partial<AppDisplayPreferences>,
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
        ? {
            body: JSON.stringify({
              data: {
                ...(preferences?.actionOverviewEnabled !== undefined
                  ? { flipbase_action_overview: preferences.actionOverviewEnabled }
                  : {}),
                ...(preferences?.workspaceSwitcherEnabled !== undefined
                  ? { flipbase_workspace_switcher: preferences.workspaceSwitcherEnabled }
                  : {}),
              },
            }),
          }
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

  private readPreferences(metadata: unknown): AppDisplayPreferences {
    return {
      actionOverviewEnabled:
        this.isRecord(metadata) && metadata['flipbase_action_overview'] === true,
      workspaceSwitcherEnabled:
        !this.isRecord(metadata) || metadata['flipbase_workspace_switcher'] !== false,
    };
  }
  private adoptPreferences(user: Record<string, unknown>, revision: number): void {
    const preferences = this.readPreferences(user['user_metadata']);
    this.preferencesState.update((current) => ({
      actionOverviewEnabled:
        this.fieldRevisions.actionOverviewEnabled <= revision
          ? preferences.actionOverviewEnabled
          : current.actionOverviewEnabled,
      workspaceSwitcherEnabled:
        this.fieldRevisions.workspaceSwitcherEnabled <= revision
          ? preferences.workspaceSwitcherEnabled
          : current.workspaceSwitcherEnabled,
    }));
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

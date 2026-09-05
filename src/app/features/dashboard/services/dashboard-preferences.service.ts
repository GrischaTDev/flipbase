import { Injectable, Signal, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { DashboardRange } from '../../../core/models/flipbase.models';
import { DashboardPlatform } from '../../../core/services/dashboard-report.service';
import { DashboardPreferences, parseDashboardPreferences } from '../models/dashboard-preferences';

const demoStorageKey = 'flipbase_demo_dashboard_v1';
const defaultPreferences: DashboardPreferences = { range: 'year', platform: 'all' };

@Injectable({ providedIn: 'root' })
export class DashboardPreferencesService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly preferencesState = signal<DashboardPreferences>(defaultPreferences);
  private readonly saveErrorState = signal<string | null>(null);
  private activeUserId: string | null = null;
  private generation = 0;
  private editRevision = 0;
  private queuedPreferences: DashboardPreferences | null = null;
  private saving = false;

  readonly preferences: Signal<DashboardPreferences> = this.preferencesState.asReadonly();
  readonly saveError: Signal<string | null> = this.saveErrorState.asReadonly();

  constructor() {
    this.synchronizeContext(this.auth.isDemoMode(), this.auth.currentUser());
    effect(() => {
      const demoMode = this.auth.isDemoMode();
      const user = this.auth.currentUser();
      this.synchronizeContext(demoMode, user);
    });
  }

  setRange(range: DashboardRange): void {
    this.updatePreferences({ ...this.preferencesState(), range });
  }

  setPlatform(platform: DashboardPlatform): void {
    this.updatePreferences({ ...this.preferencesState(), platform });
  }

  private updatePreferences(preferences: DashboardPreferences): void {
    this.preferencesState.set(preferences);
    this.saveErrorState.set(null);
    this.editRevision += 1;

    if (this.auth.isDemoMode()) {
      this.storeDemoPreferences(preferences);
      return;
    }

    const userId = this.auth.currentUser()?.id;
    if (!userId || userId !== this.activeUserId) return;
    this.queuedPreferences = preferences;
    void this.saveQueuedPreferences(userId, this.generation);
  }

  private switchContext(userId: string | null): void {
    this.activeUserId = userId;
    this.generation += 1;
    this.editRevision = 0;
    this.queuedPreferences = null;
    this.saveErrorState.set(null);
  }

  private synchronizeContext(
    demoMode: boolean,
    user: ReturnType<AuthService['currentUser']>,
  ): void {
    if (demoMode) {
      if (this.activeUserId !== 'demo') {
        this.switchContext('demo');
        this.preferencesState.set(this.readDemoPreferences());
      }
      return;
    }

    if (!user) {
      if (this.activeUserId !== null) {
        this.switchContext(null);
        this.preferencesState.set(defaultPreferences);
      }
      return;
    }

    if (this.activeUserId === user.id) return;

    this.switchContext(user.id);
    this.preferencesState.set(
      parseDashboardPreferences(user.user_metadata?.['flipbase_dashboard']),
    );
    void this.refreshUserPreferences(user.id, this.generation, this.editRevision);
  }

  private async refreshUserPreferences(
    userId: string,
    generation: number,
    editRevision: number,
  ): Promise<void> {
    try {
      const { data, error } = await this.supabase.client.auth.getUser();
      if (error || !data.user) return;
      if (!this.isCurrentUser(userId, generation) || this.editRevision !== editRevision) return;
      if (data.user.id !== userId) return;
      this.preferencesState.set(
        parseDashboardPreferences(data.user.user_metadata?.['flipbase_dashboard']),
      );
    } catch {
      // Die beim Start vorhandenen Metadaten bleiben bei einem Netzwerkfehler nutzbar.
    }
  }

  private async saveQueuedPreferences(userId: string, generation: number): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      while (this.queuedPreferences && this.isCurrentUser(userId, generation)) {
        const nextPreferences = this.queuedPreferences;
        this.queuedPreferences = null;

        try {
          const { error } = await this.supabase.client.auth.updateUser({
            data: { flipbase_dashboard: nextPreferences },
          });
          if (!this.isCurrentUser(userId, generation)) return;
          this.saveErrorState.set(error ? this.errorMessage(error) : null);
        } catch (error: unknown) {
          if (!this.isCurrentUser(userId, generation)) return;
          this.saveErrorState.set(this.errorMessage(error));
        }
      }
    } finally {
      this.saving = false;
      if (this.queuedPreferences && this.activeUserId && this.activeUserId !== 'demo') {
        void this.saveQueuedPreferences(this.activeUserId, this.generation);
      }
    }
  }

  private isCurrentUser(userId: string, generation: number): boolean {
    return (
      this.generation === generation &&
      this.activeUserId === userId &&
      this.auth.currentUser()?.id === userId &&
      !this.auth.isDemoMode()
    );
  }

  private readDemoPreferences(): DashboardPreferences {
    try {
      const stored = localStorage.getItem(demoStorageKey);
      return parseDashboardPreferences(stored ? JSON.parse(stored) : undefined);
    } catch {
      return defaultPreferences;
    }
  }

  private storeDemoPreferences(preferences: DashboardPreferences): void {
    try {
      localStorage.setItem(demoStorageKey, JSON.stringify(preferences));
    } catch {
      this.saveErrorState.set('Die Dashboard-Auswahl konnte lokal nicht gespeichert werden.');
    }
  }

  private errorMessage(error: unknown): string {
    const detail =
      error instanceof Error
        ? error.message
        : String((error as { message?: unknown })?.message ?? error);
    return `Die Dashboard-Auswahl konnte nicht gespeichert werden: ${detail || 'Unbekannter Fehler'}`;
  }
}

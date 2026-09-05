import { Injectable, effect, inject, signal } from '@angular/core';
import {
  TableColumnOption,
  TablePreferences,
  parseTablePreferences,
} from '../models/table-preferences';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

const demoStorageKey = 'flipbase_demo_table_preferences_v1';
@Injectable({ providedIn: 'root' })
export class TablePreferencesService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly preferences = signal<TablePreferences>({});
  private readonly error = signal<string | null>(null);
  readonly saveError = this.error.asReadonly();
  private activeUserId: string | null = null;
  private generation = 0;
  private editRevision = 0;
  private queued: TablePreferences | null = null;
  private saving = false;

  constructor() {
    this.synchronizeContext();
    effect(() => this.synchronizeContext());
  }

  visibleColumns(tableId: string, definitions: readonly TableColumnOption[]): readonly string[] {
    const saved = this.preferences()[tableId];
    return definitions
      .filter((column) => column.required || !saved || saved.includes(column.id))
      .map((column) => column.id);
  }

  setVisibleColumns(tableId: string, columnIds: readonly string[]): void {
    this.synchronizeContext();
    this.update({ ...this.preferences(), [tableId]: [...new Set(columnIds)] });
  }

  reset(tableId: string): void {
    this.synchronizeContext();
    const next = { ...this.preferences() };
    delete next[tableId];
    this.update(next);
  }

  private update(preferences: TablePreferences): void {
    this.preferences.set(preferences);
    this.error.set(null);
    this.editRevision++;
    if (this.auth.isDemoMode()) {
      try {
        localStorage.setItem(demoStorageKey, JSON.stringify(preferences));
      } catch {
        this.error.set('Die Spaltenauswahl konnte lokal nicht gespeichert werden.');
      }
      return;
    }
    const userId = this.auth.currentUser()?.id;
    if (!userId || userId !== this.activeUserId) return;
    this.queued = preferences;
    void this.saveQueued(userId, this.generation);
  }

  private synchronizeContext(): void {
    const demo = this.auth.isDemoMode();
    const user = this.auth.currentUser();
    const id = demo ? 'demo' : (user?.id ?? null);
    if (this.activeUserId === id) return;
    this.activeUserId = id;
    this.generation++;
    this.editRevision = 0;
    this.queued = null;
    this.error.set(null);
    if (demo) {
      try {
        this.preferences.set(
          parseTablePreferences(JSON.parse(localStorage.getItem(demoStorageKey) ?? 'null')),
        );
      } catch {
        this.preferences.set({});
      }
    } else {
      this.preferences.set(parseTablePreferences(user?.user_metadata?.['table_preferences_v1']));
      if (id) void this.refresh(id, this.generation, this.editRevision);
    }
  }

  private isCurrent(userId: string, generation: number): boolean {
    return (
      this.generation === generation &&
      this.activeUserId === userId &&
      this.auth.currentUser()?.id === userId &&
      !this.auth.isDemoMode()
    );
  }

  private async refresh(userId: string, generation: number, revision: number): Promise<void> {
    try {
      const { data, error } = await this.supabase.client.auth.getUser();
      if (
        !error &&
        data.user?.id === userId &&
        this.isCurrent(userId, generation) &&
        this.editRevision === revision
      ) {
        this.preferences.set(
          parseTablePreferences(data.user.user_metadata?.['table_preferences_v1']),
        );
      }
    } catch {
      /* Bereits geladene Auswahl bleibt bei Netzwerkfehlern nutzbar. */
    }
  }

  private async saveQueued(userId: string, generation: number): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      while (this.queued && this.isCurrent(userId, generation)) {
        const next = this.queued;
        this.queued = null;
        try {
          const { error } = await this.supabase.client.auth.updateUser({
            data: { table_preferences_v1: next },
          });
          if (!this.isCurrent(userId, generation)) return;
          this.error.set(
            error ? `Die Spaltenauswahl konnte nicht gespeichert werden: ${error.message}` : null,
          );
        } catch (error: unknown) {
          if (!this.isCurrent(userId, generation)) return;
          this.error.set(
            `Die Spaltenauswahl konnte nicht gespeichert werden: ${error instanceof Error ? error.message : 'Netzwerkfehler'}`,
          );
        }
      }
    } finally {
      this.saving = false;
      if (this.queued && this.activeUserId && this.isCurrent(this.activeUserId, this.generation))
        void this.saveQueued(this.activeUserId, this.generation);
    }
  }
}

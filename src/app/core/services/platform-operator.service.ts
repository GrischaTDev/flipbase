import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

/**
 * Beantwortet, ob der angemeldete Nutzer Betreiber ist.
 *
 * Die Antwort kommt aus der Datenbank, nicht aus einem Anspruch im Token: Die
 * Befugnis wird ohnehin dort durchgesetzt, und zwei Wahrheiten waeren eine zu
 * viel.
 */
@Injectable({ providedIn: 'root' })
export class PlatformOperatorService {
  private readonly supabase = inject(SupabaseService);
  private pruefung: Promise<boolean> | null = null;

  readonly operator = signal(false);

  isOperator(): Promise<boolean> {
    this.pruefung ??= this.frage();
    return this.pruefung;
  }

  /** Nach einem Rollenwechsel oder einer Abmeldung neu fragen. */
  reset(): void {
    this.pruefung = null;
    this.operator.set(false);
  }

  private async frage(): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('is_platform_operator');
    const istBetreiber = !error && data === true;
    this.operator.set(istBetreiber);
    return istBetreiber;
  }
}

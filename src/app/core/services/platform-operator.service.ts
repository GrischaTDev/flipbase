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

  /**
   * Nutzerkennung, fuer die `pruefung` gilt - `null` bedeutet "keine Sitzung".
   *
   * Ohne diese Bindung ueberlebte die Antwort einen Nutzerwechsel: Ein
   * Abmelden laeuft als reine Navigation ohne Neuladen, der Dienst bliebe
   * also bestehen und gaebe die Antwort des vorherigen Nutzers weiter. Statt
   * auf einen Aufruf wie `reset()` bei jedem kuenftigen Abmeldeweg zu setzen,
   * prueft `isOperator()` bei jedem Aufruf selbst, ob die zwischengespeicherte
   * Antwort noch zur aktuellen Sitzung gehoert.
   */
  private geprueftFuer: string | null = null;

  readonly operator = signal(false);

  async isOperator(): Promise<boolean> {
    const nutzerId = await this.aktuelleNutzerId();

    if (this.pruefung && this.geprueftFuer === nutzerId) {
      return this.pruefung;
    }

    this.geprueftFuer = nutzerId;

    if (!nutzerId) {
      // Ohne Sitzung gibt es niemanden, der Betreiber sein koennte.
      this.pruefung = Promise.resolve(false);
      this.operator.set(false);
      return this.pruefung;
    }

    this.pruefung = this.frage();
    return this.pruefung;
  }

  private async aktuelleNutzerId(): Promise<string | null> {
    const { data } = await this.supabase.client.auth.getSession();
    return data.session?.user.id ?? null;
  }

  private async frage(): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc('is_platform_operator');
    const istBetreiber = !error && data === true;
    this.operator.set(istBetreiber);
    return istBetreiber;
  }
}

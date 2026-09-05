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
  private check: Promise<boolean> | null = null;

  /**
   * Nutzerkennung, fuer die `check` gilt - `null` bedeutet "keine Sitzung".
   *
   * Ohne diese Bindung ueberlebte die Antwort einen Nutzerwechsel: Ein
   * Abmelden laeuft als reine Navigation ohne Neuladen, der Dienst bliebe
   * also bestehen und gaebe die Antwort des vorherigen Nutzers weiter. Statt
   * auf einen Aufruf wie `reset()` bei jedem kuenftigen Abmeldeweg zu setzen,
   * prueft `isOperator()` bei jedem Aufruf selbst, ob die zwischengespeicherte
   * Antwort noch zur aktuellen Sitzung gehoert.
   */
  private checkedFor: string | null = null;

  readonly operator = signal(false);

  async isOperator(): Promise<boolean> {
    const userId = await this.currentUserId();

    if (this.check && this.checkedFor === userId) {
      return this.check;
    }

    this.checkedFor = userId;

    if (!userId) {
      // Ohne Sitzung gibt es niemanden, der Betreiber sein koennte.
      this.check = Promise.resolve(false);
      this.operator.set(false);
      return this.check;
    }

    this.check = this.query();
    return this.check;
  }

  private async currentUserId(): Promise<string | null> {
    const { data } = await this.supabase.client.auth.getSession();
    return data.session?.user.id ?? null;
  }

  private async query(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.client.rpc('is_platform_operator');
      const isOperator = !error && data === true;
      this.operator.set(isOperator);
      return isOperator;
    } catch {
      // Eine abgelehnte Promise statt eines error-Objekts wuerde sonst
      // dauerhaft in `check` haengen bleiben: Jede kuenftige Navigation
      // nach /admin fuer denselben Nutzer wirft dann fuer den Rest der
      // Sitzung, ohne dass je neu gefragt wird. Deshalb wird der
      // Zwischenspeicher hier zurueckgesetzt, damit der naechste Aufruf neu
      // fragt.
      this.check = null;
      this.operator.set(false);
      return false;
    }
  }
}

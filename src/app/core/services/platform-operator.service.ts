import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
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
  private readonly auth = inject(AuthService);
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
  private readonly checkedFor = signal<string | null>(null);
  private readonly operatorResult = signal(false);

  // Der Menuepunkt verschwindet beim Abmelden sofort, auch bevor die naechste
  // asynchrone Betreiberpruefung beginnt.
  readonly operator = computed(
    () => this.auth.currentUser()?.id === this.checkedFor() && this.operatorResult(),
  );

  async isOperator(): Promise<boolean> {
    const userId = await this.currentUserId();

    if (this.check && this.checkedFor() === userId) {
      return this.check;
    }

    this.checkedFor.set(userId);

    if (!userId) {
      // Ohne Sitzung gibt es niemanden, der Betreiber sein koennte.
      this.check = Promise.resolve(false);
      this.operatorResult.set(false);
      return this.check;
    }

    this.operatorResult.set(false);
    this.check = this.query(userId);
    return this.check;
  }

  private async currentUserId(): Promise<string | null> {
    const { data } = await this.supabase.client.auth.getSession();
    return data.session?.user.id ?? null;
  }

  private async query(userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.client.rpc('is_platform_operator');
      const isOperator = !error && data === true;
      if (this.checkedFor() === userId) this.operatorResult.set(isOperator);
      return isOperator;
    } catch {
      // Eine abgelehnte Promise statt eines error-Objekts wuerde sonst
      // dauerhaft in `check` haengen bleiben: Jede kuenftige Navigation
      // nach /admin fuer denselben Nutzer wirft dann fuer den Rest der
      // Sitzung, ohne dass je neu gefragt wird. Deshalb wird der
      // Zwischenspeicher hier zurueckgesetzt, damit der naechste Aufruf neu
      // fragt.
      this.check = null;
      if (this.checkedFor() === userId) this.operatorResult.set(false);
      return false;
    }
  }
}

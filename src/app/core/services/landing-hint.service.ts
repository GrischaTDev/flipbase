import { DOCUMENT, Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Merk-Cookie fuer die Landingpage.
 *
 * Landingpage (flipbase.de) und App (app.flipbase.de) sind fuer den Browser
 * getrennte Herkuenfte - die Landingpage kann die Supabase-Sitzung also nicht
 * sehen. Sie traegt ausserdem bewusst kein JavaScript. Deshalb dieser Umweg:
 * Die App hinterlegt ein Cookie auf der gemeinsamen Domain, und Caddy wertet
 * es beim Ausliefern der Seite aus.
 *
 * Im Cookie steht ausschliesslich eine 1. Kein Token, keine Kennung - wer es
 * ausliest, erfaehrt nur, dass hier jemand angemeldet war.
 */
export const HINWEIS_COOKIE = 'flipbase_angemeldet';

/**
 * Laufzeit in Sekunden. Absichtlich **nicht** die 30-Tage-Timebox: Das
 * Cookie wird bei jeder Token-Erneuerung neu gesetzt (applySession() laeuft
 * dabei jedes Mal), die Laufzeit rutscht also staendig nach vorn - waehrend
 * die Timebox ab der Anmeldung zaehlt und nicht rutscht. Mit 30 Tagen wuerde
 * ein aktiver Nutzer ein Cookie tragen, das die eigentliche Sitzung um fast
 * 30 Tage ueberlebt. 7 Tage bilden stattdessen die ebenfalls gleitende
 * 7-Tage-Inaktivitaetsgrenze fast genau nach.
 */
export const HINWEIS_LAUFZEIT_SEKUNDEN = 7 * 24 * 60 * 60;

/** Baut die Cookie-Zeile fuer eine bestehende Anmeldung. */
export function anmeldeZeile(domain: string): string | null {
  if (!domain) return null;
  return (
    `${HINWEIS_COOKIE}=1; Domain=${domain}; Path=/; Secure; SameSite=Lax; ` +
    `Max-Age=${HINWEIS_LAUFZEIT_SEKUNDEN}`
  );
}

/**
 * Baut die Zeile, die das Cookie entfernt. Domain und Pfad muessen dabei
 * uebereinstimmen, sonst trifft der Browser das vorhandene Cookie nicht.
 */
export function abmeldeZeile(domain: string): string | null {
  if (!domain) return null;
  return `${HINWEIS_COOKIE}=; Domain=${domain}; Path=/; Secure; SameSite=Lax; Max-Age=0`;
}

@Injectable({
  providedIn: 'root',
})
export class LandingHintService {
  private readonly dokument = inject(DOCUMENT);
  private readonly domain = environment.landingHintCookieDomain;

  /** Hinterlegt den Hinweis. Ohne eingestellte Domain passiert nichts. */
  anmelden(): void {
    const zeile = anmeldeZeile(this.domain);
    if (zeile) this.dokument.cookie = zeile;
  }

  /** Entfernt den Hinweis. */
  abmelden(): void {
    const zeile = abmeldeZeile(this.domain);
    if (zeile) this.dokument.cookie = zeile;
  }
}

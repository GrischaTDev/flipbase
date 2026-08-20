import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Dringlichkeit eines Eintrags. */
export type LogStufe = 'debug' | 'info' | 'warn' | 'error';

export interface LogEintrag {
  readonly stufe: LogStufe;
  readonly meldung: string;
  readonly details: readonly unknown[];
  readonly zeitpunkt: string;
}

/** So viele Einträge werden vorgehalten. */
const PUFFER_GROESSE = 200;

/**
 * Zentrale Stelle für technische Protokollmeldungen.
 *
 * Was er heute leistet: Er bündelt die Ausgaben an einer Stelle und hält die
 * letzten Einträge im Speicher vor. `debug` und `info` erscheinen nur in der
 * Entwicklung; `warn` und `error` immer, weil sie sonst genau dann fehlen,
 * wenn man sie braucht.
 *
 * Was er ausdrücklich **nicht** leistet: Er verschickt nichts. Es gibt keine
 * Fehlerüberwachung im Hintergrund. Der Nutzen liegt darin, dass ein solcher
 * Versand später an genau einer Stelle nachrüstbar ist, statt an 29.
 *
 * Nicht zu verwechseln mit dem {@link SyncStatusService}: Der meldet dem
 * **Nutzer**, dass eine Speicherung fehlgeschlagen ist. Dieser Dienst
 * protokolliert für **Entwickler**. Ein fehlgeschlagener Schreibvorgang
 * gehört in beide.
 */
@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  /** Die jüngsten Einträge, neueste zuerst. Für eine Diagnoseansicht. */
  readonly eintraege = signal<readonly LogEintrag[]>([]);

  debug(meldung: string, ...details: unknown[]): void {
    this.schreibe('debug', meldung, details);
  }

  info(meldung: string, ...details: unknown[]): void {
    this.schreibe('info', meldung, details);
  }

  warn(meldung: string, ...details: unknown[]): void {
    this.schreibe('warn', meldung, details);
  }

  error(meldung: string, ...details: unknown[]): void {
    this.schreibe('error', meldung, details);
  }

  private schreibe(stufe: LogStufe, meldung: string, details: unknown[]): void {
    this.eintraege.update((bisher) =>
      [{ stufe, meldung, details, zeitpunkt: new Date().toISOString() }, ...bisher].slice(
        0,
        PUFFER_GROESSE,
      ),
    );

    // In der Produktion nur das, was auf ein Problem hinweist.
    if (environment.production && (stufe === 'debug' || stufe === 'info')) return;

    const ausgabe =
      stufe === 'error' ? console.error : stufe === 'warn' ? console.warn : console.log;
    ausgabe(meldung, ...details);
  }
}

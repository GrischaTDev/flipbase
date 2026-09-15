export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn?(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

const SENSITIVE_KEY_PATTERN = /cookie|token|auth|secret|key|password|session/i;

function redactValue(key: string, value: unknown): string {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }
  const str = String(value);
  if (str.length > 250) {
    return str.slice(0, 250) + '...';
  }
  return str;
}

/**
 * Eine Zeile je Ereignis, damit sich der Betrieb mit `grep` auswerten laesst.
 * Sensible Werte (Cookies, Tokens, Passwoerter) werden automatisch geschwaerzt.
 */
export function createLogger(sink: Pick<Console, 'log' | 'error'> = console): Logger {
  const line = (level: string, event: string, fields?: Record<string, unknown>): string => {
    const parts = Object.entries(fields ?? {}).map(
      ([key, value]) => `${key}=${redactValue(key, value)}`,
    );
    return [new Date().toISOString(), level, event, ...parts].join(' ');
  };

  return {
    info: (event, fields) => sink.log(line('info', event, fields)),
    warn: (event, fields) => sink.error(line('warn', event, fields)),
    error: (event, fields) => sink.error(line('error', event, fields)),
  };
}

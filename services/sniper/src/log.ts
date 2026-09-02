export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/**
 * Eine Zeile je Ereignis, damit sich der Betrieb mit `grep` auswerten laesst.
 * Geheimnisse gehoeren nie in `fields` - der Aufrufer entscheidet, was er uebergibt.
 */
export function createLogger(sink: Pick<Console, 'log' | 'error'> = console): Logger {
  const line = (level: string, event: string, fields?: Record<string, unknown>): string => {
    const parts = Object.entries(fields ?? {}).map(([key, value]) => `${key}=${String(value)}`);
    return [new Date().toISOString(), level, event, ...parts].join(' ');
  };

  return {
    info: (event, fields) => sink.log(line('info', event, fields)),
    error: (event, fields) => sink.error(line('error', event, fields)),
  };
}

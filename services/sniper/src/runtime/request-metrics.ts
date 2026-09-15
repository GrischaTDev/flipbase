import type { FetchLike } from '../vinted/session.js';
import type { ErrorKind } from '../vinted/errors.js';

export interface RequestMetricEvent {
  at: number;
  durationMs: number;
  status?: number;
  rejected: boolean;
  errorKind?: ErrorKind;
  urlPath: string;
  contentType?: string;
  contentLength?: number;
}

export interface MetricsSnapshot {
  requests: number;
  rejected: number;
  byKind: Record<ErrorKind, number>;
}

/** Das Zeitfenster zaehlt reale Versuche, differenziert nach Fehlerart und Dauer. */
export class RequestMetrics {
  private events: RequestMetricEvent[] = [];
  constructor(private readonly now: () => number = Date.now) {}

  wrap(fetchFn: FetchLike): FetchLike {
    return async (input, init) => {
      const start = this.now();
      const urlStr = typeof input === 'string' ? input : input.toString();
      let urlPath: string;
      try {
        urlPath = new URL(urlStr).pathname;
      } catch {
        urlPath = urlStr;
      }

      try {
        const response = await fetchFn(input, init);
        const durationMs = this.now() - start;
        const status = response.status;
        const rejected = status === 403 || status === 429;
        let errorKind: ErrorKind | undefined;

        if (status === 401) errorKind = 'unauthorized';
        else if (status === 403) errorKind = 'forbidden';
        else if (status === 429) errorKind = 'rate_limited';
        else if (status >= 500) errorKind = 'server_error';

        const rawLength = response.headers.get('content-length');
        const contentLength = rawLength ? parseInt(rawLength, 10) : undefined;
        const contentType = response.headers.get('content-type') ?? undefined;

        this.events.push({
          at: start,
          durationMs,
          status,
          rejected,
          errorKind,
          urlPath,
          contentType,
          contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
        });

        return response;
      } catch (error) {
        const durationMs = this.now() - start;
        const isTimeout =
          error instanceof Error &&
          (error.name === 'AbortError' ||
            error.name === 'TimeoutError' ||
            error.message.toLowerCase().includes('timeout'));

        this.events.push({
          at: start,
          durationMs,
          rejected: false,
          errorKind: isTimeout ? 'timeout' : 'network_error',
          urlPath,
        });
        throw error;
      }
    };
  }

  recordParserError(urlPath = '/catalog'): void {
    this.events.push({
      at: this.now(),
      durationMs: 0,
      rejected: false,
      errorKind: 'parser_error',
      urlPath,
    });
  }

  snapshot(): MetricsSnapshot {
    const cutoff = this.now() - 60_000;
    this.events = this.events.filter((event) => event.at > cutoff);

    const byKind: Record<ErrorKind, number> = {
      unauthorized: 0,
      forbidden: 0,
      rate_limited: 0,
      timeout: 0,
      server_error: 0,
      network_error: 0,
      parser_error: 0,
      http_error: 0,
    };

    let rejected = 0;
    for (const event of this.events) {
      if (event.rejected) rejected += 1;
      if (event.errorKind) {
        byKind[event.errorKind] = (byKind[event.errorKind] ?? 0) + 1;
      }
    }

    return {
      requests: this.events.length,
      rejected,
      byKind,
    };
  }
}

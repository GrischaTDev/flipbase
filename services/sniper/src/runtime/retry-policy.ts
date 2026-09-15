import type { QueryRunState, SniperQuery } from '../domain/query.js';
import {
  ForbiddenError,
  RateLimitedError,
  UnauthorizedError,
  VintedCollectorError,
  VintedParserError,
  VintedTimeoutError,
} from '../vinted/errors.js';

export interface OriginDecision {
  state: 'ready' | 'cooldown' | 'blocked';
  blockedUntil: Date | null;
  reason: string;
}

export interface RetryDecision {
  runState: QueryRunState;
  nextAttemptAt: Date | null;
  errorKind: string;
  errorMessage: string;
  consecutiveFailures: number;
  originUpdate?: OriginDecision;
}

const SERVER_ERROR_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 900_000] as const;

/**
 * Reine, vollstaendig mit injizierter Uhr testbare Fehlerpolitik.
 * Technische Fehler veraendern niemals das administrative Feld `is_active`.
 */
export function evaluateFailure(
  error: unknown,
  query: SniperQuery,
  now: Date = new Date(),
): RetryDecision {
  const failures = query.consecutiveFailures + 1;
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (error instanceof RateLimitedError) {
    let waitMs: number;
    if (typeof error.retryAfterSeconds === 'number' && error.retryAfterSeconds > 0) {
      waitMs = error.retryAfterSeconds * 1000;
    } else {
      // Exponentiell 60s, 120s, 240s... bis max 60 Minuten (3600s)
      const exponent = Math.min(Math.max(0, failures - 1), 6);
      waitMs = Math.min(60_000 * Math.pow(2, exponent), 3_600_000);
    }
    const nextAttemptAt = new Date(now.getTime() + waitMs);

    return {
      runState: 'cooldown',
      nextAttemptAt,
      errorKind: 'rate_limited',
      errorMessage: rawMessage,
      consecutiveFailures: failures,
      originUpdate: {
        state: 'cooldown',
        blockedUntil: nextAttemptAt,
        reason: 'rate_limited',
      },
    };
  }

  if (error instanceof ForbiddenError) {
    return {
      runState: 'blocked',
      nextAttemptAt: null,
      errorKind: 'forbidden',
      errorMessage: rawMessage,
      consecutiveFailures: failures,
      originUpdate: {
        state: 'blocked',
        blockedUntil: null,
        reason: 'forbidden',
      },
    };
  }

  if (error instanceof UnauthorizedError) {
    const nextAttemptAt = new Date(now.getTime() + 30_000);
    return {
      runState: 'cooldown',
      nextAttemptAt,
      errorKind: 'unauthorized',
      errorMessage: rawMessage,
      consecutiveFailures: failures,
    };
  }

  if (error instanceof VintedParserError) {
    const nextAttemptAt = new Date(now.getTime() + 300_000); // 5 Min
    return {
      runState: 'cooldown',
      nextAttemptAt,
      errorKind: 'parser_error',
      errorMessage: rawMessage,
      consecutiveFailures: failures,
    };
  }

  // Timeout, 5xx, Netzwerk- und allgemeine Fehler
  const delayIndex = Math.min(failures - 1, SERVER_ERROR_DELAYS_MS.length - 1);
  const waitMs = SERVER_ERROR_DELAYS_MS[Math.max(0, delayIndex)]!;
  const nextAttemptAt = new Date(now.getTime() + waitMs);

  let kind = 'server_error';
  if (error instanceof VintedTimeoutError) {
    kind = 'timeout';
  } else if (error instanceof VintedCollectorError) {
    kind = error.kind;
  } else if (error instanceof Error && error.message.toLowerCase().includes('timeout')) {
    kind = 'timeout';
  }

  return {
    runState: 'cooldown',
    nextAttemptAt,
    errorKind: kind,
    errorMessage: rawMessage,
    consecutiveFailures: failures,
  };
}

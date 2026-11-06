import { describe, expect, it } from 'vitest';
import {
  cloudIpStatus,
  feedBotStatus,
  marketplaceWorkerStatus,
  operationsStatus,
  parsePlatformSystemHealth,
  storageStatus,
  storageUsedPercent,
} from './platform-system-health';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const health = (overrides: Record<string, unknown> = {}) =>
  parsePlatformSystemHealth({
    checkedAt: minutesAgo(0),
    marketplaceWorker: { heartbeatAt: minutesAgo(1), expiresAt: minutesAgo(-1) },
    feedBot: {
      reportedAt: minutesAgo(1),
      requestsLastMinute: 40,
      rejectedLastMinute: 0,
      requestBudget: 60,
      lastCycleError: null,
      vintedLastSuccessAt: minutesAgo(1),
    },
    storage: { reportedAt: minutesAgo(2), totalBytes: 1000, usedBytes: 500 },
    operationsLastHour: { queued: 1, running: 0, succeeded: 10, failed: 0 },
    cloudIps: { enabled: 2, expiringSoon: 0, expired: 0 },
    ...overrides,
  });

describe('Systemzustand der Administration', () => {
  it('meldet einen gesunden Betrieb', () => {
    const current = health();
    expect(marketplaceWorkerStatus(current, NOW).label).toBe('Läuft');
    expect(feedBotStatus(current, NOW).label).toBe('Läuft');
    expect(storageStatus(current, NOW).label).toBe('Ausreichend');
    expect(storageUsedPercent(current)).toBe(50);
    expect(operationsStatus(current).label).toBe('Ohne Fehler');
    expect(cloudIpStatus(current).label).toBe('Bereit');
  });

  it('erkennt ausgefallene und nie gemeldete Dienste', () => {
    const silent = health({
      marketplaceWorker: { heartbeatAt: minutesAgo(4), expiresAt: minutesAgo(3) },
      feedBot: null,
      storage: null,
    });
    expect(marketplaceWorkerStatus(silent, NOW)).toEqual({
      label: 'Meldet sich nicht',
      tone: 'critical',
    });
    expect(feedBotStatus(silent, NOW).label).toBe('Keine Meldung');
    expect(storageStatus(silent, NOW).label).toBe('Keine Meldung');
  });

  it('zeigt Botfehler, knappen Speicher, Auftragsfehler und ablaufende IPs als Hinweis', () => {
    const strained = health({
      feedBot: { reportedAt: minutesAgo(0), lastCycleError: 'Vinted begrenzt die Anfragen' },
      storage: { reportedAt: minutesAgo(1), totalBytes: 1000, usedBytes: 905 },
      operationsLastHour: { succeeded: 2, failed: 1 },
      cloudIps: { enabled: 1, expiringSoon: 1, expired: 0 },
    });
    expect(feedBotStatus(strained, NOW).tone).toBe('caution');
    expect(storageStatus(strained, NOW).label).toBe('Fast voll');
    expect(operationsStatus(strained).label).toBe('Viele Fehler');
    expect(cloudIpStatus(strained).label).toBe('Läuft bald ab');
  });

  it('weist eine ungültige Antwort ab und ersetzt fehlende Zähler durch null', () => {
    expect(() => parsePlatformSystemHealth(null)).toThrow('Der Systemzustand ist ungültig.');
    const sparse = parsePlatformSystemHealth({ checkedAt: minutesAgo(0) });
    expect(sparse.operationsLastHour).toEqual({ queued: 0, running: 0, succeeded: 0, failed: 0 });
    expect(sparse.marketplaceWorker).toBeNull();
  });
});

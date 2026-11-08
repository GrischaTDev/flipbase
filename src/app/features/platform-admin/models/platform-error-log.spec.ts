import { describe, expect, it } from 'vitest';
import {
  parsePlatformErrorEvents,
  platformErrorAreaBySlug,
  platformErrorCodeLabel,
  platformErrorSourceLabel,
} from './platform-error-log';

describe('Fehlerprotokoll', () => {
  it('übersetzt Zeilen mit lesbaren Details und verwirft unbrauchbare Einträge', () => {
    const events = parsePlatformErrorEvents([
      {
        id: 7,
        occurredAt: '2026-11-06T15:26:12Z',
        severity: 'error',
        source: 'marketplace_operations',
        code: 'cleanup',
        message: null,
        accountLabel: 'Wiehen Store',
        workspaceName: 'Flipbase',
        userEmail: null,
        referenceId: '84eeb3be',
        detail: { authorization_kind: 'scheduled_read', stage: 'cleanup', nested: { a: 1 } },
      },
      { id: 'x', occurredAt: '2026-11-06T15:26:12Z', code: 'cleanup' },
      { id: 8, occurredAt: '', code: 'cleanup' },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].accountLabel).toBe('Wiehen Store');
    expect(events[0].detail).toEqual([
      { label: 'Auslöser', value: 'Automatik' },
      { label: 'Schritt', value: 'cleanup' },
    ]);
  });

  it('nennt bekannte Codes und Quellen auf Deutsch und lässt Unbekanntes stehen', () => {
    expect(platformErrorCodeLabel('retry_limit')).toBe('Automatik nach Fehlversuchen angehalten');
    expect(platformErrorCodeLabel('neuer_code')).toBe('neuer_code');
    expect(platformErrorSourceLabel('marketplace_sync_schedules')).toBe('Automatik');
  });

  it('ordnet Adressteile den Bereichen zu', () => {
    expect(platformErrorAreaBySlug('vinted-sync')?.area).toBe('vinted_sync');
    expect(platformErrorAreaBySlug('unbekannt')).toBeNull();
    expect(() => parsePlatformErrorEvents({})).toThrow();
  });

  it('zeigt Zeitpunkte in den Details deutsch formatiert', () => {
    const [event] = parsePlatformErrorEvents([
      {
        id: 1,
        occurredAt: '2026-11-07T06:41:02Z',
        code: 'network',
        detail: { retry_after: '2026-11-07T07:11:02Z' },
      },
    ]);
    expect(event.detail[0].label).toBe('Nächster Versuch');
    expect(event.detail[0].value).toMatch(/^07\.11\.2026, \d{2}:11:02$/);
  });
});

import { describe, expect, it } from 'vitest';
import { parseVintedLocalReadiness, presentVintedLocalReadiness } from './vinted-local-readiness';

const ready = {
  state: 'ready',
  workspaceId: '35000000-0000-4000-8000-000000000001',
  connectionId: '35000000-0000-4000-8000-000000000002',
  externalAccountId: '12345',
  checkedAt: '2026-10-06T10:00:00.000Z',
  version: '1.6.0',
};
describe('Lokale Vinted-Betriebsbereitschaft', () => {
  const account = {
    workspaceId: ready.workspaceId,
    connectionId: ready.connectionId,
    externalAccountId: ready.externalAccountId,
    status: 'connected' as const,
  };
  it('verwechselt ein anderes Profil nicht mit Bereitschaft', () => {
    expect(
      presentVintedLocalReadiness(
        account,
        { ...ready, state: 'ready', connectionId: '35000000-0000-4000-8000-000000000009' },
        false,
        true,
      ).label,
    ).toBe('In anderem Browserprofil verknüpft');
  });
  it('erhält die manuelle Pause vor einem alten positiven Status', () => {
    expect(
      presentVintedLocalReadiness(
        { ...account, status: 'paused' },
        { ...ready, state: 'ready' },
        false,
        true,
      ).label,
    ).toBe('Automatik pausiert');
  });
  it('zeigt die verbundene Erweiterung erst nach passender Bereitschaftsprüfung', () => {
    expect(
      presentVintedLocalReadiness(account, { ...ready, state: 'ready' }, false, true),
    ).toMatchObject({ label: 'Erweiterung verbunden', tone: 'success' });
    expect(presentVintedLocalReadiness(account, null, false, true).tone).not.toBe('success');
    expect(
      presentVintedLocalReadiness(account, { ...ready, state: 'ready' }, false, false).tone,
    ).not.toBe('success');
    expect(
      presentVintedLocalReadiness(account, { ...ready, state: 'paused' }, false, true),
    ).toMatchObject({ label: 'Automatik pausiert', tone: 'caution' });
  });
  it('zeigt eine laufende Prüfung ausdrücklich statt Bereitschaft', () => {
    expect(
      presentVintedLocalReadiness(account, { ...ready, state: 'ready' }, true, true).label,
    ).toBe('Verbindung wird geprüft');
  });
  it('bietet bei serverseitig getrennter Verbindung eine Erneuerung statt einer Prüfschleife', () => {
    expect(
      presentVintedLocalReadiness(
        { ...account, status: 'disconnected' },
        { ...ready, state: 'unavailable' },
        false,
        true,
      ).action,
    ).toBe('renew');
  });
  it('übernimmt ausschließlich öffentliche geprüfte Angaben', () => {
    expect(parseVintedLocalReadiness(ready)).toEqual(ready);
  });
  it('erlaubt ein freies Profil ohne Kontozuordnung', () => {
    expect(
      parseVintedLocalReadiness({
        ...ready,
        state: 'unbound',
        workspaceId: null,
        connectionId: null,
        externalAccountId: null,
      }),
    ).not.toBeNull();
  });
  it.each([
    { ...ready, token: 'private' },
    { ...ready, state: 'linked' },
    { ...ready, checkedAt: 'gestern' },
    { ...ready, workspaceId: '../wrong' },
    { ...ready, externalAccountId: '' },
    { ...ready, connectionId: null },
    { ...ready, version: '<script>' },
    null,
  ])('weist ungültige beziehungsweise geheime Angaben zurück', (candidate) => {
    expect(parseVintedLocalReadiness(candidate)).toBeNull();
  });
});

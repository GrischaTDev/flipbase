import { describe, expect, it } from 'vitest';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import {
  parseMarketplaceConnections,
  parseMarketplacePage,
  parseMarketplaceSnapshot,
} from './marketplace-response';

const scope = { workspaceId: 'fixture-workspace', connectionId: 'fixture-account-a' };
const emptyPage = () => ({ items: [], total: 0, nextCursor: null });
const snapshot = () => ({
  ...scope,
  profile: null,
  publications: emptyPage(),
  conversations: emptyPage(),
  sales: emptyPage(),
  activity: emptyPage(),
});
const entry = (body: object = {}) => ({ ...scope, id: 'entry-a', title: 'Schal', ...body });

describe('Marktplatz-Antworten', () => {
  it('übernimmt ausschließlich echte Konten des angefragten Workspaces', () => {
    const data = { canManage: true, connections: createMarketplaceFixtures().connections };
    const result = parseMarketplaceConnections(data, scope.workspaceId);
    expect(result.connections).toEqual(data.connections);
    expect(result.connections[0]).not.toBe(data.connections[0]);
    expect(result.canManage).toBe(true);
  });
  it('erfindet bei einer leeren Kontoliste keine Testkonten', () => {
    expect(
      parseMarketplaceConnections({ canManage: true, connections: [] }, scope.workspaceId)
        .connections,
    ).toEqual([]);
  });
  it('weist ein Konto aus einem fremden Workspace zurück', () => {
    const connections = createMarketplaceFixtures().connections;
    connections[1] = { ...connections[1], workspaceId: 'foreign' };
    expect(() =>
      parseMarketplaceConnections({ canManage: true, connections }, scope.workspaceId),
    ).toThrow();
  });
  it('weist doppelte Konto-IDs und unbekannte Verbindungszustände zurück', () => {
    const connection = createMarketplaceFixtures().connections[0];
    expect(() =>
      parseMarketplaceConnections(
        { canManage: true, connections: [connection, connection] },
        scope.workspaceId,
      ),
    ).toThrow();
    expect(() =>
      parseMarketplaceConnections(
        { canManage: true, connections: [{ ...connection, status: 'pretend_connected' }] },
        scope.workspaceId,
      ),
    ).toThrow();
  });
  it('akzeptiert keinen erfundenen Berechtigungswert', () => {
    expect(() =>
      parseMarketplaceConnections({ canManage: 'true', connections: [] }, scope.workspaceId),
    ).toThrow();
  });
  it('liest einen kontogebundenen leeren Snapshot ohne Kennzahlen zu erfinden', () => {
    expect(parseMarketplaceSnapshot(snapshot(), scope)).toEqual(snapshot());
  });
  it('prüft den Kontobezug auch in verschachtelten Datensätzen', () => {
    const data = snapshot();
    expect(() =>
      parseMarketplaceSnapshot(
        {
          ...data,
          publications: {
            ...emptyPage(),
            total: 1,
            items: [entry({ connectionId: 'fixture-account-b' })],
          },
        },
        scope,
      ),
    ).toThrow();
    expect(() =>
      parseMarketplaceSnapshot(
        { ...data, profile: { ...scope, connectionId: 'fixture-account-b' } },
        scope,
      ),
    ).toThrow();
  });
  it('unterscheidet fehlende Kennzahlen ausdrücklich von gemessenen Nullen', () => {
    const result = parseMarketplacePage(
      {
        items: [
          entry(),
          entry({
            id: 'entry-b',
            metrics: { views: 0, favorites: 0, observedAt: '2026-09-26T00:00:00Z' },
          }),
        ],
        total: 2,
        nextCursor: null,
      },
      scope,
    );
    expect(result.items[0].metrics).toEqual({ views: null, favorites: null, observedAt: null });
    expect(result.items[1].metrics.views).toBe(0);
    expect(result.items[1].metrics.favorites).toBe(0);
  });
  it('erhält serverseitige Gesamtzahl und Cursor statt aus 50 Zeilen zu zählen', () => {
    const result = parseMarketplacePage(
      { items: [entry()], total: 61, nextCursor: 'entry-a' },
      scope,
    );
    expect(result.total).toBe(61);
    expect(result.nextCursor).toBe('entry-a');
  });
  it('weist beschädigte Pagination zurück', () => {
    for (const data of [
      { items: [], total: -1, nextCursor: null },
      { items: [entry()], total: 0, nextCursor: null },
      { items: [], total: 3, nextCursor: 10 },
    ]) {
      expect(() => parseMarketplacePage(data, scope)).toThrow();
    }
  });
  it('zeigt weder unsichere Bildadressen noch ungültige Zahlen oder Zeitstempel', () => {
    const result = parseMarketplacePage(
      {
        items: [
          entry({
            imageUrl: 'javascript:alert(1)',
            price: -1,
            occurredAt: 'invalid',
            metrics: { views: -8 },
          }),
        ],
        total: 1,
        nextCursor: null,
      },
      scope,
    );
    expect(result.items[0]).toMatchObject({ imageUrl: null, price: null, occurredAt: null });
    expect(result.items[0].metrics.views).toBeNull();
  });
  it('erhält Nachrichtentext und prüft die Gesprächszuordnung', () => {
    const message = entry({
      conversationId: 'conversation-a',
      text: '  Hallo\nWelt  ',
      direction: 'outbound',
    });
    expect(
      parseMarketplacePage(
        { items: [message], total: 1, nextCursor: null },
        scope,
        'conversation-a',
      ).items[0].text,
    ).toBe('  Hallo\nWelt  ');
    expect(() =>
      parseMarketplacePage(
        { items: [message], total: 1, nextCursor: null },
        scope,
        'conversation-b',
      ),
    ).toThrow();
  });
});

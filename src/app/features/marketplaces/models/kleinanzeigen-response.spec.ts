import {
  parseKleinanzeigenAccounts,
  parseKleinanzeigenPublicationPage,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
import { describe, it, expect } from 'vitest';
import { parseKleinanzeigenBinding, parseKleinanzeigenProposal } from './kleinanzeigen-response';
const workspace = '49000000-0000-4000-8000-000000000011';
const binding = {
  workspaceId: workspace,
  connectionId: '9007199254740993',
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  status: 'needs_login',
  generation: 1,
  expiresAt: '2026-10-17T06:00:00Z',
  canPublish: false,
};
const proposal = {
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  installationId: '49000000-0000-4000-8000-000000000031',
  tokenHash: 'a'.repeat(64),
  nonce: '49000000-0000-4000-8000-000000000041',
};
describe('Kleinanzeigen-Antworten', () => {
  it('bewahrt große Konto-IDs exakt und friert die öffentliche Antwort ein', () => {
    const result = parseKleinanzeigenBinding(binding, workspace);
    expect(result?.connectionId).toBe('9007199254740993');
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([
    { ...binding, workspaceId: '49000000-0000-4000-8000-000000000012' },
    { ...binding, connectionId: 9007199254740992 },
    { ...binding, connectionId: '9223372036854775808' },
    { ...binding, connectionId: '01' },
    { ...binding, secret: 'private' },
    { ...binding, tokenHash: 'a'.repeat(64) },
    { ...binding, generation: 0 },
    { ...binding, expiresAt: 'morgen' },
    { ...binding, accountType: 'pro' },
    { ...binding, status: 'active' },
    { ...binding, displayName: '\n' },
    { ...binding, canPublish: 'false' },
  ])('weist ungültige oder geheime Bindungsdaten ab', (value) =>
    expect(parseKleinanzeigenBinding(value, workspace)).toBeNull(),
  );
  it('prüft bei einer konkreten Kontoanfrage auch die Verbindungskennung', () =>
    expect(parseKleinanzeigenBinding(binding, workspace, '2')).toBeNull());
  it('gibt nur den Hash und die öffentliche Identität als Verbindungsvorschlag frei', () => {
    expect(parseKleinanzeigenProposal(proposal)).toEqual(proposal);
    expect(Object.isFrozen(parseKleinanzeigenProposal(proposal))).toBe(true);
  });
  it.each([
    { ...proposal, secret: 'private' },
    { ...proposal, installationId: 'invalid' },
    { ...proposal, tokenHash: 'bad' },
    { ...proposal, nonce: 'bad' },
    { ...proposal, accountType: 'unknown' },
    { ...proposal, externalAccountId: '001' },
  ])('weist unvollständige Verbindungsvorschläge ab', (value) =>
    expect(parseKleinanzeigenProposal(value)).toBeNull(),
  );
});

const preview = {
  workspaceId: workspace,
  connectionId: '9007199254740993',
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  status: 'connected',
  lastSyncedAt: '2026-10-16T06:00:00Z',
  listingCount: 2,
  activeCount: null,
  quota: { used: 8, observedAt: '2026-10-16T06:00:00Z', source: 'account_settings' },
  localGrant: { active: true, canPublish: false, generation: 1, expiresAt: '2026-10-17T06:00:00Z' },
  sync: null,
};
const page = {
  workspaceId: workspace,
  connectionId: preview.connectionId,
  snapshotAt: '2026-10-16T06:00:00Z',
  items: [
    {
      publicationId: '9007199254740995',
      externalId: '101',
      title: 'Testanzeige',
      url: 'https://www.kleinanzeigen.de/s-anzeige/test/101-160-1',
      state: 'active',
      available: true,
      publishedAt: null,
      observedAt: '2026-10-16T06:00:00Z',
    },
  ],
  total: 2,
  nextId: '9007199254740995',
  completeness: 'complete',
};
describe('Kleinanzeigen-Kontovorschau', () => {
  it('trennt bestätigten Bestand, unbekannte Aktivanzahl und offiziellen Zähler', () => {
    const result = parseKleinanzeigenAccounts(
      { workspaceId: workspace, canManage: true, accounts: [preview] },
      workspace,
    );
    expect(result?.accounts[0].quota?.used).toBe(8);
    expect(result?.accounts[0].listingCount).toBe(2);
    expect(result?.accounts[0].activeCount).toBeNull();
    expect(result?.accounts[0].connectionId).toBe(preview.connectionId);
  });
  it.each([
    { ...preview, workspaceId: 'other' },
    { ...preview, connectionId: 9007199254740992 },
    { ...preview, tokenHash: 'private' },
    { ...preview, quota: { ...preview.quota, source: 'active_listings' } },
    { ...preview, localGrant: { ...preview.localGrant, secret: 'private' } },
    { ...preview, listingCount: -1 },
  ])('weist fremde, geheime und unbestätigte Vorschauwerte ab', (account) =>
    expect(
      parseKleinanzeigenAccounts(
        { workspaceId: workspace, canManage: true, accounts: [account] },
        workspace,
      ),
    ).toBeNull(),
  );
  it('zeigt ohne Rechte keine versehentlich mitgelieferten Konten', () =>
    expect(
      parseKleinanzeigenAccounts(
        { workspaceId: workspace, canManage: false, accounts: [preview] },
        workspace,
      ),
    ).toBeNull());
  it('akzeptiert ein noch nicht vollständig synchronisiertes Konto mit unbekannten Zahlen', () =>
    expect(
      parseKleinanzeigenAccounts(
        {
          workspaceId: workspace,
          canManage: true,
          accounts: [
            {
              ...preview,
              lastSyncedAt: null,
              listingCount: null,
              activeCount: null,
              quota: null,
              localGrant: null,
            },
          ],
        },
        workspace,
      )?.accounts[0].listingCount,
    ).toBeNull());
});
describe('Kleinanzeigen-Inseratseiten', () => {
  it('bewahrt große Inseratkennungen und unbekannte Veröffentlichungszeit', () => {
    const result = parseKleinanzeigenPublicationPage(page, preview, 25);
    expect(result?.items[0].publicationId).toBe('9007199254740995');
    expect(result?.items[0].publishedAt).toBeNull();
    expect(result?.nextId).toBe('9007199254740995');
  });
  it.each([
    { ...page, workspaceId: 'other' },
    { ...page, connectionId: '2' },
    { ...page, snapshotAt: null },
    { ...page, items: [{ ...page.items[0], url: 'https://evil.example' }] },
    { ...page, items: [page.items[0], page.items[0]] },
    { ...page, items: [{ ...page.items[0], publicationId: 9007199254740992 }] },
    { ...page, total: null },
  ])('weist fremde oder unvollständige bestätigte Seiten ab', (value) =>
    expect(parseKleinanzeigenPublicationPage(value, preview, 25)).toBeNull(),
  );
});

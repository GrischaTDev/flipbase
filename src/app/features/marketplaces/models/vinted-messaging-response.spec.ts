import { describe, expect, it } from 'vitest';
import {
  parseLocalMessageList,
  parseLocalMessageEnqueue,
  parseMarketplaceMessagePermission,
} from './vinted-messaging-response';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const message = {
  id: '00000000-0000-4000-8000-000000000001',
  requestId: '00000000-0000-4000-8000-000000000002',
  conversationId: '00000000-0000-4000-8000-000000000003',
  text: 'Hallo',
  state: 'queued',
  createdAt: '2026-10-05T10:00:00Z',
  updatedAt: '2026-10-05T10:00:00Z',
  externalMessageId: null,
  errorCode: null,
  attachment: null,
};
describe('Lokale Versandantworten', () => {
  it('weist unbekannte oder unbestätigte Versandfreigaben zurück', () => {
    for (const permission of [
      { executionMode: 'cloud', allowed: true, authorizationVersion: 0 },
      { executionMode: 'proxy', allowed: true, authorizationVersion: 1 },
      { executionMode: 'cloud', allowed: true, authorizationVersion: 1.5 },
      { executionMode: 'cloud', allowed: 'yes', authorizationVersion: 1 },
      { executionMode: 'cloud', allowed: true, authorizationVersion: 1, secret: 'x' },
    ])
      expect(() => parseMarketplaceMessagePermission(permission)).toThrow();
    expect(
      parseMarketplaceMessagePermission({
        executionMode: 'cloud',
        allowed: true,
        authorizationVersion: 1,
      }).allowed,
    ).toBe(true);
  });
  it('erhält wartende Nachrichten ohne einen Versand zu behaupten', () => {
    expect(
      parseLocalMessageEnqueue(
        { ok: true, ...scope, message },
        scope,
        message.conversationId,
        message.requestId,
      ).state,
    ).toBe('queued');
    expect(
      parseLocalMessageList(
        { ok: true, ...scope, messages: [message] },
        scope,
        message.conversationId,
      ),
    ).toEqual([message]);
  });
  it('weist fremde Konten, Gespräche und nicht bestätigte Erfolge zurück', () => {
    for (const changed of [
      { connectionId: 'other' },
      { messages: [{ ...message, conversationId: '00000000-0000-4000-8000-000000000004' }] },
      { messages: [{ ...message, state: 'sent' }] },
    ])
      expect(() =>
        parseLocalMessageList(
          { ok: true, ...scope, messages: [message], ...changed },
          scope,
          message.conversationId,
        ),
      ).toThrow();
  });
  it('verwirft doppelte IDs, Geheimnisse und unbekannte Zustände', () => {
    for (const messages of [
      [message, message],
      [{ ...message, state: 'probably_sent' }],
      [{ ...message, attachment: { name: 'a.jpg', mimeType: 'image/jpeg', base64: 'secret' } }],
    ])
      expect(() =>
        parseLocalMessageList({ ok: true, ...scope, messages }, scope, message.conversationId),
      ).toThrow();
  });
  it('lässt unbekannten Versand ausdrücklich unbekannt', () => {
    expect(
      parseLocalMessageList(
        {
          ok: true,
          ...scope,
          messages: [{ ...message, state: 'outcome_unknown', errorCode: 'confirmation_missing' }],
        },
        scope,
        message.conversationId,
      )[0].state,
    ).toBe('outcome_unknown');
  });
});

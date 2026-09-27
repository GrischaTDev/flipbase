import { describe, expect, it } from 'vitest';
import { parseMarketplaceTestSession } from './marketplace-test-session';

const scope = {
  workspaceId: '25500000-0000-4000-8000-000000000011',
  connectionId: '25500000-0000-4000-8000-000000000021',
};
const response = {
  ...scope,
  id: '25500000-0000-4000-8000-000000000031',
  state: 'active',
  expiresAt: '2026-09-27T10:00:00Z',
  interactionCount: 0,
};

describe('Künstliche Marktplatzsitzung', () => {
  it('übernimmt nur den bestätigten Kontobezug und den Testzustand', () => {
    expect(parseMarketplaceTestSession(response, scope)).toEqual(response);
  });

  it('verwirft eine Antwort aus einem anderen Konto oder Workspace', () => {
    expect(() =>
      parseMarketplaceTestSession({ ...response, connectionId: 'other' }, scope),
    ).toThrow();
    expect(() =>
      parseMarketplaceTestSession({ ...response, workspaceId: 'other' }, scope),
    ).toThrow();
  });

  it('verwirft eine verspätete Antwort für eine andere Sitzung', () => {
    expect(() =>
      parseMarketplaceTestSession(response, scope, '25500000-0000-4000-8000-000000000032'),
    ).toThrow();
  });

  it('verwirft unbekannte Zustände, Zähler und Fristen', () => {
    expect(() => parseMarketplaceTestSession({ ...response, state: 'connected' }, scope)).toThrow();
    expect(() =>
      parseMarketplaceTestSession({ ...response, interactionCount: -1 }, scope),
    ).toThrow();
    expect(() => parseMarketplaceTestSession({ ...response, expiresAt: 'soon' }, scope)).toThrow();
  });

  it('verwirft Anbieter-URLs und geheime Felder statt sie im Browser zu behalten', () => {
    expect(() =>
      parseMarketplaceTestSession(
        { ...response, providerUrl: 'https://provider.example/test' },
        scope,
      ),
    ).toThrow();
    expect(() => parseMarketplaceTestSession({ ...response, token: 'secret' }, scope)).toThrow();
  });

  it('akzeptiert ausschließlich einen booleschen Aktionsnachweis', () => {
    expect(parseMarketplaceTestSession({ ...response, accepted: true }, scope).accepted).toBe(true);
    expect(() => parseMarketplaceTestSession({ ...response, accepted: 'yes' }, scope)).toThrow();
  });
});

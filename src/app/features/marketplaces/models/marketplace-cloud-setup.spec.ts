import { describe, expect, it } from 'vitest';
import { parseCloudSetupResult, parseCloudSetupView } from './marketplace-cloud-setup';

const setup = {
  workspaceId: '25500000-0000-4000-8000-000000000011',
  connectionId: '25500000-0000-4000-8000-000000000021',
  setupId: '25500000-0000-4000-8000-000000000031',
  state: 'reserved',
  sessionId: null,
};
describe('Cloud-Einrichtungsantwort', () => {
  it('unterscheidet fehlenden Bestand vom reservierten Konto', () => {
    expect(parseCloudSetupResult({ status: 'no_capacity' }, setup)).toEqual({
      status: 'no_capacity',
    });
    expect(parseCloudSetupResult({ status: 'ready', setup }, setup)).toEqual({
      status: 'ready',
      setup,
    });
  });
  it('verwirft fremde Konten und geheime Zusatzfelder', () => {
    expect(() => parseCloudSetupView({ ...setup, connectionId: setup.setupId }, setup)).toThrow();
    expect(() => parseCloudSetupView({ ...setup, networkId: 'private' }, setup)).toThrow();
    expect(() =>
      parseCloudSetupResult({ status: 'no_capacity', password: 'private' }, setup),
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { presentVintedCloudStatus } from './marketplace-presentation';

describe('Schild eines Vinted-Cloud-Kontos', () => {
  it('zeigt ohne Abrufstörung den Verbindungsstatus', () => {
    expect(presentVintedCloudStatus('connected', null)).toEqual({
      label: 'Verbunden',
      tone: 'success',
    });
    expect(presentVintedCloudStatus('connected', { enabled: true, pausedReason: null })).toEqual({
      label: 'Verbunden',
      tone: 'success',
    });
    // Eine bewusst pausierte Automatik ist keine Störung.
    expect(
      presentVintedCloudStatus('connected', { enabled: false, pausedReason: null }).label,
    ).toBe('Verbunden');
  });

  it('zeigt bei gestörtem Abruf den schlechteren Zustand', () => {
    expect(
      presentVintedCloudStatus('connected', { enabled: false, pausedReason: 'needs_login' }),
    ).toEqual({ label: 'Anmeldung erforderlich', tone: 'critical' });
    expect(
      presentVintedCloudStatus('connected', { enabled: true, pausedReason: 'needs_login' }),
    ).toEqual({ label: 'Abruf wartet', tone: 'caution' });
    expect(
      presentVintedCloudStatus('connected', { enabled: false, pausedReason: 'challenge' }).label,
    ).toBe('Prüfung erforderlich');
    expect(
      presentVintedCloudStatus('connected', { enabled: false, pausedReason: 'forbidden' }).label,
    ).toBe('Abruf abgelehnt');
    expect(
      presentVintedCloudStatus('connected', { enabled: false, pausedReason: 'retry_limit' }).label,
    ).toBe('Abruf angehalten');
    expect(
      presentVintedCloudStatus('connected', { enabled: true, pausedReason: 'network' }),
    ).toEqual({ label: 'Abruf wartet', tone: 'caution' });
  });

  it('lässt einen nicht verbundenen Status unverändert', () => {
    expect(
      presentVintedCloudStatus('paused', { enabled: false, pausedReason: 'needs_login' }).label,
    ).toBe('Pausiert');
    expect(presentVintedCloudStatus('needs_login', null).label).toBe('Anmeldung ausstehend');
  });
});

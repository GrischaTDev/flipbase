import { describe, expect, it } from 'vitest';
import {
  KLEINANZEIGEN_WORKSPACE_NAVIGATION,
  isKleinanzeigenNavigationActive,
  isKleinanzeigenWorkspaceRoute,
} from './kleinanzeigen-workspace-navigation';

describe('Kleinanzeigen-Navigation', () => {
  it('bietet die vier wesentlichen Bereiche als eigene Seiten', () => {
    expect(KLEINANZEIGEN_WORKSPACE_NAVIGATION.map((item) => item.label)).toEqual([
      'Übersicht',
      'Inserate',
      'Postfach',
      'Kontoverbindung',
    ]);
    expect(new Set(KLEINANZEIGEN_WORKSPACE_NAVIGATION.map((item) => item.path)).size).toBe(4);
  });
  it('trennt den Kleinanzeigen-Bereich von anderen Plattformen und ähnlich benannten Pfaden', () => {
    expect(isKleinanzeigenWorkspaceRoute('/marketplaces/kleinanzeigen?account=9')).toBe(true);
    expect(isKleinanzeigenWorkspaceRoute('/marketplaces/kleinanzeigen/inbox#messages')).toBe(true);
    expect(isKleinanzeigenWorkspaceRoute('/marketplaces/kleinanzeigen-other')).toBe(false);
    expect(isKleinanzeigenWorkspaceRoute('/marketplaces/ebay/listings')).toBe(false);
    expect(
      isKleinanzeigenNavigationActive(
        '/marketplaces/kleinanzeigen/overview',
        '/marketplaces/kleinanzeigen',
      ),
    ).toBe(true);
    expect(
      isKleinanzeigenNavigationActive(
        '/marketplaces/kleinanzeigen/listings',
        '/marketplaces/kleinanzeigen/overview',
      ),
    ).toBe(false);
  });
});

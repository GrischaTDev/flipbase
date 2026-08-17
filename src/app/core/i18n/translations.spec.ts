import { describe, it, expect } from 'vitest';
import { TRANSLATIONS_DE, TRANSLATIONS_EN, SyncTranslateLoader } from './translations';
import { firstValueFrom } from 'rxjs';

describe('i18n Translations', () => {
  it('should provide SyncTranslateLoader returning German and English translations', async () => {
    const loader = new SyncTranslateLoader();
    const de = await firstValueFrom(loader.getTranslation('de'));
    const en = await firstValueFrom(loader.getTranslation('en'));

    expect(de).toBe(TRANSLATIONS_DE);
    expect(en).toBe(TRANSLATIONS_EN);
  });

  it('should have matching top-level keys between DE and EN dictionaries', () => {
    const deKeys = Object.keys(TRANSLATIONS_DE).sort();
    const enKeys = Object.keys(TRANSLATIONS_EN).sort();

    expect(deKeys).toEqual(enKeys);
  });

  it('should include all main navigation items in NAV', () => {
    const expectedNavKeys = [
      'DASHBOARD',
      'PURCHASES',
      'INVENTORY',
      'STORE',
      'RESEARCH',
      'DEAL_CALCULATOR',
      'LISTINGS',
      'SALES',
      'FULFILLMENT',
      'ACCOUNTING',
      'SOURCES_SUPPLIERS',
      'ANALYTICS',
      'SETTINGS',
    ];

    expectedNavKeys.forEach((key) => {
      expect(TRANSLATIONS_DE.NAV).toHaveProperty(key);
      expect(TRANSLATIONS_EN.NAV).toHaveProperty(key);
    });
  });

  it('should include direct platform lookup keys for dynamic pipes', () => {
    const platforms = ['ebay', 'kleinanzeigen', 'vinted', 'custom_store'];
    platforms.forEach((p) => {
      expect(TRANSLATIONS_DE).toHaveProperty(p);
      expect(TRANSLATIONS_EN).toHaveProperty(p);
    });
  });
});

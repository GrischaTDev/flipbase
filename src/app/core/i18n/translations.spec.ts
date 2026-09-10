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

  // Der Vergleich der obersten Ebene reicht nicht: Elf Schluessel im
  // AUTH-Block fehlten monatelang auf Englisch, weil AUTH selbst ja in
  // beiden Sprachen vorhanden war. Fehlt ein Schluessel, zeigt ngx-translate
  // den Schluesselnamen an - ein englischer Nutzer las woertlich
  // "AUTH.ACCEPT_TERMS" neben dem Haken.
  it('should have matching keys at every depth, not just the top level', () => {
    const collectPaths = (value: object, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, entry]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return entry !== null && typeof entry === 'object'
          ? collectPaths(entry as object, path)
          : [path];
      });

    const dePaths = collectPaths(TRANSLATIONS_DE).sort();
    const enPaths = collectPaths(TRANSLATIONS_EN).sort();

    expect(enPaths.filter((path) => !dePaths.includes(path))).toEqual([]);
    expect(dePaths.filter((path) => !enPaths.includes(path))).toEqual([]);
  });

  // Ein leerer Text ist so unbrauchbar wie ein fehlender, faellt aber durch
  // den Pfadvergleich oben durch.
  it('should have no empty translation values', () => {
    const collectEmpty = (value: object, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, entry]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (entry !== null && typeof entry === 'object') {
          return collectEmpty(entry as object, path);
        }
        return typeof entry === 'string' && entry.trim() === '' ? [path] : [];
      });

    expect(collectEmpty(TRANSLATIONS_DE)).toEqual([]);
    expect(collectEmpty(TRANSLATIONS_EN)).toEqual([]);
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
      'SELLERS',
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

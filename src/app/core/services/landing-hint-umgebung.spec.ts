import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Die CI schreibt src/environments/environment.ts beim Bauen komplett neu
 * (.github/workflows/ci.yml). Ein Feld, das nur im Repo gepflegt wird, fehlt
 * deshalb im Produktions-Abbild - lokal funktioniert alles, live nichts, und
 * niemand sieht warum. Dieser Test haelt beide Stellen zusammen.
 */
const wurzel = process.cwd();

function lies(pfad: string): string {
  return readFileSync(join(wurzel, pfad), 'utf-8');
}

describe('Umgebungsfeld landingHintCookieDomain', () => {
  it('steht in beiden Umgebungsdateien', () => {
    expect(lies('src/environments/environment.ts')).toContain('landingHintCookieDomain');
    expect(lies('src/environments/environment.development.ts')).toContain(
      'landingHintCookieDomain',
    );
  });

  it('setzt in der Entwicklung keine Domain', () => {
    expect(lies('src/environments/environment.development.ts')).toMatch(
      /landingHintCookieDomain:\s*''/,
    );
  });

  it('die Produktionsumgebung traegt die echte Domain', () => {
    expect(lies('src/environments/environment.ts')).toMatch(
      /landingHintCookieDomain:\s*'\.flipbase\.de'/,
    );
  });

  it('die CI schreibt das Feld mit der echten Domain in das Abbild', () => {
    expect(lies('.github/workflows/ci.yml')).toMatch(/landingHintCookieDomain:\s*'\.flipbase\.de'/);
  });
});

describe('Umgebungsfeld landingUrl', () => {
  it('steht in beiden Umgebungsdateien', () => {
    expect(lies('src/environments/environment.ts')).toContain('landingUrl');
    expect(lies('src/environments/environment.development.ts')).toContain('landingUrl');
  });

  it('verweist auf die Landingpage', () => {
    expect(lies('src/environments/environment.development.ts')).toMatch(
      /landingUrl:\s*'https:\/\/flipbase\.de'/,
    );
    expect(lies('src/environments/environment.ts')).toMatch(
      /landingUrl:\s*'https:\/\/flipbase\.de'/,
    );
  });

  it('die CI schreibt das Feld in das Abbild', () => {
    expect(lies('.github/workflows/ci.yml')).toMatch(/landingUrl:\s*'https:\/\/flipbase\.de'/);
  });
});

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

  it('die CI schreibt das Feld mit der echten Domain in das Abbild', () => {
    expect(lies('.github/workflows/ci.yml')).toMatch(/landingHintCookieDomain:\s*'\.flipbase\.de'/);
  });
});

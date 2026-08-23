import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * supabase.auth.signOut() verwendet als Vorgabe den Bereich "global" - ein
 * Aufruf ohne Angabe beendet also jede Sitzung auf jedem Geraet. Genau das
 * tat der Knopf "Abmelden" im Kopfbereich, ohne es anzukuendigen.
 *
 * Ein Verhaltenstest dafuer wuerde den halben AuthService nachbauen
 * (Supabase-Client, Router, Mock-Store). Diese Pruefung liest stattdessen die
 * Quelle: Sie faellt zuverlaessig aus, wenn jemand den Bereich wieder
 * entfernt - und darum geht es hier.
 */
const quelle = readFileSync(
  join(process.cwd(), 'src', 'app', 'core', 'services', 'auth.service.ts'),
  'utf-8',
);

describe('Reichweite des Abmeldens', () => {
  it('kein Aufruf von signOut ohne ausdruecklichen Bereich', () => {
    expect(quelle).not.toMatch(/auth\.signOut\(\s*\)/);
  });

  it('der Bereich wird ueberhaupt uebergeben', () => {
    expect(quelle).toContain('scope: bereich');
  });

  it('das normale Abmelden betrifft nur diesen Browser', () => {
    expect(quelle).toContain('async signOut()');
    expect(quelle).toContain("beendeSitzung('local')");
  });

  it('fuer alle Geraete gibt es einen eigenen, benannten Weg', () => {
    expect(quelle).toContain('async abmeldenUeberall()');
    expect(quelle).toContain("beendeSitzung('global')");
  });

  it('der Anmeldezustand wird an allen drei Stellen ans Cookie gemeldet', () => {
    expect(quelle).toContain('landingHint.anmelden()');
    // Einmal beim Beenden der Sitzung, einmal wenn Supabase null meldet.
    expect(quelle.match(/landingHint\.abmelden\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

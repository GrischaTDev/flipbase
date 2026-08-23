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

/**
 * Schneidet den Rumpf einer privaten Methode aus der Quelle, damit die
 * Pruefungen nicht irgendwo in der Datei - etwa an einer Aufrufstelle wie
 * "this.applySession(...)" - zufaellig fuendig werden, sondern wirklich an
 * der Definition der Methode ansetzen.
 */
function methode(name: string): string {
  const kopf = quelle.match(new RegExp(`private\\s+(?:async\\s+)?${name}\\s*\\([^)]*\\)[^{]*\\{`));
  if (!kopf || kopf.index === undefined) return '';
  const start = kopf.index + kopf[0].length;
  const rest = quelle.slice(start);
  const ende = rest.indexOf('\n  }\n');
  return ende === -1 ? rest : rest.slice(0, ende);
}

describe('Reichweite des Abmeldens', () => {
  it('kein Aufruf von signOut ohne ausdruecklichen Bereich', () => {
    expect(quelle).not.toMatch(/auth\.signOut\(\s*(undefined\s*)?\)/);
  });

  it('der Bereich wird beim Beenden der Sitzung tatsaechlich uebergeben', () => {
    expect(methode('beendeSitzung')).toContain('scope: bereich');
  });

  it('das normale Abmelden betrifft nur diesen Browser', () => {
    expect(quelle).toContain('async signOut()');
    expect(quelle).toContain("beendeSitzung('local')");
  });

  it('fuer alle Geraete gibt es einen eigenen, benannten Weg', () => {
    expect(quelle).toContain('async abmeldenUeberall()');
    expect(quelle).toContain("beendeSitzung('global')");
  });

  it('eine wiederhergestellte Sitzung meldet sich am Cookie an', () => {
    expect(methode('applySession')).toContain('landingHint.anmelden()');
  });

  it('das Beenden der Sitzung raeumt das Cookie auf', () => {
    expect(methode('beendeSitzung')).toContain('landingHint.abmelden()');
  });

  it('ein Ablauf oder ein Abmelden in einem anderen Tab raeumt das Cookie auf', () => {
    expect(methode('watchAuthState')).toContain('landingHint.abmelden()');
  });
});

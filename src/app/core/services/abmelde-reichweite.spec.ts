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
  if (!kopf || kopf.index === undefined) {
    throw new Error(`Methode "${name}" nicht in auth.service.ts gefunden - umbenannt?`);
  }
  const start = kopf.index + kopf[0].length;
  const rest = quelle.slice(start);
  const ende = rest.indexOf('\n  }\n');
  // Ohne gefundenes Ende gaebe es sonst den Rest der ganzen Datei zurueck -
  // eine Pruefung darauf koennte aus dem falschen Grund durchgehen.
  if (ende === -1) {
    throw new Error(`Ende von Methode "${name}" nicht gefunden - Ausschnitt waere unbegrenzt.`);
  }
  return rest.slice(0, ende);
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

  // Dass das Cookie beim Sitzungsende wieder verschwindet, prueft
  // auth.service.spec.ts am laufenden Dienst statt an der Quelle: Der Aufruf
  // ist inzwischen in leereSitzungsdaten() zusammengefasst, und eine
  // Textsuche in beendeSitzung bzw. watchAuthState wuerde beim naechsten
  // Umbau erneut brechen, ohne dass sich am Verhalten etwas aendert.
});

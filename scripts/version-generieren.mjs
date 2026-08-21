/**
 * Erzeugt src/app/core/version.ts aus package.json und dem Git-Stand.
 *
 * Laeuft bei jedem Build und bei jedem Start, damit die Anzeige in der
 * Seitenleiste nie von Hand nachgezogen werden muss. Die Versionsnummer
 * kommt aus package.json und wird bei einer Veroeffentlichung gesetzt; der
 * Kurz-Hash daneben wechselt bei jedem Commit von selbst und sagt genau,
 * welcher Stand gerade laeuft.
 *
 * Die erzeugte Datei gehoert nicht ins Repository - sonst haette jeder Build
 * eine Aenderung im Arbeitsverzeichnis zur Folge.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Fragt Git und faellt still zurueck, wo es kein Git gibt (etwa im Container). */
function ausGit(befehl, ersatz) {
  try {
    return execSync(befehl, { cwd: wurzel, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return ersatz;
  }
}

const paket = JSON.parse(readFileSync(join(wurzel, 'package.json'), 'utf8'));
const commit = ausGit('git rev-parse --short HEAD', 'ohne-git');
const stand = ausGit('git log -1 --format=%cs', new Date().toISOString().slice(0, 10));

const inhalt = `/**
 * Erzeugt von scripts/version-generieren.mjs - nicht von Hand aendern.
 * Die Datei steht in .gitignore und entsteht bei jedem Build neu.
 */
export const VERSION = {
  /** Aus package.json - wird bei einer Veroeffentlichung hochgezaehlt. */
  nummer: '${paket.version}',
  /** Kurz-Hash des Commits, auf dem dieser Stand gebaut wurde. */
  commit: '${commit}',
  /** Datum dieses Commits (ISO 8601). */
  stand: '${stand}',
} as const;
`;

const ziel = join(wurzel, 'src', 'app', 'core', 'version.ts');
mkdirSync(dirname(ziel), { recursive: true });
writeFileSync(ziel, inhalt, 'utf8');
console.log(`Version geschrieben: v${paket.version} (${commit}, ${stand})`);

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
 *
 * Im Container gibt es kein Git: `.git` steht in `.dockerignore`, und das
 * soll auch so bleiben. Deshalb haben die Umgebungsvariablen FLIPBASE_COMMIT
 * und FLIPBASE_COMMIT_DATE Vorrang - die Abspielliste reicht sie beim Bauen
 * des Abbilds herein. Fehlen sie und fehlt Git, bleibt ein sprechender
 * Platzhalter stehen, statt dass der Build abbricht.
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
const nummer =
  (
    process.env.GITVERSION_MAJOR_MINOR_PATCH ||
    process.env.GITVERSION_SEMVER ||
    process.env.FLIPBASE_VERSION ||
    ''
  ).trim() || paket.version;
const commit =
  (process.env.FLIPBASE_COMMIT || '').trim().slice(0, 7) ||
  ausGit('git rev-parse --short HEAD', 'unbekannt');
const stand =
  (process.env.FLIPBASE_COMMIT_DATE || '').trim() ||
  ausGit('git log -1 --format=%cs', new Date().toISOString().slice(0, 10));

const inhalt = `/**
 * Erzeugt von scripts/generate-version.mjs - nicht von Hand aendern.
 * Die Datei steht in .gitignore und entsteht bei jedem Build neu.
 */
export const VERSION = {
  /** Berechnete Version von GitVersion oder Fallback aus package.json. */
  nummer: '${nummer}',
  /** Kurz-Hash des Commits, auf dem dieser Stand gebaut wurde. */
  commit: '${commit}',
  /** Datum dieses Commits (ISO 8601). */
  stand: '${stand}',
} as const;
`;

const ziel = join(wurzel, 'src', 'app', 'core', 'version.ts');
mkdirSync(dirname(ziel), { recursive: true });
writeFileSync(ziel, inhalt, 'utf8');
console.log(`Version geschrieben: v${nummer} (${commit}, ${stand})`);

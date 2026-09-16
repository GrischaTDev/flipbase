import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const zeroSha = '0000000000000000000000000000000000000000';
const commitShaPattern = /^[0-9a-f]{40}$/i;

async function git(repository, arguments_) {
  return execFileAsync('git', arguments_, {
    cwd: repository,
    encoding: 'utf8',
  });
}

async function commitExists(repository, commit) {
  try {
    await git(repository, ['cat-file', '-e', `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function directParent(repository, headSha) {
  try {
    const { stdout } = await git(repository, ['rev-parse', '--verify', `${headSha}^`]);
    const parent = stdout.trim();
    return commitShaPattern.test(parent) ? parent : null;
  } catch {
    return null;
  }
}

/** Ermittelt die geänderten Pfade für den von GitHub vorgegebenen Vergleich. */
export async function detectChangedPaths({
  repository = process.cwd(),
  eventName,
  prBaseSha,
  pushBeforeSha,
  headSha,
}) {
  if (!commitShaPattern.test(headSha ?? '') || !(await commitExists(repository, headSha))) {
    throw new Error(`HEAD-Commit ist nicht auflösbar: ${headSha ?? '<leer>'}`);
  }

  let baseSha;
  if (eventName === 'pull_request') {
    baseSha = prBaseSha;
  } else if (eventName === 'push') {
    baseSha = pushBeforeSha;
  } else {
    return null;
  }

  if (!baseSha || baseSha === zeroSha) {
    baseSha = await directParent(repository, headSha);
    if (!baseSha) return null;
  }

  if (!commitShaPattern.test(baseSha) || !(await commitExists(repository, baseSha))) {
    throw new Error(`Vergleichscommit ist nicht auflösbar: ${baseSha}`);
  }

  const { stdout } = await git(repository, [
    'diff',
    '--name-only',
    '--no-renames',
    baseSha,
    headSha,
  ]);
  return stdout.split(/\r?\n/u).filter(Boolean);
}

const sharedValidationPaths = new Set([
  '.github/workflows/ci.yml',
  'package.json',
  'package-lock.json',
  'scripts/detect-supabase-changes.mjs',
  'scripts/detect-supabase-changes.test.mjs',
  'scripts/required-checks.mjs',
  'scripts/required-checks.test.mjs',
  'scripts/reuse-pr-checks.mjs',
  'scripts/reuse-pr-checks.test.mjs',
]);

const migrationDeploymentPaths = new Set([
  'deploy/deploy.sh',
  'deploy/apply-release-migrations.sh',
  'deploy/migration-backup.sh',
  'scripts/package-migrations.mjs',
  'scripts/package-migrations.test.mjs',
  'scripts/check-migration-changes.mjs',
  'scripts/check-migration-changes.test.mjs',
  'deploy/docker-compose.app.yml',
  'docker/Dockerfile',
  '.dockerignore',
  'scripts/deploy-script.test.mjs',
  'scripts/release-migrations.test.mjs',
  'scripts/migration-backup.test.mjs',
]);

function isDocumentationOnly(path) {
  return (
    (path.startsWith('docs/') || (!path.includes('/') && path.endsWith('.md'))) &&
    path !== 'AGENTS.md'
  );
}

function selectsPath(path, prefix) {
  return path.startsWith(prefix) || sharedValidationPaths.has(path);
}

export function classifyChanges(paths) {
  if (paths === null) {
    return { application: true, application_tests: true, supabase: true, sniper: true };
  }

  return {
    // Release-Auswahl unverändert lassen: darüber laufen auch SQL-Paket und Versionsprüfung.
    application: paths.some((path) => !isDocumentationOnly(path)),
    // Nur das eigenständige Dienstpaket ist sicher vom Frontend abgrenzbar.
    // Unbekannte oder gemischte Änderungen bleiben im vollständigen Prüfumfang.
    application_tests: paths.some(
      (path) => !isDocumentationOnly(path) && !path.startsWith('services/sniper/'),
    ),
    supabase: paths.some(
      (path) =>
        selectsPath(path, 'supabase/') ||
        migrationDeploymentPaths.has(path) ||
        path === 'scripts/db-test-fixture.test.mjs' ||
        path === 'scripts/prepare-db-tests.mjs',
    ),
    sniper: paths.some((path) => selectsPath(path, 'services/sniper/')),
  };
}

async function main() {
  const event = {
    eventName: process.env.EVENT_NAME,
    prBaseSha: process.env.PR_BASE_SHA,
    pushBeforeSha: process.env.PUSH_BEFORE_SHA,
    headSha: process.env.HEAD_SHA,
  };

  const changes = classifyChanges(await detectChangedPaths(event));

  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error('GITHUB_OUTPUT fehlt.');
  await appendFile(
    outputPath,
    `application=${changes.application}\nsupabase=${changes.supabase}\nsniper=${changes.sniper}\napplication_tests=${changes.application_tests}\n`,
    'utf8',
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

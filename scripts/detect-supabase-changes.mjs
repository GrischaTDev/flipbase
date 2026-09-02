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

/**
 * Meldet, ob sich unterhalb der angegebenen Pfade etwas geaendert hat.
 *
 * `paths` ist vorbelegt, damit alle bestehenden Aufrufer unveraendert
 * weiterlaufen; der Sniper-Auftrag reicht seinen eigenen Pfad herein. Ohne
 * diese Trennung liefe jede Pruefung bei jedem Push mit, auch wenn nur ein
 * Text im Frontend geaendert wurde.
 */
export async function detectSupabaseChanges({
  repository = process.cwd(),
  eventName,
  prBaseSha,
  pushBeforeSha,
  headSha,
  paths = ['supabase/'],
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
    return true;
  }

  if (!baseSha || baseSha === zeroSha) {
    baseSha = await directParent(repository, headSha);
    if (!baseSha) return true;
  }

  if (!commitShaPattern.test(baseSha) || !(await commitExists(repository, baseSha))) {
    throw new Error(`Vergleichscommit ist nicht auflösbar: ${baseSha}`);
  }

  const { stdout } = await git(repository, [
    'diff',
    '--name-only',
    baseSha,
    headSha,
    '--',
    ...paths,
  ]);
  return stdout.trim().length > 0;
}

async function main() {
  const event = {
    eventName: process.env.EVENT_NAME,
    prBaseSha: process.env.PR_BASE_SHA,
    pushBeforeSha: process.env.PUSH_BEFORE_SHA,
    headSha: process.env.HEAD_SHA,
  };

  const supabase = await detectSupabaseChanges({ ...event, paths: ['supabase/'] });
  const sniper = await detectSupabaseChanges({ ...event, paths: ['services/sniper/'] });

  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error('GITHUB_OUTPUT fehlt.');
  await appendFile(outputPath, `supabase=${supabase}\nsniper=${sniper}\n`, 'utf8');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

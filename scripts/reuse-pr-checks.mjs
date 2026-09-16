import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
// V2 belegt Prüfungen, nicht den davon unabhängigen Release-Schalter.
const scopes = ['application_tests', 'supabase', 'sniper'];
const shaPattern = /^[a-f0-9]{40}$/u;

async function git(cwd, ...args) {
  const { stdout } = await exec('git', args, { cwd, encoding: 'utf8', timeout: 10000 });
  return stdout.trim();
}

async function githubApi(path) {
  const { stdout } = await exec('gh', ['api', path], { encoding: 'utf8', timeout: 15000 });
  return JSON.parse(stdout);
}

// Nur der tatsächlich zusammengeführte PR darf Nachweise liefern. Ein direkter
// Push, Squash/Rebase oder Sammelpush fällt auf die regulären Prüfungen zurück.
export async function findReusableChecks({
  cwd = process.cwd(),
  eventName,
  repository,
  headSha,
  beforeSha,
  changes,
  api = githubApi,
}) {
  if (eventName !== 'push' || !shaPattern.test(headSha ?? '') || !shaPattern.test(beforeSha ?? ''))
    return null;
  if (scopes.some((scope) => typeof changes?.[scope] !== 'boolean')) return null;
  try {
    const parents = (await git(cwd, 'show', '-s', '--format=%P', headSha)).split(' ');
    if (parents.length !== 2 || parents[0] !== beforeSha) return null;
    const tree = await git(cwd, 'rev-parse', `${headSha}^{tree}`);
    const { workflow_runs: runs } = await api(
      `repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&status=success&head_sha=${parents[1]}&per_page=20`,
    );
    for (const run of runs) {
      if (
        run.event !== 'pull_request' ||
        run.status !== 'completed' ||
        run.conclusion !== 'success' ||
        run.path !== '.github/workflows/ci.yml' ||
        run.head_sha !== parents[1] ||
        run.head_repository?.full_name !== repository ||
        !Number.isSafeInteger(run.id)
      )
        continue;
      const { artifacts } = await api(
        `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`,
      );
      const matches = artifacts.some((artifact) => {
        const match = /^verified-tree-v2-([a-f0-9]{40})-([01]{3})$/u.exec(artifact.name ?? '');
        return (
          artifact.expired === false &&
          match?.[1] === tree &&
          scopes.every((scope, index) => !changes[scope] || match[2][index] === '1')
        );
      });
      if (matches) return run.id;
    }
  } catch {
    // GitHub-Ausfall oder fehlender/alter Nachweis ist kein Release-Blocker:
    // stattdessen wird wie bisher neu geprüft, niemals ungeprüft veröffentlicht.
    console.log('Kein verlässlicher PR-Nachweis verfügbar; reguläre Prüfungen laufen.');
  }
  return null;
}

async function main() {
  const changes = {};
  for (const scope of scopes) {
    const value = process.env[`${scope.toUpperCase()}_CHANGED`];
    if (value !== 'true' && value !== 'false') throw new Error(`Ungültiger Prüfumfang: ${scope}`);
    changes[scope] = value === 'true';
  }
  const headSha = process.env.GITHUB_SHA;
  if (!shaPattern.test(headSha ?? '')) throw new Error('Ungültiger Commit.');
  const tree = await git(process.cwd(), 'rev-parse', `${headSha}^{tree}`);
  const receiptName = `verified-tree-v2-${tree}-${scopes.map((scope) => Number(changes[scope])).join('')}`;
  const runId = await findReusableChecks({
    eventName: process.env.GITHUB_EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    headSha,
    beforeSha: process.env.PUSH_BEFORE_SHA,
    changes,
  });
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `tests_reused=${runId !== null}\nreceipt_name=${receiptName}\n`,
  );
  const summary =
    runId === null
      ? 'Reguläre Prüfungen: kein passender erfolgreicher PR-Nachweis.'
      : `PR-Prüfungen wiederverwendet: https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId} (identischer Dateistand und ausreichender Prüfumfang).`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

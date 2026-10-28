import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { detectChangedPaths } from './detect-supabase-changes.mjs';

const exec = promisify(execFile);

const workerRoot = 'services/marketplace-worker/';
const selectionPaths =
  /^(?:package(?:-lock)?\.json|\.github\/workflows\/(?:ci|marketplace-worker-image|marketplace-chromium-image)\.yml|scripts\/(?:marketplace-check-selection|run-marketplace-checks|marketplace-image-checks|marketplace-image-permissions|preflight|ci-checks)(?:\.test)?\.mjs)$/u;
const extensionPaths =
  /^(?:tools\/flipbase-extension\/|scripts\/(?:kleinanzeigen-|support\/kleinanzeigen-)|supabase\/functions\/(?:kleinanzeigen-|_shared\/(?:kleinanzeigen-|marketplace-local-extension)))/u;
const sharedWorkerInputs =
  /^(?:tools\/flipbase-extension\/vinted-(?:negotiation|listing)-runtime\.js|supabase\/functions\/_shared\/(?:marketplace-(?:message|inbox-event|negotiation|listing|profile)-contracts\.d\.ts|kleinanzeigen-listing-(?:validation\.mts|contracts\.ts)))$/u;
const imageCheckPath = 'scripts/check-marketplace-images.sh';
const deploymentPaths = /^deploy\/(?:.*chromium.*|docker-compose\.marketplace[^/]*)$/u;
const sessionPilotInputs =
  /^tools\/cloud-browser-pilot\/(?:proxy-forwarder|chrome-window-close)\.mjs$/u;

function isNativeBrowserTest(path) {
  // Der Chrome-Prozess-/Containerfall bleibt in der echten Session-Image-Prüfung.
  return (
    /^services\/marketplace-worker\/test\/browser\/.*\.browser\.test\.ts$/u.test(path) &&
    !path.endsWith('/chrome-session-stop.browser.test.ts')
  );
}

/** Importgraph mit gelöschten Pfaden, damit Entfernen einer Abhängigkeit Tests nicht abwählt. */
function nativeBrowserTests(paths, files) {
  const tests = Object.keys(files).filter(isNativeBrowserTest).sort();
  if (
    paths === null ||
    paths.some(
      (path) =>
        selectionPaths.test(path) ||
        /^services\/marketplace-worker\/(?:package(?:-lock)?\.json|tsconfig[^/]*\.json|test\/fixtures\/)/u.test(
          path,
        ),
    )
  )
    return tests;
  const available = new Set([...Object.keys(files), ...paths]);
  const reverse = new Map();
  for (const [file, content] of Object.entries(files)) {
    if (!/\.[cm]?[jt]s$/u.test(file)) continue;
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isStringLiteralLike(node) && node.text.startsWith('.')) {
        const base = posix.normalize(posix.join(posix.dirname(file), node.text));
        const dependency = [
          base,
          `${base}.ts`,
          `${base}.js`,
          `${base}/index.ts`,
          base.replace(/\.js$/u, '.ts'),
        ].find((candidate) => available.has(candidate));
        if (dependency) {
          if (!reverse.has(dependency)) reverse.set(dependency, new Set());
          reverse.get(dependency).add(file);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const reached = new Set(paths);
  for (const path of reached) for (const importer of reverse.get(path) ?? []) reached.add(importer);
  return tests.filter((path) => reached.has(path));
}

/** Reine Auswahlfunktion für CI, lokalen Vorabcheck und Gegenbeispiele. */
export function selectMarketplaceChecksFromFiles(paths, files) {
  const full =
    paths === null ||
    paths.some(
      (path) => selectionPaths.test(path) || path === imageCheckPath || path === '.dockerignore',
    );
  const selected = paths ?? [];
  const workerImageRequired =
    full ||
    selected.some(
      (path) =>
        sharedWorkerInputs.test(path) ||
        deploymentPaths.test(path) ||
        /^services\/marketplace-worker\/(?:Dockerfile$|package(?:-lock)?\.json$|tsconfig[^/]*\.json$|src\/|test-support\/)/u.test(
          path,
        ),
    );
  // Worker-/Brokerintegration benötigt dieselbe gebaute Session wie die Sandboxprüfung.
  const sessionImageRequired =
    workerImageRequired ||
    selected.some(
      (path) =>
        sessionPilotInputs.test(path) ||
        /^services\/marketplace-worker\/(?:\.dockerignore$|Dockerfile\.chromium-session$|runtime\/|test\/browser\/chrome-session-stop\.browser\.test\.ts$)/u.test(
          path,
        ),
    );
  return {
    extensionRequired: full || selected.some((path) => extensionPaths.test(path)),
    workerBrowserTests: nativeBrowserTests(paths, files),
    workerImageRequired,
    sessionImageRequired,
  };
}

export async function selectMarketplaceChecks(paths, { repository = process.cwd() } = {}) {
  const { stdout } = await exec(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repository, encoding: 'utf8' },
  );
  const pathsInTree = stdout
    .split('\0')
    .filter(
      (path) =>
        path &&
        (path.startsWith(workerRoot) ||
          path.startsWith('tools/flipbase-extension/') ||
          path.startsWith('supabase/functions/_shared/')),
    );
  const entries = await Promise.all(
    [...new Set(pathsInTree)].map(async (path) => {
      try {
        return [path, await readFile(resolve(repository, path), 'utf8')];
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    }),
  );
  return selectMarketplaceChecksFromFiles(paths, Object.fromEntries(entries.filter(Boolean)));
}

async function main() {
  const paths = await detectChangedPaths({
    eventName: process.env.EVENT_NAME,
    prBaseSha: process.env.PR_BASE_SHA,
    pushBeforeSha: process.env.PUSH_BEFORE_SHA,
    headSha: process.env.HEAD_SHA,
  });
  const plan = await selectMarketplaceChecks(paths);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT fehlt.');
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `marketplace_check_plan=${JSON.stringify(plan)}`,
      `extension_required=${plan.extensionRequired}`,
      `worker_browser_required=${plan.workerBrowserTests.length > 0}`,
      `worker_image_required=${plan.workerImageRequired}`,
      `session_image_required=${plan.sessionImageRequired}`,
      '',
    ].join('\n'),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

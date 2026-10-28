import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assertMarketplaceImageRunner } from './marketplace-image-checks.mjs';

const executeFile = promisify(execFile);
const profilePath = '/etc/apparmor.d/flipbase-worker-browser-ci';

function assertPolicyPath(path) {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    path === '/' ||
    resolve(path) !== path ||
    !/^\/[a-zA-Z0-9_./-]+$/u.test(path)
  )
    throw new Error('Ungültiger Pfad für das Workerbrowser-AppArmor-Profil.');
}

async function resolveWorkerBrowser(environment) {
  assertPolicyPath(environment.RUNNER_TEMP);
  assertPolicyPath(environment.PLAYWRIGHT_BROWSERS_PATH);
  const expectedRoot = join(environment.RUNNER_TEMP, 'flipbase-worker-browsers');
  if (environment.PLAYWRIGHT_BROWSERS_PATH !== expectedRoot)
    throw new Error('Workerbrowser benötigen den eigenen Ordner unter RUNNER_TEMP.');

  const runnerTemp = await realpath(environment.RUNNER_TEMP);
  const browserRoot = await realpath(expectedRoot);
  assertPolicyPath(runnerTemp);
  assertPolicyPath(browserRoot);
  if (
    !(await lstat(expectedRoot)).isDirectory() ||
    browserRoot !== join(runnerTemp, 'flipbase-worker-browsers')
  )
    throw new Error('Der Workerbrowser-Ordner darf kein abweichender oder verknüpfter Pfad sein.');

  const revisions = (await readdir(browserRoot, { withFileTypes: true })).filter((entry) =>
    entry.name.startsWith('chromium_headless_shell-'),
  );
  if (
    revisions.length !== 1 ||
    !revisions[0].isDirectory() ||
    !/^chromium_headless_shell-[1-9][0-9]*$/u.test(revisions[0].name)
  )
    throw new Error('Genau eine reguläre Worker-Headless-Shell-Installation ist erforderlich.');

  const executablePath = join(
    browserRoot,
    revisions[0].name,
    'chrome-headless-shell-linux64',
    'chrome-headless-shell',
  );
  const executable = await lstat(executablePath);
  if (
    !executable.isFile() ||
    (executable.mode & 0o111) === 0 ||
    (await realpath(executablePath)) !== executablePath
  )
    throw new Error('Die Worker-Headless-Shell muss eine unverknüpfte ausführbare Datei sein.');
  await access(executablePath, constants.X_OK);
  return { runnerTemp, executablePath };
}

async function readHostSetting(path, readHostFile) {
  try {
    return (await readHostFile(path, 'utf8')).trim();
  } catch (error) {
    if (error.code === 'ENOENT') return 'absent';
    throw error;
  }
}

/** Nur die Sandbox des installierten Workerbrowsers erhält auf dem Wegwerf-Runner Usernamespaces. */
export async function configureWorkerBrowserSandbox({
  environment = process.env,
  readHostFile = readFile,
  execute = executeFile,
  log = (entry) => console.log(JSON.stringify(entry)),
} = {}) {
  assertMarketplaceImageRunner(environment);
  const appArmorEnabled = await readHostSetting(
    '/sys/module/apparmor/parameters/enabled',
    readHostFile,
  );
  const restrictedUserNamespaces = await readHostSetting(
    '/proc/sys/kernel/apparmor_restrict_unprivileged_userns',
    readHostFile,
  );
  log({ event: 'worker_browser_sandbox', appArmorEnabled, restrictedUserNamespaces });
  if (
    !['Y', 'N', 'absent'].includes(appArmorEnabled) ||
    !['0', '1', 'absent'].includes(restrictedUserNamespaces)
  )
    throw new Error('Unbekannte AppArmor-Usernamespace-Konfiguration des Runners.');

  const { runnerTemp, executablePath } = await resolveWorkerBrowser(environment);
  if (appArmorEnabled !== 'Y' || restrictedUserNamespaces !== '1')
    return { configured: false, executablePath };

  const directory = await mkdtemp(join(runnerTemp, 'flipbase-worker-browser-policy-'));
  const source = join(directory, 'profile');
  try {
    await writeFile(
      source,
      `abi <abi/4.0>,\ninclude <tunables/global>\n\nprofile flipbase-worker-browser-ci "${executablePath}" flags=(unconfined) {\n  userns,\n}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    await execute(
      'sudo',
      [
        '--non-interactive',
        '--',
        'install',
        '--owner=root',
        '--group=root',
        '--mode=0644',
        '--',
        source,
        profilePath,
      ],
      { env: environment, encoding: 'utf8' },
    );
    await execute(
      'sudo',
      ['--non-interactive', '--', 'apparmor_parser', '--replace', profilePath],
      {
        env: environment,
        encoding: 'utf8',
      },
    );
    log({ event: 'worker_browser_sandbox_configured', executablePath, profilePath });
    return { configured: true, executablePath };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2)
      throw new Error('Der Workerbrowser-Setup benötigt keine Argumente.');
    await configureWorkerBrowserSandbox();
  } catch (error) {
    console.error(error.message);
    process.exitCode = Number.isInteger(error.code) && error.code > 0 ? error.code : 1;
  }
}

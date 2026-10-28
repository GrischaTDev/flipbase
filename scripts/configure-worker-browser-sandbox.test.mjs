import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { configureWorkerBrowserSandbox } from './configure-worker-browser-sandbox.mjs';

const executeFile = promisify(execFile);
const appArmorEnabledPath = '/sys/module/apparmor/parameters/enabled';
const userNamespaceRestrictionPath = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns';

// AppArmor und die geprüften Dateirechte gehören ausschließlich zum Linux-Runner.
// Die Ablehnung lokaler und ungeeigneter Hosts bleibt auf jeder Plattform geprüft.
const linuxTest = (name, run) =>
  test(
    name,
    { skip: process.platform !== 'linux' && 'AppArmor-Dateisystemvertrag gilt nur auf Linux.' },
    run,
  );

async function withSandboxFixture(run) {
  const runnerTemp = await mkdtemp(join(tmpdir(), 'flipbase-worker-sandbox-test-'));
  const browserRoot = join(runnerTemp, 'flipbase-worker-browsers');
  const revisionDirectory = join(browserRoot, 'chromium_headless_shell-1243');
  const executablePath = join(
    revisionDirectory,
    'chrome-headless-shell-linux64',
    'chrome-headless-shell',
  );
  await mkdir(dirname(executablePath), { recursive: true });
  await writeFile(executablePath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  for (const directory of ['chromium-1243', 'ffmpeg-1011', '.links'])
    await mkdir(join(browserRoot, directory));
  const environment = {
    GITHUB_ACTIONS: 'true',
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_OS: 'Linux',
    RUNNER_TEMP: runnerTemp,
    PLAYWRIGHT_BROWSERS_PATH: browserRoot,
  };
  const settings = new Map([
    [appArmorEnabledPath, 'Y\n'],
    [userNamespaceRestrictionPath, '1\n'],
  ]);
  const reads = [];
  const commands = [];
  const profiles = [];
  const logs = [];
  const options = {
    environment,
    readHostFile: async (path) => {
      reads.push(path);
      assert.ok(settings.has(path), `Unerwarteter Hostzugriff: ${path}`);
      const setting = settings.get(path);
      if (setting instanceof Error) throw setting;
      return setting;
    },
    execute: async (command, args) => {
      commands.push({ command, args });
      if (args.includes('install')) {
        const path = args.at(-2);
        profiles.push({ path, content: await readFile(path, 'utf8') });
      }
    },
    log: (entry) => logs.push(entry),
  };
  try {
    await run({
      runnerTemp,
      browserRoot,
      revisionDirectory,
      executablePath,
      environment,
      settings,
      reads,
      commands,
      profiles,
      logs,
      options,
    });
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
}

linuxTest(
  'lädt nur für die installierte Headless-Shell ein root-eigenes Usernamespace-Profil',
  async () => {
    await withSandboxFixture(
      async ({ executablePath, reads, commands, profiles, logs, options }) => {
        const result = await configureWorkerBrowserSandbox(options);
        assert.deepEqual(result, { configured: true, executablePath });
        assert.deepEqual(reads, [appArmorEnabledPath, userNamespaceRestrictionPath]);
        assert.deepEqual(logs[0], {
          event: 'worker_browser_sandbox',
          appArmorEnabled: 'Y',
          restrictedUserNamespaces: '1',
        });
        assert.equal(profiles.length, 1);
        assert.equal(
          profiles[0].content,
          `abi <abi/4.0>,\ninclude <tunables/global>\n\nprofile flipbase-worker-browser-ci "${executablePath}" flags=(unconfined) {\n  userns,\n}\n`,
        );
        assert.deepEqual(commands, [
          {
            command: 'sudo',
            args: [
              '--non-interactive',
              '--',
              'install',
              '--owner=root',
              '--group=root',
              '--mode=0644',
              '--',
              profiles[0].path,
              '/etc/apparmor.d/flipbase-worker-browser-ci',
            ],
          },
          {
            command: 'sudo',
            args: [
              '--non-interactive',
              '--',
              'apparmor_parser',
              '--replace',
              '/etc/apparmor.d/flipbase-worker-browser-ci',
            ],
          },
        ]);
        await assert.rejects(access(profiles[0].path), { code: 'ENOENT' });
      },
    );
  },
);

test('verweigert ungeeignete Runner vor Hostlesen und privilegierten Aufrufen', async () => {
  await withSandboxFixture(async ({ environment, reads, commands, options }) => {
    for (const rejected of [
      {},
      { CI: 'true' },
      { ...environment, GITHUB_ACTIONS: '' },
      { ...environment, RUNNER_ENVIRONMENT: 'self-hosted' },
      { ...environment, RUNNER_OS: 'Windows' },
      { ...environment, RUNNER_TEMP: '' },
      { ...environment, RUNNER_TEMP: 'relative' },
    ]) {
      await assert.rejects(
        configureWorkerBrowserSandbox({ ...options, environment: rejected }),
        /Vorabcheck unvollständig/u,
      );
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(commands, []);
  });
});

linuxTest('verändert ohne aktive AppArmor-Usernamespace-Sperre keine Hostpolicy', async () => {
  for (const [enabled, restricted] of [
    ['Y\n', '0\n'],
    ['N\n', '1\n'],
    [
      Object.assign(new Error('AppArmor fehlt'), { code: 'ENOENT' }),
      Object.assign(new Error('Usernamespace-Schalter fehlt'), { code: 'ENOENT' }),
    ],
  ]) {
    await withSandboxFixture(
      async ({ runnerTemp, executablePath, settings, commands, options }) => {
        settings.set(appArmorEnabledPath, enabled);
        settings.set(userNamespaceRestrictionPath, restricted);
        assert.deepEqual(await configureWorkerBrowserSandbox(options), {
          configured: false,
          executablePath,
        });
        assert.deepEqual(commands, []);
        assert.deepEqual(await readdir(runnerTemp), ['flipbase-worker-browsers']);
      },
    );
  }
});

linuxTest('unlesbare und unbekannte Kernelwerte verhindern jede Policyänderung', async () => {
  for (const setting of [
    [appArmorEnabledPath, 'maybe'],
    [userNamespaceRestrictionPath, '2'],
    [userNamespaceRestrictionPath, Object.assign(new Error('unlesbar'), { code: 'EACCES' })],
  ]) {
    await withSandboxFixture(async ({ settings, commands, options }) => {
      settings.set(...setting);
      await assert.rejects(configureWorkerBrowserSandbox(options));
      assert.deepEqual(commands, []);
    });
  }
});

linuxTest(
  'verlangt den ausdrücklichen dedizierten Browserordner ohne Policy-Metazeichen',
  async () => {
    await withSandboxFixture(async ({ environment, commands, options }) => {
      for (const browserPath of [
        undefined,
        'relative',
        '/tmp/shared-playwright',
        `${environment.PLAYWRIGHT_BROWSERS_PATH}/*`,
      ]) {
        await assert.rejects(
          configureWorkerBrowserSandbox({
            ...options,
            environment: { ...environment, PLAYWRIGHT_BROWSERS_PATH: browserPath },
          }),
        );
      }
      for (const suffix of ['[a]', '"', '\n', '{a,b}', '*']) {
        const runnerTemp = `${environment.RUNNER_TEMP}${suffix}`;
        await assert.rejects(
          configureWorkerBrowserSandbox({
            ...options,
            environment: {
              ...environment,
              RUNNER_TEMP: runnerTemp,
              PLAYWRIGHT_BROWSERS_PATH: join(runnerTemp, 'flipbase-worker-browsers'),
            },
          }),
          /Pfad/u,
        );
      }
      assert.deepEqual(commands, []);
    });
  },
);

linuxTest(
  'fehlende, mehrdeutige und unvollständige Headless-Shell-Installationen bleiben Fehler',
  async () => {
    for (const kind of [
      'missing-root',
      'missing-revision',
      'multiple-revisions',
      'missing-binary',
      'invalid-revision',
    ]) {
      await withSandboxFixture(
        async ({ browserRoot, revisionDirectory, executablePath, commands, options }) => {
          if (kind === 'missing-root') await rm(browserRoot, { recursive: true });
          if (kind === 'missing-revision') await rm(revisionDirectory, { recursive: true });
          if (kind === 'multiple-revisions')
            await mkdir(join(browserRoot, 'chromium_headless_shell-9999'));
          if (kind === 'missing-binary') await rm(executablePath);
          if (kind === 'invalid-revision')
            await rename(revisionDirectory, join(browserRoot, 'chromium_headless_shell-other'));
          await assert.rejects(configureWorkerBrowserSandbox(options), kind);
          assert.deepEqual(commands, []);
        },
      );
    }
  },
);

linuxTest('Browserroot, Revision, Binärordner und Binary dürfen keine Symlinks sein', async () => {
  for (const kind of ['root', 'revision', 'directory', 'binary']) {
    await withSandboxFixture(
      async ({ runnerTemp, browserRoot, revisionDirectory, executablePath, commands, options }) => {
        const path =
          kind === 'root'
            ? browserRoot
            : kind === 'revision'
              ? revisionDirectory
              : kind === 'directory'
                ? dirname(executablePath)
                : executablePath;
        const target = join(runnerTemp, 'detached');
        await rename(path, target);
        await symlink(target, path, kind === 'binary' ? 'file' : 'dir');
        await assert.rejects(configureWorkerBrowserSandbox(options), kind);
        assert.deepEqual(commands, []);
      },
    );
  }
});

linuxTest(
  'nichtreguläre und nichtausführbare Browserdateien erhalten keine Hostberechtigung',
  async () => {
    for (const kind of ['directory', 'not-executable']) {
      await withSandboxFixture(async ({ executablePath, commands, options }) => {
        if (kind === 'directory') {
          await rm(executablePath);
          await mkdir(executablePath);
        } else await chmod(executablePath, 0o600);
        await assert.rejects(configureWorkerBrowserSandbox(options), kind);
        assert.deepEqual(commands, []);
      });
    }
  },
);

linuxTest(
  'fehlende Hostwerkzeuge und Parserfehler werden ohne Fortsetzung weitergegeben',
  async () => {
    for (const failAt of [0, 1]) {
      await withSandboxFixture(async ({ runnerTemp, commands, options }) => {
        const failure = Object.assign(new Error(failAt === 0 ? 'sudo fehlt' : 'Profil abgelehnt'), {
          code: failAt === 0 ? 'ENOENT' : 23,
        });
        const execute = async (...args) => {
          await options.execute(...args);
          if (commands.length === failAt + 1) throw failure;
        };
        await assert.rejects(
          configureWorkerBrowserSandbox({ ...options, execute }),
          (error) => error === failure,
        );
        assert.equal(commands.length, failAt + 1);
        assert.deepEqual(await readdir(runnerTemp), ['flipbase-worker-browsers']);
      });
    }
  },
);

test('direkter lokaler CLI-Aufruf scheitert vor dem abgefangenen sudo-Befehl', async () => {
  await withSandboxFixture(async ({ runnerTemp }) => {
    const bin = join(runnerTemp, 'bin');
    const capture = join(runnerTemp, 'unexpected-host-command');
    await mkdir(bin);
    await writeFile(
      join(bin, 'sudo'),
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.CAPTURE, 'started');\n`,
      { mode: 0o755 },
    );
    const script = fileURLToPath(
      new URL('./configure-worker-browser-sandbox.mjs', import.meta.url),
    );
    await assert.rejects(
      executeFile(process.execPath, [script], {
        env: { CI: 'true', RUNNER_TEMP: runnerTemp, PATH: bin, CAPTURE: capture },
      }),
      (error) => error.code === 1 && /Vorabcheck unvollständig/u.test(error.stderr),
    );
    await assert.rejects(access(capture), { code: 'ENOENT' });
  });
});

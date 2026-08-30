import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultTimeoutMs = 15 * 60 * 1000;
const defaultTerminationGraceMs = 5000;
const defaultHelperTimeoutMs = 5000;

export async function resolveNpmCliPath(options = {}) {
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  const candidates = [
    env.npm_execpath,
    join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    env.APPDATA && join(env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(dirname(execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    env.npm_config_prefix &&
      join(env.npm_config_prefix, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {
      // Der nächste installationsübliche npm-Pfad wird geprüft.
    }
  }

  throw new Error(
    'npm-cli.js wurde nicht gefunden. Bitte Node.js inklusive npm installieren oder npm_execpath setzen.',
  );
}

async function createDefaultSuites() {
  const npmCliPath = await resolveNpmCliPath();
  const npmSuite = (label, script) => ({
    label,
    command: process.execPath,
    args: [npmCliPath, 'run', '--silent', script],
  });

  return [
    npmSuite('node', 'test:node'),
    npmSuite('dom', 'test:dom'),
    npmSuite('angular', 'test:angular'),
  ];
}

function parseTimeout(value) {
  if (value === undefined || value === '') return defaultTimeoutMs;
  const timeoutMs = Number(value);
  if (
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new Error('FLIPBASE_TEST_TIMEOUT_MS muss eine positive Ganzzahl bis 2147483647 sein.');
  }
  return timeoutMs;
}

function pipeWithLabel(source, destination, label) {
  let remainder = '';
  source.setEncoding('utf8');
  source.on('data', (chunk) => {
    const lines = `${remainder}${chunk}`.split(/\r?\n/);
    remainder = lines.pop() ?? '';
    for (const line of lines) destination.write(`[${label}] ${line}\n`);
  });
  source.on('end', () => {
    if (remainder) destination.write(`[${label}] ${remainder}\n`);
  });
}

function startSuite(suite, stdout, stderr, children, activeSuites, platform, spawnProcess) {
  let child;
  try {
    child = spawnProcess(suite.command, suite.args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: platform !== 'win32',
    });
  } catch (error) {
    stderr.write(`[${suite.label}] Start fehlgeschlagen: ${error.message}\n`);
    return Promise.resolve(1);
  }

  children.add(child);

  return new Promise((resolveSuite) => {
    let settled = false;
    const settleSuite = (exitCode) => {
      if (settled) return;
      settled = true;
      children.delete(child);
      activeSuites.delete(child);
      resolveSuite(exitCode);
    };

    pipeWithLabel(child.stdout, stdout, suite.label);
    pipeWithLabel(child.stderr, stderr, suite.label);
    activeSuites.set(child, {
      forceClose: () => {
        child.stdout.destroy();
        child.stderr.destroy();
        settleSuite(1);
      },
    });

    child.once('error', (error) => {
      stderr.write(`[${suite.label}] Start fehlgeschlagen: ${error.message}\n`);
      settleSuite(1);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      const exitCode = code ?? 1;
      const suffix = signal ? `, Signal ${signal}` : '';
      stdout.write(`[${suite.label}] beendet (Exitcode ${exitCode}${suffix})\n`);
      settleSuite(exitCode);
    });
  });
}

export function runCommandWithTimeout(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? defaultHelperTimeoutMs;
  return new Promise((resolveCommand) => {
    let stdout = '';
    let child;
    let settled = false;
    let timedOut = false;
    let timeout;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolveCommand(result);
    };
    try {
      child = spawn(command, args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
    } catch (error) {
      settle({ code: 1, error, stdout, timedOut: false });
      return;
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.once('error', (error) => settle({ code: 1, error, stdout, timedOut }));
    child.once('close', (code) => settle({ code: timedOut ? 1 : (code ?? 1), stdout, timedOut }));
    timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      child.stdout.destroy();
      child.unref();
      settle({ code: 1, stdout, timedOut: true });
    }, timeoutMs);
  });
}

function terminatePosixTarget(target, signal, force) {
  try {
    process.kill(-target.processGroupId, force ? 'SIGKILL' : signal);
  } catch {
    if (target.root.exitCode === null && target.root.signalCode === null) {
      target.root.kill(force ? 'SIGKILL' : signal);
    }
  }
}

export async function runSuites(suites, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const signalSource = options.signalSource ?? process;
  const platform = options.platform ?? process.platform;
  const commandRunner = options.commandRunner ?? runCommandWithTimeout;
  const spawnProcess = options.spawnProcess ?? spawn;
  const timeoutMs = parseTimeout(options.timeoutMs ?? process.env.FLIPBASE_TEST_TIMEOUT_MS);
  const terminationGraceMs = options.terminationGraceMs ?? defaultTerminationGraceMs;
  const helperTimeoutMs = options.helperTimeoutMs ?? defaultHelperTimeoutMs;
  const children = new Set();
  const activeSuites = new Map();
  let terminationExitCode = null;
  let terminationPromise;
  let forceTimer;

  const terminateAll = (signal, exitCode, message) => {
    if (terminationExitCode !== null) return;
    terminationExitCode = exitCode;
    stderr.write(`[runner] ${message}\n`);
    const roots = [...children];
    if (platform === 'win32') {
      terminationPromise = Promise.all(
        roots.map(async (root) => {
          let result;
          try {
            result = await commandRunner('taskkill.exe', ['/pid', String(root.pid), '/t', '/f'], {
              timeoutMs: helperTimeoutMs,
            });
          } catch (error) {
            result = { code: 1, error, timedOut: false };
          }
          if (result.code !== 0) {
            const reason = result.timedOut
              ? `Zeitlimit von ${helperTimeoutMs} ms überschritten`
              : `Exitcode ${result.code}`;
            stderr.write(
              `[runner] taskkill fehlgeschlagen (${reason}); Root wird direkt beendet.\n`,
            );
            if (root.exitCode === null && root.signalCode === null) root.kill('SIGKILL');
          }
          activeSuites.get(root)?.forceClose();
        }),
      );
    } else {
      const targets = roots.map((root) => ({ root, processGroupId: root.pid }));
      terminationPromise = (async () => {
        for (const target of targets) terminatePosixTarget(target, signal, false);
        await new Promise((resolveGracePeriod) => {
          forceTimer = setTimeout(resolveGracePeriod, terminationGraceMs);
        });
        stderr.write('[runner] Schonfrist abgelaufen; erzwungene Prozessbaum-Beendigung.\n');
        for (const target of targets) terminatePosixTarget(target, signal, true);
      })();
    }
  };
  const onSigint = () =>
    terminateAll('SIGINT', 130, 'SIGINT empfangen; Testprozesse werden beendet.');
  const onSigterm = () =>
    terminateAll('SIGTERM', 143, 'SIGTERM empfangen; Testprozesse werden beendet.');
  signalSource.on('SIGINT', onSigint);
  signalSource.on('SIGTERM', onSigterm);

  const timeout = setTimeout(
    () =>
      terminateAll(
        'SIGTERM',
        1,
        `Zeitlimit von ${timeoutMs} ms überschritten; Testprozesse werden beendet.`,
      ),
    timeoutMs,
  );
  timeout.unref();

  try {
    const exitCodes = await Promise.all(
      suites.map((suite) =>
        startSuite(suite, stdout, stderr, children, activeSuites, platform, spawnProcess),
      ),
    );
    if (terminationPromise) await terminationPromise;
    if (terminationExitCode !== null) return terminationExitCode;
    return exitCodes.every((exitCode) => exitCode === 0) ? 0 : 1;
  } finally {
    clearTimeout(timeout);
    if (forceTimer) clearTimeout(forceTimer);
    signalSource.off('SIGINT', onSigint);
    signalSource.off('SIGTERM', onSigterm);
  }
}

const entryPoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (entryPoint) {
  const additionalArguments = process.argv.slice(2);
  if (additionalArguments.length) {
    process.stderr.write(
      `Zusätzliche Argumente für npm test werden nicht unterstützt: ${additionalArguments.join(' ')}\n` +
        'Nutze stattdessen npm run test:node -- <Argumente>, npm run test:dom -- <Argumente> oder npm run test:angular -- <Argumente>.\n',
    );
    process.exitCode = 2;
  } else {
    try {
      process.exitCode = await runSuites(await createDefaultSuites());
    } catch (error) {
      process.stderr.write(`[runner] Start fehlgeschlagen: ${error.message}\n`);
      process.exitCode = 2;
    }
  }
}

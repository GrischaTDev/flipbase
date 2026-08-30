import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function npmSuite(label, script) {
  if (process.env.npm_execpath) {
    return {
      label,
      command: process.execPath,
      args: [process.env.npm_execpath, 'run', '--silent', script],
    };
  }

  return {
    label,
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', '--silent', script],
  };
}

const defaultSuites = [
  npmSuite('node', 'test:node'),
  npmSuite('dom', 'test:dom'),
  npmSuite('angular', 'test:angular'),
];

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

function runSuite(suite, stdout, stderr) {
  return new Promise((resolveSuite) => {
    const child = spawn(suite.command, suite.args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let settled = false;

    pipeWithLabel(child.stdout, stdout, suite.label);
    pipeWithLabel(child.stderr, stderr, suite.label);

    child.once('error', (error) => {
      stderr.write(`[${suite.label}] Start fehlgeschlagen: ${error.message}\n`);
      if (!settled) {
        settled = true;
        resolveSuite(1);
      }
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      const exitCode = code ?? 1;
      const suffix = signal ? `, Signal ${signal}` : '';
      stdout.write(`[${suite.label}] beendet (Exitcode ${exitCode}${suffix})\n`);
      resolveSuite(exitCode);
    });
  });
}

export async function runSuites(suites = defaultSuites, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const stderr = streams.stderr ?? process.stderr;
  const exitCodes = await Promise.all(suites.map((suite) => runSuite(suite, stdout, stderr)));
  return exitCodes.every((exitCode) => exitCode === 0) ? 0 : 1;
}

const entryPoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (entryPoint) process.exitCode = await runSuites();

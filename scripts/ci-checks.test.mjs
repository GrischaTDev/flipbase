import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { executeCheckCommand, getCheckCommands, runCiCheck } from './ci-checks.mjs';

test('übergibt Pfade und Metadaten wörtlich statt als Shellcode', async (t) => {
  const repository = await mkdtemp(join(tmpdir(), 'ci-command-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const literal = 'Pfad mit Leerzeichen; $(keinen-befehl-ausführen)';
  await executeCheckCommand(
    {
      name: 'Argumentgrenze prüfen',
      command: 'node',
      args: [
        '--input-type=module',
        '--eval',
        'import {writeFileSync} from "node:fs"; writeFileSync("arguments.json", JSON.stringify({args:process.argv.slice(1), value:process.env.TEST_VALUE}));',
        literal,
        '$GITHUB_SHA',
      ],
      env: { TEST_VALUE: literal },
    },
    { repository, commit: 'a'.repeat(40) },
  );
  assert.deepEqual(JSON.parse(await readFile(join(repository, 'arguments.json'), 'utf8')), {
    args: [literal, 'a'.repeat(40)],
    value: literal,
  });
});

test('bewahrt den echten Fehlercode und führt nach einem Fehler keine Folgeprüfung aus', async () => {
  await assert.rejects(
    executeCheckCommand({
      name: 'Absichtlich fehlschlagende Testfixture',
      command: 'node',
      args: ['--eval', 'process.exit(17)'],
    }),
    (error) => error.exitCode === 17,
  );
  const calls = [];
  await assert.rejects(
    runCiCheck('quality', {
      spawnProcess(command, args) {
        calls.push({ command, args });
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 23, null));
        return child;
      },
    }),
    (error) => error.exitCode === 23,
  );
  assert.equal(
    calls.length,
    1,
    'Ein Formatfehler darf keine nachfolgende Erfolgsmeldung erzeugen.',
  );
});

test('Quality entfernt geerbte PG-Verbindungen und aktiviert keine Release-Datenbankfixture', async () => {
  const environments = [];
  const environment = {
    PATH: process.env.PATH,
    PGDATABASE: 'flipbase_release_test',
    PGHOST: 'remote.invalid',
    PGSERVICE: 'external',
    PGPASSFILE: '/external/password',
    KEEP_VALUE: 'yes',
  };
  await runCiCheck('quality', {
    environment,
    spawnProcess(command, args, options) {
      environments.push(options.env);
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0, null));
      return child;
    },
  });
  assert.equal(environments.length, 5);
  for (const env of environments) {
    assert.equal(
      Object.keys(env).some((key) => /^PG/iu.test(key)),
      false,
    );
    assert.equal(env.KEEP_VALUE, 'yes');
  }
  assert.equal(environment.PGDATABASE, 'flipbase_release_test');
});

test('leichte Qualität bleibt ohne Workflowinfrastruktur; vollständige Qualitätsgruppe bleibt aufrufbar', () => {
  const lightweight = getCheckCommands('quality-light');
  assert.deepEqual(
    lightweight.map(({ args }) => args),
    [
      ['run', 'format:check'],
      ['run', 'lint'],
      ['run', 'typecheck'],
      ['run', 'test:audit'],
    ],
  );
  assert.deepEqual(
    getCheckCommands('workflow').map(({ args }) => args),
    [['run', 'test:workflow']],
  );
  assert.ok(getCheckCommands('quality').some(({ args }) => args.includes('test:workflow')));
});

test('getrennte Qualitäts- und Workflowgruppe entfernen geerbte Datenbankverbindungen', async () => {
  for (const group of ['quality-light', 'workflow']) {
    const calls = [];
    await runCiCheck(group, {
      environment: { PATH: process.env.PATH, PGHOST: 'external.invalid', KEEP_VALUE: 'yes' },
      spawnProcess(command, args, options) {
        calls.push(options.env);
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 0, null));
        return child;
      },
    });
    assert.ok(calls.length);
    for (const environment of calls) {
      assert.equal(environment.PGHOST, undefined);
      assert.equal(environment.KEEP_VALUE, 'yes');
    }
  }
});

test('Pfadvarianten werden eindeutig zusammengeführt und bewusste Befehlspfade haben Vorrang', async () => {
  for (const override of [undefined, { Path: 'command-tools' }, { PATH: 'command-tools' }]) {
    let actual;
    await executeCheckCommand(
      { name: 'Pfadvertrag', command: 'node', args: [], env: override },
      {
        environment: { Path: 'inherited-tools', OTHER_VALUE: 'unchanged' },
        spawnProcess(command, args, options) {
          actual = options.env;
          const child = new EventEmitter();
          queueMicrotask(() => child.emit('exit', 0, null));
          return child;
        },
      },
    );
    assert.deepEqual(
      Object.keys(actual).filter((key) => /^path$/iu.test(key)),
      ['PATH'],
    );
    assert.equal(
      actual.PATH,
      `${dirname(process.execPath)}${delimiter}${override ? 'command-tools' : 'inherited-tools'}`,
    );
    assert.equal(actual.OTHER_VALUE, 'unchanged');
  }
});

test('echter Kindprozess findet Git auch bei ausschließlich geerbtem Windows-Path', async () => {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^path$/iu.test(key)),
  );
  environment.Path = process.env.PATH ?? process.env.Path;
  await executeCheckCommand(
    {
      name: 'Git aus geerbtem Werkzeugpfad',
      command: 'node',
      args: [
        '--eval',
        'const {spawnSync}=require("node:child_process");const result=spawnSync("git",["--version"],{encoding:"utf8"});if(result.error)throw result.error;if(result.status!==0||!result.stdout.startsWith("git version "))process.exit(1);',
      ],
    },
    { environment },
  );
});

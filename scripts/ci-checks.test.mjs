import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { executeCheckCommand, runCiCheck } from './ci-checks.mjs';

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

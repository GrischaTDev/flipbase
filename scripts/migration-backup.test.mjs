import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

test(
  'Migrationsbackup verlangt Abzug, Verschluesselung und erfolgreiche Auslagerung',
  { skip: process.platform === 'win32' },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'release-backup-'));
    const bin = join(root, 'bin');
    const destination = join(root, 'backups');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'docker'),
      '#!/bin/bash\nprintf "Datenbank-Testinhalt"\nexit "${DUMP_STATUS:-0}"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, 'age'),
      '#!/bin/bash\ncat >/dev/null\nprintf "age-encryption.org/v1\\nverschluesselte Testdaten\\n"\nexit "${AGE_STATUS:-0}"\n',
      { mode: 0o755 },
    );
    writeFileSync(join(bin, 'rsync'), '#!/bin/bash\nexit "${OFFSITE_STATUS:-0}"\n', {
      mode: 0o755,
    });
    const recipient = join(root, 'recipient.pub');
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FLIPBASE_BACKUP_DIR: destination,
      FLIPBASE_BACKUP_RECIPIENT: recipient,
    };
    const run = (extra = {}) =>
      spawnSync('bash', [resolve('deploy/migration-backup.sh')], {
        env: { ...env, ...extra },
        encoding: 'utf8',
      });
    try {
      assert.notEqual(run().status, 0, 'Fehlender Schluessel');
      writeFileSync(recipient, 'oeffentlicher Testschluessel');
      for (const extra of [{ DUMP_STATUS: '42' }, { AGE_STATUS: '42' }]) {
        assert.notEqual(run(extra).status, 0);
        assert.deepEqual(
          readdirSync(destination),
          [],
          'Fehlgeschlagene Sicherung ist kein fertiges Backup',
        );
      }
      assert.notEqual(
        run({ OFFSITE_STATUS: '42' }).status,
        0,
        'Auslagerungsfehler darf keine Freigabe geben',
      );
      const success = run();
      assert.equal(success.status, 0, success.stderr);
      assert.ok(readdirSync(destination).every((name) => name.endsWith('.age')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

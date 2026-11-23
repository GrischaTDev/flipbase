import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { installWorkerLogArchive } from '../src/worker-log-archive.ts';

function withDirectory(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'worker-log-archive-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('kopiert stdout und stderr mit Zeitstempel in die Tagesdatei und behält die Ausgabe', () =>
  withDirectory((directory) => {
    let current = new Date('2026-11-23T08:00:00.000Z');
    const restore = installWorkerLogArchive({
      directory: join(directory, 'logs'),
      now: () => current,
    });
    try {
      process.stdout.write('{"event":"a"}\n');
      process.stderr.write(Buffer.from('zeile1\nzeile2\n'));
      current = new Date('2026-11-24T00:00:01.000Z');
      process.stdout.write('{"event":"b"}\n');
    } finally {
      restore();
    }
    const logs = join(directory, 'logs');
    assert.deepEqual(readdirSync(logs).sort(), ['worker-2026-11-23.log', 'worker-2026-11-24.log']);
    assert.equal(
      readFileSync(join(logs, 'worker-2026-11-23.log'), 'utf8'),
      '2026-11-23T08:00:00.000Z out {"event":"a"}\n' +
        '2026-11-23T08:00:00.000Z err zeile1\n' +
        '2026-11-23T08:00:00.000Z err zeile2\n',
    );
    assert.equal(
      readFileSync(join(logs, 'worker-2026-11-24.log'), 'utf8'),
      '2026-11-24T00:00:01.000Z out {"event":"b"}\n',
    );
  }));

test('löscht Tagesdateien nach 14 Tagen und die ältesten bei zu viel Platz, fremde Dateien nie', () =>
  withDirectory((directory) => {
    writeFileSync(join(directory, 'worker-2026-11-01.log'), 'alt\n');
    writeFileSync(join(directory, 'worker-2026-11-20.log'), 'x'.repeat(600));
    writeFileSync(join(directory, 'worker-2026-11-22.log'), 'y'.repeat(300));
    writeFileSync(join(directory, 'notizen.txt'), 'bleibt\n');
    const restore = installWorkerLogArchive({
      directory,
      now: () => new Date('2026-11-23T08:00:00.000Z'),
      maxTotalBytes: 800,
    });
    try {
      process.stdout.write('neu\n');
    } finally {
      restore();
    }
    assert.deepEqual(readdirSync(directory).sort(), [
      'notizen.txt',
      'worker-2026-11-22.log',
      'worker-2026-11-23.log',
    ]);
  }));

test('ein Dateifehler schaltet nur die Kopie ab, die Ausgabe läuft weiter', () =>
  withDirectory((directory) => {
    const blocked = join(directory, 'datei-statt-ordner');
    writeFileSync(blocked, '');
    const restore = installWorkerLogArchive({ directory: blocked });
    try {
      assert.equal(process.stdout.write(''), true);
      assert.doesNotThrow(() => process.stdout.write('läuft weiter\n'));
    } finally {
      restore();
    }
    assert.equal(readFileSync(blocked, 'utf8'), '');
  }));

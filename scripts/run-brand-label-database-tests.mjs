/** Ausschließlich neuer Wegwerf-Container. Keine Hostdatenbank, Volumes oder Release-Migrationen. */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const files = [
  'fixture.sql',
  '370_brand_labels.sql',
  'access-and-history.sql',
  '371_brand_label_content.sql',
  '371_brand_label_operations.sql',
  'content-and-operations.sql',
  '373_brand_label_read.sql',
  'reader-access.sql',
];
const name = `flipbase-label-test-${randomUUID()}`;
let started = false;
let assertions = 0;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Docker-Aufruf fehlgeschlagen (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

try {
  // --network none und fehlendes -p verhindern einen extern erreichbaren Testserver.
  docker([
    'run',
    '--detach',
    '--rm',
    '--network',
    'none',
    '--name',
    name,
    '--env',
    'POSTGRES_PASSWORD=label-test-only',
    '--env',
    'POSTGRES_DB=label_test',
    'postgres:17-alpine',
  ]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    // Der temporäre Initialisierungsserver akzeptiert nur Unix-Sockets.
    // TCP auf Loopback wird erst vom endgültigen Server angeboten.
    const probe = spawnSync(
      'docker',
      ['exec', name, 'pg_isready', '--host', '127.0.0.1', '-U', 'postgres', '-d', 'label_test'],
      { encoding: 'utf8', timeout: 5000 },
    );
    if (!probe.error && probe.status === 0) {
      ready = true;
      break;
    }
    await delay(500);
  }
  if (!ready) throw new Error('Der neue Testcontainer wurde nicht bereit.');
  console.log(docker(['exec', name, 'postgres', '--version']).stdout.trim());
  for (const file of files) {
    const input = await readFile(
      new URL(`../supabase/test-support/brand-label-candidate/${file}`, import.meta.url),
      'utf8',
    );
    console.log(`RUN: ${file}`);
    const result = docker(
      [
        'exec',
        '--interactive',
        name,
        'psql',
        '-X',
        '--no-password',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'label_test',
      ],
      { input },
    );
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    assertions += (result.stderr.match(/NOTICE:\s+PASS:/g) || []).length;
  }
  if (assertions === 0) throw new Error('Keine SQL-Zusicherung ausgeführt.');
  console.log(`SQL assertions passed: ${assertions}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'SQL-Testlauf fehlgeschlagen.');
  process.exitCode = 1;
} finally {
  // Nur den hier erzeugten, zufällig benannten Container entfernen.
  if (started) {
    const result = spawnSync('docker', ['rm', '--force', name], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (result.error || result.status !== 0) {
      console.error('Der Testcontainer konnte nicht entfernt werden:', name);
      process.exitCode = 1;
    }
  }
}

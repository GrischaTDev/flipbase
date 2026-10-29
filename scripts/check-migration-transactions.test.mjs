import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('Migrationsprüfung wartet über den vorläufigen Socketserver hinaus auf PostgreSQL per TCP', () => {
  const root = mkdtempSync(join(tmpdir(), 'flipbase-migration-readiness-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
root="$FLIPBASE_READINESS_FIXTURE"
attempts=0
if [[ -f "$root/attempts" ]]; then read -r attempts < "$root/attempts"; fi
case "$1" in
  exec)
    [[ "$3" == pg_isready ]] || exit 91
    shift 3
    host=socket
    while (( $# )); do
      if [[ "$1" == -h ]]; then shift; host="$1"; fi
      shift
    done
    printf '%s\\n' "$host" >> "$root/probes"
    printf '%s\\n' "$((attempts + 1))" > "$root/attempts"
    # Offizielles Image: Socketserver für die Initialisierung, Neustart, regulärer TCP-Server.
    if (( attempts == 0 )) && [[ "$host" == socket ]]; then
      printf '%s: accepting connections\\n' "$host"
      exit 0
    fi
    if (( attempts < 2 )); then
      printf '%s: no response\\n' "$host"
      exit 2
    fi
    printf '%s: accepting connections\\n' "$host"
    ;;
  run)
    if [[ "$2" == --rm ]]; then
      (( attempts >= 3 )) || exit 70
      printf 'TCP-Server ist bereit' > "$root/migration-started"
    fi
    ;;
  network|rm) ;;
  *) exit 91 ;;
esac
`,
    { mode: 0o755 },
  );
  try {
    const script = fileURLToPath(new URL('./check-migration-transactions.sh', import.meta.url));
    const result = spawnSync(
      'bash',
      [
        '-c',
        'export FLIPBASE_READINESS_FIXTURE="$PWD"; export PATH="$PWD/bin:$PATH"; exec bash "$1"',
        'readiness-fixture',
        script.replaceAll('\\', '/'),
      ],
      { cwd: root, env: process.env, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(readFileSync(join(root, 'migration-started'), 'utf8'), 'TCP-Server ist bereit');
    assert.deepEqual(
      readFileSync(join(root, 'probes'), 'utf8').trim().split('\n'),
      ['127.0.0.1', '127.0.0.1', '127.0.0.1', '127.0.0.1'],
      'Drei Startphasen und die abschließende Bereitschaftsprüfung müssen TCP verwenden',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

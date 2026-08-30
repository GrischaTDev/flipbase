import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

const helperPath = fileURLToPath(
  new URL(
    '../supabase/test-support/manual/inventory_integrity_upgrade_commands.ps1',
    import.meta.url,
  ),
);
const worktreePath = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');

test('bindet Reset und Migration auch aus einem fremden CWD an den aufgelösten Worktree', async () => {
  const foreignDirectory = await mkdtemp(join(tmpdir(), 'flipbase-foreign-cwd-'));
  try {
    const command = [
      "$ErrorActionPreference = 'Stop'",
      '. $env:COMMAND_HELPER',
      '$commands = Get-InventoryUpgradeSupabaseCommands -WorktreePath $env:EXPECTED_WORKTREE -PreviousVersion 20260829062330',
      '$commands | ConvertTo-Json -Compress',
    ].join('; ');
    const result = spawnSync('pwsh', ['-NoProfile', '-Command', command], {
      cwd: foreignDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        COMMAND_HELPER: helperPath,
        EXPECTED_WORKTREE: worktreePath,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const commands = JSON.parse(result.stdout.trim());
    assert.deepEqual(commands.Reset, [
      'supabase',
      '--workdir',
      worktreePath,
      'db',
      'reset',
      '--local',
      '--version',
      '20260829062330',
      '--no-seed',
    ]);
    assert.deepEqual(commands.Migrate, [
      'supabase',
      '--workdir',
      worktreePath,
      'migration',
      'up',
      '--local',
    ]);
  } finally {
    await rm(foreignDirectory, { recursive: true, force: true });
  }
});

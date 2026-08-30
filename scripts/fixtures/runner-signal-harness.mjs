import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { runSuites } from '../run-test-suites.mjs';

const [, , heartbeatPath] = process.argv;
const signalSource = new EventEmitter();
const stdout = new PassThrough();
let signaled = false;

stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  if (!signaled && String(chunk).includes('tree-ready')) {
    signaled = true;
    signalSource.emit('SIGTERM');
  }
});

process.exitCode = await runSuites(
  [
    {
      label: 'harness',
      command: process.execPath,
      args: [
        fileURLToPath(new URL('./process-tree-suite.mjs', import.meta.url)),
        heartbeatPath,
        '5000',
      ],
    },
  ],
  { stdout, stderr: process.stderr, signalSource, terminationGraceMs: 250 },
);

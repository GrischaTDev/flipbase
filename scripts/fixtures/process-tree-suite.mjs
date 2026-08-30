import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [, , heartbeatPath, lifetime] = process.argv;
const grandchild = spawn(
  process.execPath,
  [fileURLToPath(new URL('./heartbeat-grandchild.mjs', import.meta.url)), heartbeatPath, lifetime],
  { stdio: 'ignore' },
);

process.stdout.write('tree-ready\n');

setTimeout(() => {
  grandchild.kill();
}, Number(lifetime));

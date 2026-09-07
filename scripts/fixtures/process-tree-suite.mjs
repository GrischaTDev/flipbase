import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const [, , heartbeatPath, lifetime] = process.argv;
const grandchild = spawn(
  process.execPath,
  [fileURLToPath(new URL('./heartbeat-grandchild.mjs', import.meta.url)), heartbeatPath, lifetime],
  { stdio: 'ignore' },
);

while (!(await readFile(heartbeatPath, 'utf8').catch(() => ''))) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
process.stdout.write('tree-ready\n');

setTimeout(() => {
  grandchild.kill('SIGKILL');
}, Number(lifetime));

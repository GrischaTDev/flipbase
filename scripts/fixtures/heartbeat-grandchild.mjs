import { appendFile } from 'node:fs/promises';

const [, , heartbeatPath, lifetime] = process.argv;
const interval = setInterval(() => void appendFile(heartbeatPath, '.'), 25);

setTimeout(() => {
  clearInterval(interval);
}, Number(lifetime));

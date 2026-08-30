import { appendFile } from 'node:fs/promises';

const [, , heartbeatPath, lifetime] = process.argv;
await appendFile(heartbeatPath, '.');

process.on('SIGINT', () => void appendFile(heartbeatPath, 'I'));
process.on('SIGTERM', () => void appendFile(heartbeatPath, 'T'));

const interval = setInterval(() => void appendFile(heartbeatPath, '.'), 25);

setTimeout(() => {
  clearInterval(interval);
}, Number(lifetime));

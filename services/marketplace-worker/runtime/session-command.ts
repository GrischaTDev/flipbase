import { connect } from 'node:net';

// Fester lokaler Kanal: keine vom Auftrag gewählten Programme, Dateien oder Endpunkte.
process.stdin.setEncoding('utf8');
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 8 * 1024 * 1024) process.exit(1);
}
const socket = connect('/tmp/flipbase-session.sock');
socket.setTimeout(10000);
socket.on('connect', () => socket.end(input));
let length = 0;
socket.on('data', (chunk: Buffer) => {
  length += chunk.length;
  if (length > 8 * 1024 * 1024) {
    socket.destroy();
    process.exitCode = 1;
    return;
  }
  process.stdout.write(chunk);
});
socket.on('error', () => {
  process.exitCode = 1;
});
socket.on('timeout', () => {
  socket.destroy();
  process.exitCode = 1;
});

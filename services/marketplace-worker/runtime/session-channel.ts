import { connect } from 'node:net';
import { browserCommandLimit } from '../src/isolated-browser-actions.ts';

process.stdin.setEncoding('utf8');
let input = '';
for await (const chunk of process.stdin) {
  input += chunk.toString('utf8');
  if (Buffer.byteLength(input) > browserCommandLimit) process.exit(1);
  let end: number;
  while ((end = input.indexOf('\n')) >= 0) {
    const command = input.slice(0, end);
    input = input.slice(end + 1);
    const result = await new Promise<string>((resolve, reject) => {
      const socket = connect('/tmp/flipbase-session.sock');
      let output = '';
      socket.setEncoding('utf8');
      socket.setTimeout(10000);
      socket.on('connect', () => socket.end(command));
      socket.on('data', (chunk: string) => {
        output += chunk;
        if (Buffer.byteLength(output) > browserCommandLimit)
          socket.destroy(new Error('Browserantwort zu groß'));
      });
      socket.on('end', () => resolve(output));
      socket.on('error', reject);
      socket.on('timeout', () => socket.destroy(new Error('Sitzungskanal abgelaufen')));
    });
    process.stdout.write(`${result}\n`);
  }
}

import { createServer as createHttpServer } from 'node:http';
import { createServer as createSmtpServer } from 'node:net';
import { randomUUID } from 'node:crypto';

/** Lokaler Posteingang für Browserprüfungen; versendet und leitet keine E-Mails weiter. */
export async function createBetaEmailBrowserFixture({ smtpPort = 54361, httpPort = 54360 } = {}) {
  const messages = [];
  const sockets = new Set();
  const smtp = createSmtpServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.setEncoding('utf8');
    socket.write('220 flipbase.local ESMTP test fixture\r\n');
    let buffer = '';
    let recipient = '';
    let data = null;
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data !== null) {
          if (line === '.') {
            const text = data
              .join('\n')
              .replace(/=\n/gu, '')
              .replace(/=([a-f0-9]{2})/giu, (_, hex) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
              );
            messages.push({
              ID: randomUUID(),
              To: [{ Address: recipient }],
              Text: text,
              HTML: text,
            });
            data = null;
            socket.write('250 Stored locally\r\n');
          } else data.push(line.replace(/^\.\./u, '.'));
        } else if (/^EHLO /iu.test(line)) socket.write('250-flipbase.local\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH PLAIN /iu.test(line)) socket.write('235 Test authentication accepted\r\n');
        else if (/^RCPT TO:/iu.test(line)) {
          recipient = line.match(/<([^>]+)>/u)?.[1] ?? '';
          socket.write('250 Recipient accepted\r\n');
        } else if (/^DATA$/iu.test(line)) {
          data = [];
          socket.write('354 End with a single dot\r\n');
        } else if (/^QUIT$/iu.test(line)) socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  const http = createHttpServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const id = request.url?.match(/^\/api\/v1\/message\/([^/]+)$/u)?.[1];
    response.end(
      JSON.stringify(id ? (messages.find((message) => message.ID === id) ?? {}) : { messages }),
    );
  });
  await Promise.all([
    new Promise((resolve, reject) => {
      smtp.once('error', reject);
      smtp.listen(smtpPort, '0.0.0.0', resolve);
    }),
    new Promise((resolve, reject) => {
      http.once('error', reject);
      http.listen(httpPort, '127.0.0.1', resolve);
    }),
  ]);
  return {
    smtpPort: smtp.address().port,
    httpPort: http.address().port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await Promise.all([
        new Promise((resolve) => smtp.close(resolve)),
        new Promise((resolve) => http.close(resolve)),
      ]);
    },
  };
}

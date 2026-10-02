import assert from 'node:assert/strict';
import test from 'node:test';
import nodemailer from 'nodemailer';
import { createBetaEmailBrowserFixture } from './beta-email-browser-fixture.mjs';

test('speichert den tatsächlichen SMTP-Versand mit einem vollständig lesbaren Beta-Link', async () => {
  const fixture = await createBetaEmailBrowserFixture({ smtpPort: 0, httpPort: 0 });
  try {
    const token = 'a'.repeat(43);
    const url = `http://127.0.0.1:4200/auth/set-password#beta_token=${token}`;
    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port: fixture.smtpPort,
      auth: { user: 'local', pass: 'local' },
    });
    await transport.sendMail({
      from: 'beta@flipbase.local',
      to: 'applicant@flipbase.local',
      subject: 'Beta',
      text: `Registrierung abschließen: ${url}`,
      html: `<a href="${url}">Registrierung abschließen</a>`,
    });
    const response = await fetch(`http://127.0.0.1:${fixture.httpPort}/api/v1/messages`);
    const { messages } = await response.json();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].To[0].Address, 'applicant@flipbase.local');
    assert.ok(messages[0].Text.includes(url));
  } finally {
    await fixture.close();
  }
});

import { type BetaEmailEnvironment, sendBetaEmail } from './beta-email-delivery.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
  }
}

const testEnvironment: BetaEmailEnvironment = {
  BETA_SMTP_HOST: 'smtp.example.test',
  BETA_SMTP_PORT: '587',
  BETA_SMTP_USER: 'account@example.test',
  BETA_SMTP_PASS: 'secret',
  BETA_SMTP_FROM_EMAIL: 'account@flipbase.de',
  BETA_SMTP_FROM_NAME: 'Flipbase „Beta“',
};

Deno.test('der SMTP-Versand nutzt STARTTLS und ausschliesslich die Empfaengeradresse', async () => {
  const transports: unknown[] = [];
  const sent: unknown[] = [];

  await sendBetaEmail(
    {
      to: 'anna@example.test',
      subject: 'Betreff',
      html: '<p>Text</p>',
      text: 'Text',
    },
    testEnvironment,
    (options) => {
      transports.push(options);
      return {
        sendMail(message) {
          sent.push(message);
          return Promise.resolve();
        },
      };
    },
  );

  assertEquals(transports, [
    {
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'account@example.test', pass: 'secret' },
    },
  ]);
  assertEquals(sent, [
    {
      from: { name: 'Flipbase „Beta“', address: 'account@flipbase.de' },
      to: 'anna@example.test',
      subject: 'Betreff',
      html: '<p>Text</p>',
      text: 'Text',
    },
  ]);
});

Deno.test('fehlende oder ungueltige SMTP-Einstellungen brechen sichtbar ab', async () => {
  const invalidEnvironment = {
    ...testEnvironment,
    BETA_SMTP_PORT: 'kein-port',
  };
  let errorMessage = '';

  try {
    await sendBetaEmail(
      {
        to: 'anna@example.test',
        subject: 'Betreff',
        html: '<p>Text</p>',
        text: 'Text',
      },
      invalidEnvironment,
      () => {
        throw new Error('Transport darf nicht erstellt werden');
      },
    );
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assertEquals(errorMessage, 'BETA_SMTP_PORT ist ungueltig.');
});

export interface BetaRenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderOperatorApplicationNotice(input: {
  firstName: string;
  lastName: string;
  email: string;
}): BetaRenderedEmail {
  const name = `${input.firstName.trim()} ${input.lastName.trim()}`;
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(input.email.trim());
  return {
    subject: 'Neue Bewerbung für die Flipbase Beta',
    html: renderEmailCard(
      `
      <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">Neue Beta-Bewerbung</h1>
      <p style="margin:0 0 12px;font-size:15px;line-height:24px">${safeName} hat sich für die Flipbase Beta beworben.</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:22px">E-Mail: ${safeEmail}</p>
      <p style="margin:0;font-size:14px;line-height:22px">Prüfe die Bewerbung im Betreiberbereich und entscheide dort über die Einladung.</p>
    `,
      'Diese Nachricht wurde automatisch von Flipbase gesendet.',
    ),
    text: `Neue Beta-Bewerbung\n\n${name} (${input.email.trim()}) hat sich beworben. Prüfe die Bewerbung im Betreiberbereich.`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderEmailCard(
  content: string,
  footer = 'Falls du dich nicht für die Flipbase Beta beworben hast, kannst du diese Nachricht ignorieren.',
): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flipbase Beta</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#334155">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f5f7;padding:40px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
          <tr><td style="padding:32px 36px 20px;text-align:center;border-bottom:1px solid #f1f5f9">
            <img src="https://app.flipbase.de/images/logo-mark.png" width="36" height="36" alt="Flipbase" style="display:inline-block;vertical-align:middle;border-radius:8px" />
            <span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:22px;font-weight:800;color:#0f172a">Flipbase</span>
          </td></tr>
          <tr><td style="padding:32px 36px 28px">${content}</td></tr>
          <tr><td style="padding:20px 36px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;font-size:12px;line-height:18px;color:#94a3b8">${footer}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderApplicationReceipt(input: { firstName: string }): BetaRenderedEmail {
  const firstName = input.firstName.trim();
  const safeFirstName = escapeHtml(firstName);
  const html = renderEmailCard(`
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;text-align:center;color:#0f172a">Vielen Dank für deine Anmeldung zur Beta!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:24px;text-align:center;color:#475569">Hallo ${safeFirstName},</p>
    <p style="margin:0;font-size:15px;line-height:24px;text-align:center;color:#475569">Deine Bewerbung ist bei uns eingegangen. Wir prüfen sie und melden uns schnellstmöglich bei dir.</p>
  `);

  return {
    subject: 'Deine Anmeldung zur Flipbase Beta',
    html,
    text: `Hallo ${firstName},\n\nvielen Dank für deine Anmeldung zur Flipbase Beta. Deine Bewerbung ist bei uns eingegangen. Wir prüfen sie und melden uns schnellstmöglich bei dir.\n\nDein Flipbase-Team`,
  };
}

export function renderApplicationRejection(input: { firstName: string }): BetaRenderedEmail {
  const firstName = input.firstName.trim();
  const safeFirstName = escapeHtml(firstName);
  const html = renderEmailCard(`
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;text-align:center;color:#0f172a">Danke für dein Interesse an Flipbase</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:24px;text-align:center;color:#475569">Hallo ${safeFirstName},</p>
    <p style="margin:0;font-size:15px;line-height:24px;text-align:center;color:#475569">vielen Dank für deine Bewerbung. Leider können wir dir aktuell keinen Platz in der geschlossenen Beta anbieten.</p>
  `);

  return {
    subject: 'Deine Bewerbung für die Flipbase Beta',
    html,
    text: `Hallo ${firstName},\n\nvielen Dank für deine Bewerbung. Leider können wir dir aktuell keinen Platz in der geschlossenen Beta anbieten.\n\nDein Flipbase-Team`,
  };
}

export function renderRegistrationInvite(input: {
  firstName: string;
  actionLink: string;
  grantedDays: number;
}): BetaRenderedEmail {
  const firstName = input.firstName.trim();
  const safeFirstName = escapeHtml(firstName);
  const safeActionLink = escapeHtml(input.actionLink);
  const grantedDays = Math.trunc(input.grantedDays);
  const html = renderEmailCard(`
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;text-align:center;color:#0f172a">Deine Bewerbung wurde angenommen</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:24px;text-align:center;color:#475569">Hallo ${safeFirstName},<br />deine Bewerbung wurde angenommen. Du kannst jetzt deine Registrierung für die geschlossene Flipbase Beta abschließen.</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;text-align:center;color:#64748b">Deine Beta-Laufzeit von ${grantedDays} Tagen beginnt erst, nachdem du dein Passwort festgelegt hast. Danach kannst du im Dashboard dein Discord-Konto verbinden und erhältst automatisch die Rolle „Beta-Tester“.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px auto"><tr><td align="center" style="border-radius:12px;background:#fcc601">
      <a href="${safeActionLink}" target="_blank" style="display:inline-block;padding:14px 32px;border:1px solid #eab308;border-radius:12px;background:#fcc601;color:#111827;font-size:15px;font-weight:700;text-decoration:none">Registrierung abschließen</a>
    </td></tr></table>
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #f1f5f9;font-size:12px;line-height:18px;text-align:center;color:#94a3b8;word-break:break-all">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />${safeActionLink}</p>
  `);

  return {
    subject: 'Deine Bewerbung zur Flipbase Beta wurde angenommen',
    html,
    text: `Hallo ${firstName},\n\nDeine Bewerbung wurde angenommen. Du kannst jetzt deine Registrierung für die geschlossene Flipbase Beta abschließen. Deine Beta-Laufzeit von ${grantedDays} Tagen beginnt erst, nachdem du dein Passwort festgelegt hast. Danach kannst du im Dashboard dein Discord-Konto verbinden und erhältst automatisch die Rolle „Beta-Tester“.\n\nRegistrierung abschließen: ${input.actionLink}\n\nDein Flipbase-Team`,
  };
}

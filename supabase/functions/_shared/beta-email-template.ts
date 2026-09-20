export interface BetaRenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderEmailCard(content: string): string {
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
            <p style="margin:0;font-size:12px;line-height:18px;color:#94a3b8">Falls Sie sich nicht für die Flipbase Beta beworben haben, können Sie diese Nachricht ignorieren.</p>
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
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;text-align:center;color:#0f172a">Vielen Dank für Ihre Anmeldung zur Beta!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:24px;text-align:center;color:#475569">Hallo ${safeFirstName},</p>
    <p style="margin:0;font-size:15px;line-height:24px;text-align:center;color:#475569">Ihre Bewerbung ist bei uns eingegangen. Wir prüfen sie und melden uns schnellstmöglich bei Ihnen.</p>
  `);

  return {
    subject: 'Ihre Anmeldung zur Flipbase Beta',
    html,
    text: `Hallo ${firstName},\n\nvielen Dank für Ihre Anmeldung zur Flipbase Beta. Ihre Bewerbung ist bei uns eingegangen. Wir prüfen sie und melden uns schnellstmöglich bei Ihnen.\n\nIhr Flipbase-Team`,
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
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;text-align:center;color:#0f172a">Sie sind bei der Beta dabei!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:24px;text-align:center;color:#475569">Hallo ${safeFirstName},<br />gute Neuigkeiten: Wir haben Ihre Bewerbung für die geschlossene Flipbase Beta angenommen.</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;text-align:center;color:#64748b">Ihre Beta-Laufzeit von ${grantedDays} Tagen beginnt erst, nachdem Sie Ihr Passwort festgelegt haben.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px auto"><tr><td align="center" style="border-radius:12px;background:#fcc601">
      <a href="${safeActionLink}" target="_blank" style="display:inline-block;padding:14px 32px;border:1px solid #eab308;border-radius:12px;background:#fcc601;color:#111827;font-size:15px;font-weight:700;text-decoration:none">Registrierung abschließen</a>
    </td></tr></table>
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #f1f5f9;font-size:12px;line-height:18px;text-align:center;color:#94a3b8;word-break:break-all">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br />${safeActionLink}</p>
  `);

  return {
    subject: 'Ihre Einladung zur Flipbase Beta',
    html,
    text: `Hallo ${firstName},\n\ngute Neuigkeiten: Wir haben Ihre Bewerbung für die geschlossene Flipbase Beta angenommen. Ihre Beta-Laufzeit von ${grantedDays} Tagen beginnt erst, nachdem Sie Ihr Passwort festgelegt haben.\n\nRegistrierung abschließen: ${input.actionLink}\n\nIhr Flipbase-Team`,
  };
}

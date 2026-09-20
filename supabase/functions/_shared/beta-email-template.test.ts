import { renderApplicationReceipt, renderRegistrationInvite } from './beta-email-template.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test('die Eingangsbestaetigung enthaelt keinen Aktionslink und maskiert Namen', () => {
  const message = renderApplicationReceipt({ firstName: '<Anna & Co.>' });

  assert(message.subject === 'Ihre Anmeldung zur Flipbase Beta', 'Unerwarteter Betreff');
  assert(message.html.includes('&lt;Anna &amp; Co.&gt;'), 'Der HTML-Name ist nicht maskiert');
  assert(message.text.includes('<Anna & Co.>'), 'Der Klartextname fehlt');
  assert(!message.html.includes('href='), 'Die Eingangsbestaetigung darf keinen Link enthalten');
  assert(!message.text.includes('http'), 'Die Klartextbestaetigung darf keinen Link enthalten');
});

Deno.test('die Registrierungseinladung verwendet die bestehende Gestaltung sicher', () => {
  const message = renderRegistrationInvite({
    firstName: 'Berta <Beta>',
    actionLink: 'https://app.flipbase.de/auth/set-password?token=a&next=b',
    grantedDays: 60,
  });

  assert(message.subject === 'Ihre Einladung zur Flipbase Beta', 'Unerwarteter Betreff');
  assert(message.html.includes('Berta &lt;Beta&gt;'), 'Der Name ist nicht maskiert');
  assert(message.html.includes('token=a&amp;next=b'), 'Der Link ist nicht fuer HTML maskiert');
  assert(message.text.includes('token=a&next=b'), 'Der Klartextlink fehlt');
  assert(message.html.includes('60 Tage'), 'Die Laufzeit fehlt');
});

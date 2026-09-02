/**
 * Zeichnet eine echte Katalogantwort auf und pseudonymisiert dabei alle
 * Verkaeuferdaten. Die Struktur bleibt vollstaendig erhalten, damit der
 * Vertragstest eine Formataenderung bemerkt - aber es werden keine
 * personenbezogenen Daten realer Nutzer ins Repository committet.
 *
 * Aufruf: npm run record:fixture
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.vinted.de';
const USER_AGENT = 'Mozilla/5.0 (compatible; FlipbaseSniper/0.1)';
// `fileURLToPath` statt `.pathname`: Unter Windows enthaelt `.pathname` einen
// fuehrenden Schraegstrich vor dem Laufwerksbuchstaben (z. B. "/K:/..."), was
// `mkdirSync`/`writeFileSync` nicht als gueltigen Pfad erkennen.
const TARGET = fileURLToPath(new URL('../test/fixtures/vinted-catalog.json', import.meta.url));

function cookieHeader(response) {
  // Vinted's warm-up response kann denselben Cookie-Namen zweimal setzen (z. B.
  // eine leere Invalidierung von "access_token_web" gefolgt vom echten Token).
  // Ohne Deduplizierung landet die leere erste Auspraegung im Cookie-Header,
  // Vinted liest diese und antwortet mit 401 "invalid_authentication_token" -
  // reproduzierbar bei jedem Versuch, nicht das dokumentierte seltene 401.
  // Wie ein echter Cookie-Jar gewinnt daher der zuletzt gesetzte Wert je Name.
  const byName = new Map();
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    byName.set(pair.slice(0, separator), pair);
  }
  return [...byName.values()].join('; ');
}

function anonymiseUser(index) {
  return {
    id: 1000 + index,
    login: `seller_${index}`,
    profile_url: `${BASE}/member/${1000 + index}-seller-${index}`,
    photo: null,
  };
}

const warmup = await fetch(BASE, {
  headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
});
if (!warmup.ok) throw new Error(`warm-up failed with ${warmup.status}`);

const url = new URL('/api/v2/catalog/items', BASE);
url.searchParams.set('search_text', 'nike air max');
url.searchParams.set('order', 'newest_first');
url.searchParams.set('page', '1');
url.searchParams.set('per_page', '96');

const response = await fetch(url, {
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    Cookie: cookieHeader(warmup),
  },
});
if (!response.ok) throw new Error(`catalog request failed with ${response.status}`);

const body = await response.json();
const fixture = {
  items: body.items.slice(0, 3).map((item, index) => ({ ...item, user: anonymiseUser(index) })),
  pagination: body.pagination,
};

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`recorded ${fixture.items.length} items to ${TARGET}`);

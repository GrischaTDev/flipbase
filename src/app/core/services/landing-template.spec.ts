import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const wurzel = process.cwd();
const seite = readFileSync(join(wurzel, 'landing', 'index.html'), 'utf-8');
const skript = readFileSync(join(wurzel, 'landing', 'landing.js'), 'utf-8');
const caddyfile = readFileSync(join(wurzel, 'deploy', 'Caddyfile'), 'utf-8');

describe('Auslieferung der Landingpage', () => {
  it('zeigt immer genau einen direkten App-Link in der Kopfzeile', () => {
    const header = seite.match(/<header\b[\s\S]*?<\/header>/iu)?.[0];
    expect(header).toBeDefined();
    expect(header).not.toContain('.Cookie');
    expect(header!.match(/class="kopf-cta"/gu)).toHaveLength(1);
    expect(header).toContain('href="https://app.flipbase.de"');
    expect(header).toContain('Zur App');
    expect(header).toContain('Open App');
  });

  it('die Seite bindet genau ein lokales Skript statt eingebettetem Code ein', () => {
    const scriptTags = [...seite.matchAll(/<script\b([^>]*)>/giu)];
    expect(scriptTags).toHaveLength(1);
    for (const [, attributes] of scriptTags) {
      expect(attributes).toMatch(/\bsrc=["']landing\.js["']/iu);
      expect(attributes).toMatch(/\bdefer\b/iu);
    }
    expect(seite).not.toMatch(/<script\b[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/iu);
  });

  it('die Content-Security-Policy erlaubt kein unsafe-inline in script-src', () => {
    // 'unsafe-inline' wuerde jedes eingeschleuste Skript erlauben. Das lokale
    // Formularskript braucht nur dieselbe Herkunft.
    const scriptSrcMatch = caddyfile.match(/script-src\s+([^;]+);/u);
    expect(scriptSrcMatch, 'Caddyfile muss eine script-src-Direktive enthalten').not.toBeNull();
    expect(scriptSrcMatch![1]).not.toContain("'unsafe-inline'");
    expect(scriptSrcMatch![1]).toContain("'self'");
  });

  it('die CSP verwendet keinen wartungsabhaengigen Inline-Hash', () => {
    const scriptSrcMatch = caddyfile.match(/script-src\s+([^;]+);/u);
    expect(scriptSrcMatch, 'Caddyfile muss eine script-src-Direktive enthalten').not.toBeNull();
    expect(scriptSrcMatch![1]).not.toMatch(/'sha256-/u);
  });

  it('die Adresse, die das Formular per fetch aufruft, ist von connect-src gedeckt', () => {
    // Der Test oben haelt nur die sha256-Pruefsumme des Skripts gegen das
    // Caddyfile - das sagt nichts darueber, ob die Adresse, die das Skript
    // aufruft, ueberhaupt von connect-src gedeckt ist. Zieht der Endpunkt
    // einmal um und jemand denkt an die Pruefsumme, aber nicht an
    // connect-src, ist das Formular wieder lautlos tot: der Browser
    // blockiert den fetch-Aufruf ohne sichtbare Fehlermeldung fuer den
    // Besucher, nur eine CSP-Verletzung in der Konsole.
    const endpunktMatch = skript.match(/ENDPOINT\s*=\s*['"]([^'"]+)['"]/u);
    expect(
      endpunktMatch,
      'landing/landing.js sollte die ENDPOINT-Konstante fuer den fetch-Aufruf definieren',
    ).not.toBeNull();

    const endpunktUrsprung = new URL(endpunktMatch![1]).origin;

    // Der Kommentar ueber der Kopfzeile erwaehnt "connect-src" ebenfalls in
    // Prosa - eine Suche ueber das ganze Caddyfile faende also den falschen
    // Treffer. Die tatsaechliche Direktive steckt im Wert der
    // Content-Security-Policy-Kopfzeile, deshalb wird zuerst dieser Wert
    // isoliert und erst darin nach connect-src gesucht.
    const cspMatch = caddyfile.match(/Content-Security-Policy\s+"([^"]+)"/u);
    expect(
      cspMatch,
      'Caddyfile muss eine Content-Security-Policy-Kopfzeile enthalten',
    ).not.toBeNull();

    const connectSrcMatch = cspMatch![1].match(/connect-src\s+([^;]+);/u);
    expect(connectSrcMatch, 'Caddyfile muss eine connect-src-Direktive enthalten').not.toBeNull();

    expect(
      connectSrcMatch![1],
      `connect-src muss ${endpunktUrsprung} enthalten, sonst blockiert der Browser den fetch-Aufruf lautlos`,
    ).toContain(endpunktUrsprung);
  });

  it('form-action ist "none" - kein Formular hat mehr ein action-Attribut', () => {
    // Alle Formulare senden per fetch aus dem eingebetteten Skript. Ein
    // festes Ziel wie "https://app.flipbase.de" waere hier eine leere
    // Zusage: liefe das Skript einmal nicht, wuerde ein natives Absenden
    // sonst blind dorthin gehen und die Eingaben verlieren. 'none' ist
    // strenger, nicht laxer, und macht dieses stille Datenleck unmoeglich.
    expect(caddyfile).toMatch(/form-action\s+'none'\s*;/u);
  });

  it('die Seite bindet das Flipbase-Markenlogo ein', () => {
    expect(seite).toMatch(/<img[^>]+src="(\/)?images\/logo-mark\.png"/);
  });

  it('die Seite bietet JavaScript-freie Umschalter fuer Design und Sprache', () => {
    expect(seite).toContain('id="theme-toggle"');
    expect(seite).toContain('id="lang-toggle"');
  });

  it('die Seite stellt Vinted Bot und § 25a Differenzbesteuerung vor', () => {
    expect(seite).toContain('Vinted Bot');
    expect(seite).toContain('§ 25a');
  });
});

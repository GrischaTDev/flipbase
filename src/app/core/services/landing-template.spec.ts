import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { HINWEIS_COOKIE } from './landing-hint.service';

/**
 * Die Landingpage wird von Caddy als Vorlage ausgeliefert. Fehlt dort die
 * templates-Direktive, steht die Bedingung als roher Text auf der Seite -
 * sichtbar fuer jeden Besucher. Beide Dateien gehoeren deshalb zusammen.
 */
const wurzel = process.cwd();
const seite = readFileSync(join(wurzel, 'landing', 'index.html'), 'utf-8');
const caddyfile = readFileSync(join(wurzel, 'deploy', 'Caddyfile'), 'utf-8');

describe('Anmeldehinweis auf der Landingpage', () => {
  it('fragt das Merk-Cookie unter genau dem Namen ab, den die App setzt', () => {
    expect(seite).toContain(`.Cookie "${HINWEIS_COOKIE}"`);
  });

  it('Caddy wertet die Vorlage aus', () => {
    expect(caddyfile).toMatch(/^\s*templates(\s+@\w+)?\s*$/m);
  });

  it('die Antwort haengt vom Cookie ab und darf nicht blind zwischengespeichert werden', () => {
    expect(caddyfile).toMatch(/Vary Cookie/);
  });

  it('die Seite bindet hoechstens ein eingebettetes Skript ein und laedt keines von fremd', () => {
    // Seit der Bewerbungsanbindung ist genau ein eingebettetes <script> erlaubt
    // (es sendet das Formular per fetch). Ein <script src="..."> waere ein
    // fremd geladenes Skript und bleibt verboten.
    const scriptTags = [...seite.matchAll(/<script\b([^>]*)>/giu)];
    expect(scriptTags.length).toBeLessThanOrEqual(1);
    for (const [, attributes] of scriptTags) {
      expect(attributes).not.toMatch(/\bsrc\s*=/iu);
    }
  });

  it('die Content-Security-Policy erlaubt kein unsafe-inline in script-src', () => {
    // 'unsafe-inline' wuerde jedes eingeschleuste Skript erlauben - schwaecher
    // als die heutige Richtlinie ohne jegliches Skript. Erlaubt ist nur eine
    // sha256-Pruefsumme, die genau das eine bekannte Skript freischaltet.
    const scriptSrcMatch = caddyfile.match(/script-src\s+([^;]+);/u);
    expect(scriptSrcMatch, 'Caddyfile muss eine script-src-Direktive enthalten').not.toBeNull();
    expect(scriptSrcMatch![1]).not.toContain("'unsafe-inline'");
  });

  it('die sha256-Pruefsumme in der CSP stimmt mit dem eingebetteten Skript in landing/index.html ueberein', () => {
    // Das ist die entscheidende Pruefung: Die Pruefsumme im Caddyfile ist sonst
    // eine stille Falle. Aendert jemand spaeter das eingebettete Skript, ohne
    // die Pruefsumme nachzuziehen, blockiert der Browser das Skript in
    // Produktion lautlos (keine sichtbare Fehlermeldung, nur eine CSP-
    // Verletzung in der Browser-Konsole, die kein Besucher je zu sehen
    // bekommt). Dieser Test macht genau das sofort sichtbar.
    const openTagMatch = seite.match(/<script\b[^>]*>/u);
    expect(
      openTagMatch,
      'landing/index.html sollte ein eingebettetes Skript enthalten',
    ).not.toBeNull();

    const start = seite.indexOf(openTagMatch![0]) + openTagMatch![0].length;
    const end = seite.indexOf('</script>', start);
    expect(end, 'schliessendes </script> nicht gefunden').toBeGreaterThan(-1);
    const scriptInhalt = seite.slice(start, end);

    const berechnetePruefsumme = createHash('sha256')
      .update(scriptInhalt, 'utf-8')
      .digest('base64');

    const scriptSrcMatch = caddyfile.match(/script-src\s+([^;]+);/u);
    expect(scriptSrcMatch, 'Caddyfile muss eine script-src-Direktive enthalten').not.toBeNull();
    const shaMatch = scriptSrcMatch![1].match(/'sha256-([^']+)'/u);
    expect(
      shaMatch,
      "script-src muss eine sha256-Pruefsumme enthalten (kein 'unsafe-inline', kein 'none')",
    ).not.toBeNull();

    expect(
      shaMatch![1],
      'Pruefsumme im Caddyfile passt nicht zum Skriptinhalt in landing/index.html - beim Aendern des Skripts muss die Pruefsumme im Caddyfile mit aktualisiert werden',
    ).toBe(berechnetePruefsumme);
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

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    expect(caddyfile).toMatch(/^\s*templates\s*$/m);
  });

  it('die Antwort haengt vom Cookie ab und darf nicht blind zwischengespeichert werden', () => {
    expect(caddyfile).toMatch(/Vary Cookie/);
  });

  it('die Seite bringt weiterhin kein eigenes JavaScript mit', () => {
    expect(seite).not.toContain('<script');
    expect(caddyfile).toContain("script-src 'none'");
  });
});

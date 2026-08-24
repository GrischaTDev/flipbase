import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Der Bildoptimierer liest Fotos ueber eine blob:-Adresse ein -
 * ngx-image-cropper holt das Bild per `fetch`, was unter `connect-src` faellt
 * und nicht unter `img-src`.
 *
 * Fehlt die Freigabe, scheitert im Betrieb **jedes** Foto, waehrend lokal
 * alles laeuft: Der Entwicklungsserver liefert gar keine CSP aus. Genau so ist
 * es am 24.08.2026 live passiert, und der Fehler war ohne die Browser-Konsole
 * nicht zu sehen. Deshalb dieser Test - er ist die einzige Stelle, an der die
 * Auslieferungs-Konfiguration ueberhaupt geprueft wird.
 */
const datei = readFileSync(join(process.cwd(), 'docker', 'security-headers.conf'), 'utf-8');

/**
 * Nur die Header-Zeile, nicht die Kommentare darueber - in denen stehen die
 * Direktivnamen ebenfalls, und eine Suche ueber die ganze Datei wuerde dort
 * faelschlich fuendig.
 */
const csp =
  datei.split('\n').find((zeile) => zeile.startsWith('add_header Content-Security-Policy')) ?? '';

describe('Content-Security-Policy der ausgelieferten App', () => {
  it('erlaubt blob: unter connect-src', () => {
    const richtlinie = csp.match(/connect-src[^;]*/)?.[0] ?? '';
    expect(richtlinie).toContain('blob:');
  });

  it('erlaubt blob: weiterhin auch unter img-src', () => {
    const richtlinie = csp.match(/img-src[^;]*/)?.[0] ?? '';
    expect(richtlinie).toContain('blob:');
  });

  it('laesst default-src auf self stehen', () => {
    expect(csp).toContain("default-src 'self'");
  });
});

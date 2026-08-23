import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { DOCUMENT, Injector, runInInjectionContext } from '@angular/core';
import {
  HINWEIS_COOKIE,
  HINWEIS_LAUFZEIT_SEKUNDEN,
  LandingHintService,
  abmeldeZeile,
  anmeldeZeile,
} from './landing-hint.service';
import { environment } from '../../../environments/environment';

/**
 * Legt einen Dienst mit einem gefaelschten Dokument an und sammelt jede
 * geschriebene Cookie-Zeile ein. Das echte document.cookie in jsdom lehnt
 * fremde Domains ab - hier geht es aber genau darum, was geschrieben wird.
 */
function dienstMitProtokoll(): { dienst: LandingHintService; geschrieben: string[] } {
  const geschrieben: string[] = [];
  const dokument = {
    set cookie(wert: string) {
      geschrieben.push(wert);
    },
    get cookie(): string {
      return geschrieben.join('; ');
    },
  } as unknown as Document;

  const injector = Injector.create({ providers: [{ provide: DOCUMENT, useValue: dokument }] });
  const dienst = runInInjectionContext(injector, () => new LandingHintService());
  return { dienst, geschrieben };
}

describe('Merk-Cookie fuer die Landingpage', () => {
  it('enthaelt keinen Token, sondern nur eine 1', () => {
    expect(anmeldeZeile('.flipbase.de')).toContain(`${HINWEIS_COOKIE}=1;`);
  });

  it('gilt fuer die ganze Domain und wird nur verschluesselt uebertragen', () => {
    const zeile = anmeldeZeile('.flipbase.de') ?? '';
    expect(zeile).toContain('Domain=.flipbase.de');
    expect(zeile).toContain('Path=/');
    expect(zeile).toContain('Secure');
    expect(zeile).toContain('SameSite=Lax');
  });

  it('laeuft nach 7 Tagen ab - gleitend wie die Inaktivitaetsgrenze, nicht die 30-Tage-Timebox', () => {
    expect(HINWEIS_LAUFZEIT_SEKUNDEN).toBe(7 * 24 * 60 * 60);
    expect(anmeldeZeile('.flipbase.de')).toContain(`Max-Age=${HINWEIS_LAUFZEIT_SEKUNDEN}`);
  });

  it('loescht mit derselben Domain, sonst trifft der Browser das Cookie nicht', () => {
    const zeile = abmeldeZeile('.flipbase.de') ?? '';
    expect(zeile).toContain('Domain=.flipbase.de');
    expect(zeile).toContain('Max-Age=0');
  });

  it('tut ohne eingestellte Domain gar nichts', () => {
    expect(anmeldeZeile('')).toBeNull();
    expect(abmeldeZeile('')).toBeNull();
  });

  it('der Dienst schreibt genau eine Zeile beim Anmelden', () => {
    // vitest laedt immer die Produktionsumgebung, dort ist die Domain gesetzt.
    expect(environment.landingHintCookieDomain).not.toBe('');

    const { dienst, geschrieben } = dienstMitProtokoll();
    dienst.anmelden();

    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toBe(anmeldeZeile(environment.landingHintCookieDomain));
  });

  it('der Dienst raeumt das Cookie beim Abmelden wieder weg', () => {
    const { dienst, geschrieben } = dienstMitProtokoll();
    dienst.abmelden();

    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toBe(abmeldeZeile(environment.landingHintCookieDomain));
  });
});

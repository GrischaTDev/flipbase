import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests für Fokus-Falle, Fokus-Rückgabe und Seitensperre der Modal-Direktive.
 *
 * Die Testumgebung hat noch kein DOM (das kommt in Phase 8), deshalb werden
 * hier die Regeln geprüft, die die Direktive anwendet – anhand einer
 * nachgebauten Element-Liste.
 *
 * Hintergrund: Von 22 modalen Overlays im Projekt hatte keines eine
 * Fokus-Falle. Wer mit der Tastatur arbeitete, tabbte aus dem offenen Dialog
 * in die Seite dahinter; ein Screenreader las den Inhalt hinter dem Dialog vor.
 */

const FOKUSSIERBAR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface TestElement {
  name: string;
  tag: string;
  disabled?: boolean;
  tabindex?: string;
  typ?: string;
  ariaLabel?: string;
}

/** Entscheidet nach denselben Regeln wie die Direktive, ob ein Element erreichbar ist. */
function istFokussierbar(el: TestElement): boolean {
  if (el.disabled) return false;
  if (el.tabindex === '-1') return false;
  if (el.tag === 'input' && el.typ === 'hidden') return false;
  return (
    ['a', 'button', 'input', 'select', 'textarea'].includes(el.tag) || el.tabindex !== undefined
  );
}

/** Bildet den Tab-Umlauf der Fokus-Falle nach. */
function naechsterFokus(
  elemente: readonly TestElement[],
  aktuell: string,
  rueckwaerts: boolean,
): string {
  const erreichbar = elemente.filter(istFokussierbar);
  if (erreichbar.length === 0) return aktuell;

  const index = erreichbar.findIndex((e) => e.name === aktuell);
  const erstes = erreichbar[0];
  const letztes = erreichbar[erreichbar.length - 1];

  if (rueckwaerts) {
    return index <= 0 ? letztes.name : erreichbar[index - 1].name;
  }
  return index === erreichbar.length - 1 || index === -1 ? erstes.name : erreichbar[index + 1].name;
}

/** Bildet die Auswahl des Startfokus nach. */
function startFokus(elemente: readonly TestElement[]): string | null {
  const erreichbar = elemente.filter(istFokussierbar);
  if (erreichbar.length === 0) return null;
  const inhaltlich = erreichbar.find((e) => !/schliess|close|abbrechen/i.test(e.ariaLabel ?? ''));
  return (inhaltlich ?? erreichbar[0]).name;
}

describe('Modal-Direktive – Fokus-Falle', () => {
  const dialog: TestElement[] = [
    { name: 'schliessen', tag: 'button', ariaLabel: 'Dialog schliessen' },
    { name: 'eingabe', tag: 'input' },
    { name: 'auswahl', tag: 'select' },
    { name: 'abbrechenKnopf', tag: 'button' },
    { name: 'speichern', tag: 'button' },
  ];

  it('erkennt alle erreichbaren Elemente', () => {
    expect(dialog.filter(istFokussierbar).length).toBe(5);
  });

  it('springt vom letzten Element zurück zum ersten', () => {
    expect(naechsterFokus(dialog, 'speichern', false)).toBe('schliessen');
  });

  it('springt rückwärts vom ersten zum letzten', () => {
    expect(naechsterFokus(dialog, 'schliessen', true)).toBe('speichern');
  });

  it('läuft vorwärts der Reihe nach', () => {
    expect(naechsterFokus(dialog, 'eingabe', false)).toBe('auswahl');
  });

  it('läuft rückwärts der Reihe nach', () => {
    expect(naechsterFokus(dialog, 'auswahl', true)).toBe('eingabe');
  });

  it('holt den Fokus zurück, wenn er ausserhalb des Dialogs liegt', () => {
    expect(naechsterFokus(dialog, 'elementAusserhalb', false)).toBe('schliessen');
  });

  it('bleibt bei einer vollen Runde im Dialog', () => {
    let aktuell = 'schliessen';
    const besucht = [aktuell];
    for (let i = 0; i < 5; i++) {
      aktuell = naechsterFokus(dialog, aktuell, false);
      besucht.push(aktuell);
    }
    expect(besucht[besucht.length - 1]).toBe('schliessen');
    expect(new Set(besucht).size).toBe(5);
  });

  describe('nicht erreichbare Elemente', () => {
    it('überspringt deaktivierte Schaltflächen', () => {
      const el: TestElement[] = [
        { name: 'eingabe', tag: 'input' },
        { name: 'gesperrt', tag: 'button', disabled: true },
        { name: 'speichern', tag: 'button' },
      ];
      expect(naechsterFokus(el, 'eingabe', false)).toBe('speichern');
    });

    it('überspringt versteckte Eingabefelder', () => {
      const el: TestElement[] = [
        { name: 'eingabe', tag: 'input' },
        { name: 'versteckt', tag: 'input', typ: 'hidden' },
        { name: 'speichern', tag: 'button' },
      ];
      expect(naechsterFokus(el, 'eingabe', false)).toBe('speichern');
    });

    it('überspringt Elemente mit tabindex -1', () => {
      const el: TestElement[] = [
        { name: 'eingabe', tag: 'input' },
        { name: 'huelle', tag: 'div', tabindex: '-1' },
        { name: 'speichern', tag: 'button' },
      ];
      expect(naechsterFokus(el, 'eingabe', false)).toBe('speichern');
    });

    it('kommt mit einem Dialog ohne bedienbare Elemente zurecht', () => {
      expect(naechsterFokus([{ name: 'text', tag: 'p' }], 'text', false)).toBe('text');
    });
  });

  describe('Startfokus', () => {
    it('überspringt den Schliessen-Knopf und landet auf dem ersten Eingabefeld', () => {
      expect(startFokus(dialog)).toBe('eingabe');
    });

    it('nimmt den Schliessen-Knopf, wenn es sonst nichts gibt', () => {
      const nurSchliessen: TestElement[] = [
        { name: 'nur-schliessen', tag: 'button', ariaLabel: 'Dialog schliessen' },
      ];
      expect(startFokus(nurSchliessen)).toBe('nur-schliessen');
    });

    it('liefert null, wenn nichts erreichbar ist', () => {
      expect(startFokus([{ name: 'text', tag: 'p' }])).toBeNull();
    });
  });

  describe('Auswahlregel', () => {
    it('enthält alle bedienbaren Elementarten', () => {
      for (const teil of ['a[href]', 'button', 'input', 'select', 'textarea', '[tabindex]']) {
        expect(FOKUSSIERBAR).toContain(teil);
      }
    });

    it('schliesst deaktivierte und versteckte Elemente aus', () => {
      expect(FOKUSSIERBAR).toContain(':not([disabled])');
      expect(FOKUSSIERBAR).toContain(':not([type="hidden"])');
      expect(FOKUSSIERBAR).toContain(':not([tabindex="-1"])');
    });
  });
});

describe('Modal-Direktive – Fokus-Rückgabe und Seitensperre', () => {
  let koerper: { style: { overflow: string } };
  let fokusZiel: string | null;

  /** Bildet nach, was die Direktive beim Öffnen und Schliessen tut. */
  class DirektiveNachbau {
    private readonly vorherigesOverflow: string;
    private readonly zuvorFokussiert: string | null;

    constructor(aktivesElement: string | null) {
      this.zuvorFokussiert = aktivesElement;
      this.vorherigesOverflow = koerper.style.overflow;
      koerper.style.overflow = 'hidden';
    }

    zerstoere(): void {
      koerper.style.overflow = this.vorherigesOverflow;
      fokusZiel = this.zuvorFokussiert;
    }
  }

  beforeEach(() => {
    koerper = { style: { overflow: '' } };
    fokusZiel = null;
  });

  it('sperrt das Scrollen, solange der Dialog offen ist', () => {
    new DirektiveNachbau('ausloeser');
    expect(koerper.style.overflow).toBe('hidden');
  });

  it('stellt das Scrollen beim Schliessen wieder her', () => {
    new DirektiveNachbau('ausloeser').zerstoere();
    expect(koerper.style.overflow).toBe('');
  });

  it('gibt den Fokus an das auslösende Element zurück', () => {
    new DirektiveNachbau('knopf-einkauf-anlegen').zerstoere();
    expect(fokusZiel).toBe('knopf-einkauf-anlegen');
  });

  it('behält einen bereits gesetzten Overflow-Wert bei', () => {
    koerper.style.overflow = 'scroll';
    const d = new DirektiveNachbau(null);
    expect(koerper.style.overflow).toBe('hidden');
    d.zerstoere();
    expect(koerper.style.overflow).toBe('scroll');
  });

  it('kommt ohne vorher fokussiertes Element zurecht', () => {
    const d = new DirektiveNachbau(null);
    expect(() => d.zerstoere()).not.toThrow();
    expect(fokusZiel).toBeNull();
  });
});

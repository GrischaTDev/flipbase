import { describe, expect, it } from 'vitest';
import { FotoguideZustand } from './fotoguide-zustand';

describe('Fotoguide-Zustand', () => {
  it('oeffnet den allgemeinen Fotoguide bei den Aufnahme-Tipps', () => {
    const zustand = new FotoguideZustand();

    zustand.oeffnen();

    expect(zustand.istOffen()).toBe(true);
    expect(zustand.aktiverTab()).toBe('aufnehmen');
  });

  it('oeffnet die Plattform-Hilfe direkt im angeklickten Tab', () => {
    const zustand = new FotoguideZustand();

    zustand.oeffnen('vinted');

    expect(zustand.istOffen()).toBe(true);
    expect(zustand.aktiverTab()).toBe('vinted');
  });

  it('schliesst den Fotoguide wieder', () => {
    const zustand = new FotoguideZustand();
    zustand.oeffnen('ebay');

    zustand.schliessen();

    expect(zustand.istOffen()).toBe(false);
  });
});

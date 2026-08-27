import { describe, expect, it } from 'vitest';
import { PhotoGuideState } from './photo-guide-state';

describe('Fotoguide-Zustand', () => {
  it('oeffnet den allgemeinen Fotoguide bei den Aufnahme-Tipps', () => {
    const zustand = new PhotoGuideState();

    zustand.open();

    expect(zustand.isOpen()).toBe(true);
    expect(zustand.activeTab()).toBe('aufnehmen');
  });

  it('oeffnet die Plattform-Hilfe direkt im angeklickten Tab', () => {
    const zustand = new PhotoGuideState();

    zustand.open('vinted');

    expect(zustand.isOpen()).toBe(true);
    expect(zustand.activeTab()).toBe('vinted');
  });

  it('schliesst den Fotoguide wieder', () => {
    const zustand = new PhotoGuideState();
    zustand.open('ebay');

    zustand.close();

    expect(zustand.isOpen()).toBe(false);
  });
});

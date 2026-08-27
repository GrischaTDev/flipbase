import { describe, expect, it } from 'vitest';
import { PhotoGuideState } from './photo-guide-state';

describe('Fotoguide-Zustand', () => {
  it('oeffnet den allgemeinen Fotoguide bei den Aufnahme-Tipps', () => {
    const state = new PhotoGuideState();

    state.open();

    expect(state.isOpen()).toBe(true);
    expect(state.activeTab()).toBe('aufnehmen');
  });

  it('oeffnet die Plattform-Hilfe direkt im angeklickten Tab', () => {
    const state = new PhotoGuideState();

    state.open('vinted');

    expect(state.isOpen()).toBe(true);
    expect(state.activeTab()).toBe('vinted');
  });

  it('schliesst den Fotoguide wieder', () => {
    const state = new PhotoGuideState();
    state.open('ebay');

    state.close();

    expect(state.isOpen()).toBe(false);
  });
});

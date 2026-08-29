import { describe, it, expect } from 'vitest';
import {
  adjustmentRange,
  clampAdjustments,
  defaultAdjustments,
  isDefault,
  looksEqual,
  toFilterString,
  toLook,
} from './adjustments';
import { Adjustments } from '../models/image-adjustments';

describe('Standardwerte', () => {
  it('ist neutral', () => {
    expect(defaultAdjustments()).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      grayscale: 0,
      warmth: 0,
      sharpness: 0,
    });
  });

  it('erkennt die neutralen Werte', () => {
    expect(isDefault(defaultAdjustments())).toBe(true);
  });

  it('erkennt jede einzelne Abweichung', () => {
    const base = defaultAdjustments();
    expect(isDefault({ ...base, brightness: 1.1 })).toBe(false);
    expect(isDefault({ ...base, contrast: 0.9 })).toBe(false);
    expect(isDefault({ ...base, saturation: 1.4 })).toBe(false);
    expect(isDefault({ ...base, grayscale: 0.2 })).toBe(false);
    expect(isDefault({ ...base, warmth: 0.3 })).toBe(false);
    expect(isDefault({ ...base, sharpness: 0.5 })).toBe(false);
  });
});

describe('Werte begrenzen', () => {
  it('haelt jeden Wert in seinem Bereich', () => {
    const extreme: Adjustments = {
      brightness: 99,
      contrast: -5,
      saturation: 42,
      grayscale: -1,
      warmth: 7,
      sharpness: -3,
    };

    expect(clampAdjustments(extreme)).toEqual({
      brightness: 1.5,
      contrast: 0.5,
      saturation: 2,
      grayscale: 0,
      warmth: 1,
      sharpness: 0,
    });
  });

  it('faellt bei unbrauchbaren Zahlen auf den Standard zurueck', () => {
    const broken = {
      brightness: Number.NaN,
      contrast: Number.POSITIVE_INFINITY,
      saturation: 1,
      grayscale: 0,
      warmth: Number.NaN,
      sharpness: 0,
    };

    const result = clampAdjustments(broken);
    expect(result.brightness).toBe(1);
    expect(result.contrast).toBe(1);
    expect(result.warmth).toBe(0);
  });

  it('laesst gueltige Werte unveraendert', () => {
    const valid: Adjustments = {
      brightness: 1.2,
      contrast: 0.8,
      saturation: 1.5,
      grayscale: 0.4,
      warmth: -0.5,
      sharpness: 0.6,
    };
    expect(clampAdjustments(valid)).toEqual(valid);
  });

  it('nennt zu jedem Regler seinen Bereich', () => {
    expect(adjustmentRange('saturation')).toEqual({ min: 0, max: 2, standard: 1 });
    expect(adjustmentRange('grayscale')).toEqual({ min: 0, max: 1, standard: 0 });
    expect(adjustmentRange('warmth')).toEqual({ min: -1, max: 1, standard: 0 });
    expect(adjustmentRange('sharpness')).toEqual({ min: 0, max: 1, standard: 0 });
  });
});

describe('Filterausdruck', () => {
  it('liefert bei neutralen Werten eine leere Zeichenkette', () => {
    expect(toFilterString(defaultAdjustments())).toBe('');
  });

  it('nennt alle vier Werte, sobald einer abweicht', () => {
    const values: Adjustments = {
      ...defaultAdjustments(),
      brightness: 1.2,
    };

    expect(toFilterString(values)).toBe('brightness(1.2) contrast(1) saturate(1) grayscale(0)');
  });

  it('begrenzt vor dem Bilden des Ausdrucks', () => {
    const extreme: Adjustments = { ...defaultAdjustments(), brightness: 99 };

    expect(toFilterString(extreme)).toBe('brightness(1.5) contrast(1) saturate(1) grayscale(0)');
  });
});

describe('Bildwirkung als Ganzes', () => {
  it('ist bei neutralen Werten in jedem Teil leer', () => {
    const look = toLook(defaultAdjustments());

    expect(look).toEqual({ filter: '', warmth: 0, sharpness: 0 });
  });

  // Waerme und Schaerfe sind keine CSS-Filter. Landeten sie versehentlich im
  // Ausdruck, wuerde der Browser den ganzen Filter als ungueltig verwerfen -
  // und damit auch Helligkeit und Kontrast stillschweigend wegfallen lassen.
  it('haelt Waerme und Schaerfe aus dem CSS-Ausdruck heraus', () => {
    const look = toLook({ ...defaultAdjustments(), warmth: 0.5, sharpness: 0.4 });

    expect(look.filter).toBe('');
    expect(look.warmth).toBe(0.5);
    expect(look.sharpness).toBe(0.4);
  });

  it('begrenzt auch hier vor der Weitergabe', () => {
    const look = toLook({ ...defaultAdjustments(), warmth: 99, sharpness: -1 });

    expect(look.warmth).toBe(1);
    expect(look.sharpness).toBe(0);
  });

  // Die Vorschau rendert neu, sobald sich die Bildwirkung aendert. Ohne einen
  // Vergleich nach Werten wuerde jedes neue Objekt einen vollen Durchlauf
  // ausloesen - auch wenn sich gar nichts geaendert hat.
  it('vergleicht zwei Bildwirkungen nach Werten, nicht nach Objekt', () => {
    const a = toLook({ ...defaultAdjustments(), brightness: 1.2, warmth: 0.3 });
    const b = toLook({ ...defaultAdjustments(), brightness: 1.2, warmth: 0.3 });
    const c = toLook({ ...defaultAdjustments(), brightness: 1.2, warmth: 0.4 });

    expect(a).not.toBe(b);
    expect(looksEqual(a, b)).toBe(true);
    expect(looksEqual(a, c)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  adjustmentRange,
  clampAdjustments,
  defaultAdjustments,
  isDefault,
  toFilterString,
} from './adjustments';
import { Adjustments } from '../models/image-adjustments';

describe('Standardwerte', () => {
  it('ist neutral', () => {
    expect(defaultAdjustments()).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      grayscale: 0,
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
  });
});

describe('Werte begrenzen', () => {
  it('haelt jeden Wert in seinem Bereich', () => {
    const extreme: Adjustments = {
      brightness: 99,
      contrast: -5,
      saturation: 42,
      grayscale: -1,
    };

    expect(clampAdjustments(extreme)).toEqual({
      brightness: 1.5,
      contrast: 0.5,
      saturation: 2,
      grayscale: 0,
    });
  });

  it('faellt bei unbrauchbaren Zahlen auf den Standard zurueck', () => {
    const broken = {
      brightness: Number.NaN,
      contrast: Number.POSITIVE_INFINITY,
      saturation: 1,
      grayscale: 0,
    };

    const result = clampAdjustments(broken);
    expect(result.brightness).toBe(1);
    expect(result.contrast).toBe(1);
  });

  it('laesst gueltige Werte unveraendert', () => {
    const valid: Adjustments = { brightness: 1.2, contrast: 0.8, saturation: 1.5, grayscale: 0.4 };
    expect(clampAdjustments(valid)).toEqual(valid);
  });

  it('nennt zu jedem Regler seinen Bereich', () => {
    expect(adjustmentRange('saturation')).toEqual({ min: 0, max: 2, standard: 1 });
    expect(adjustmentRange('grayscale')).toEqual({ min: 0, max: 1, standard: 0 });
  });
});

describe('Filterausdruck', () => {
  it('liefert bei neutralen Werten eine leere Zeichenkette', () => {
    expect(toFilterString(defaultAdjustments())).toBe('');
  });

  it('nennt alle vier Werte, sobald einer abweicht', () => {
    const values: Adjustments = { brightness: 1.2, contrast: 1, saturation: 1, grayscale: 0 };

    expect(toFilterString(values)).toBe('brightness(1.2) contrast(1) saturate(1) grayscale(0)');
  });

  it('begrenzt vor dem Bilden des Ausdrucks', () => {
    const extreme: Adjustments = { brightness: 99, contrast: 1, saturation: 1, grayscale: 0 };

    expect(toFilterString(extreme)).toBe('brightness(1.5) contrast(1) saturate(1) grayscale(0)');
  });
});

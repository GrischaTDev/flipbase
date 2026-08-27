import { describe, expect, it } from 'vitest';
import { platformById } from '../models/platform-profile';
import { planOutput } from './image-renderer';

describe('Bildausgabe planen', () => {
  it('vergrößert einen kleinen quadratischen Ausschnitt nicht', () => {
    expect(planOutput({ x: 20, y: 30, width: 800, height: 800 }, platformById('ebay'))).toEqual({
      source: { x: 20, y: 30, width: 800, height: 800 },
      width: 800,
      height: 800,
    });
  });

  it('verkleinert einen großen Ausschnitt auf die Plattformgrenze', () => {
    expect(
      planOutput({ x: 100, y: 200, width: 2400, height: 1800 }, platformById('kleinanzeigen')),
    ).toEqual({
      source: { x: 100, y: 200, width: 2400, height: 1800 },
      width: 1600,
      height: 1200,
    });
  });

  it('leitet zuerst das Plattformformat aus einem abweichenden Rechteck ab', () => {
    expect(planOutput({ x: 0, y: 0, width: 1200, height: 800 }, platformById('vinted'))).toEqual({
      source: { x: 333.33333333333337, y: 0, width: 533.3333333333333, height: 800 },
      width: 533,
      height: 800,
    });
  });
});

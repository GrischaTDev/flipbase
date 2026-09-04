import { describe, expect, it } from 'vitest';
import { PurchaseTypeLabelPipe } from './purchase-type-label.pipe';

describe('PurchaseTypeLabelPipe', () => {
  it('zeigt Einkaufsarten in der Sprache der Oberfläche an', () => {
    const pipe = new PurchaseTypeLabelPipe();

    expect(pipe.transform('single')).toBe('Normaler Einkauf');
    expect(pipe.transform('mystery_pack')).toBe('Mystery Box');
    expect(pipe.transform('lot')).toBe('Konvolut');
    expect(pipe.transform('pallet')).toBe('Palette');
  });
});

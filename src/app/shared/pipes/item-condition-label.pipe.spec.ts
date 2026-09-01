import { describe, expect, it } from 'vitest';
import { ItemConditionLabelPipe } from './item-condition-label.pipe';

describe('ItemConditionLabelPipe', () => {
  it('übersetzt alle Zustände in klare deutsche Bezeichnungen', () => {
    const pipe = new ItemConditionLabelPipe();

    expect(pipe.transform('new')).toBe('Neu');
    expect(pipe.transform('like_new')).toBe('Wie neu');
    expect(pipe.transform('very_good')).toBe('Sehr gut');
    expect(pipe.transform('used')).toBe('Gebraucht');
    expect(pipe.transform('heavily_used')).toBe('Stark gebraucht');
    expect(pipe.transform('defective')).toBe('Defekt / Ersatzteil');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { nextLabelRevisionState } from './brand-label-revision';
import type { LabelRevisionState } from './brand-label.models';

describe('Revisionszustände', () => {
  const expected = {
    draft: { save: 'draft', submit: 'review', discard: 'discarded' },
    review: { save: 'draft', submit: 'review', publish: 'published', discard: 'discarded' },
    published: {},
    discarded: {},
  } as const;
  for (const state of ['draft', 'review', 'published', 'discarded'] as const) {
    for (const action of ['save', 'submit', 'publish', 'discard'] as const) {
      const target = (expected[state] as Partial<Record<typeof action, LabelRevisionState>>)[action];
      it(`${state} + ${action} ${target ? `führt zu ${target}` : 'ist gesperrt'}`, () => {
        if (target) assert.equal(nextLabelRevisionState(state, action), target);
        else assert.throws(() => nextLabelRevisionState(state, action), /invalid-revision-transition/);
      });
    }
  }
});

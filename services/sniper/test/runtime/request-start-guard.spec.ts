import { describe, expect, it } from 'vitest';
import { RequestBudget, RequestBudgetUnavailableError } from '../../src/runtime/budget.js';
import { RequestStartGuard, RequestPausedError } from '../../src/runtime/request-start-guard.js';

describe('shared request start guard', () => {
  it('blocks queued automatic starts after rejection and allows a later authorized cycle', () => {
    const guard = new RequestStartGuard(new RequestBudget(24));
    expect(() => guard.assertCanStart()).not.toThrow();
    guard.pause();
    expect(() => guard.assertCanStart()).toThrow(RequestPausedError);
    guard.allowAutomatic();
    expect(() => guard.assertCanStart()).not.toThrow();
  });
  it('permits only the scoped operator verification and retains the automatic pause', () => {
    const guard = new RequestStartGuard(new RequestBudget(24));
    guard.pause();
    guard.beginOperatorVerification();
    expect(() => guard.assertCanStart()).not.toThrow();
    guard.endOperatorVerification();
    expect(() => guard.assertCanStart()).toThrow(RequestPausedError);
  });
  it('never bypasses the common minute budget during a manual verification', () => {
    const budget = new RequestBudget(1);
    budget.record();
    const guard = new RequestStartGuard(budget);
    guard.beginOperatorVerification();
    expect(() => guard.assertCanStart()).toThrow(RequestBudgetUnavailableError);
  });
});

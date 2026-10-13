import { describe, expect, it } from 'vitest';
import { isPermanentPurchaseFailure } from './purchase-buffer-failure';

describe('purchase buffer failure classification', () => {
  it.each(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '08006', '53300', '57P01'])(
    'retries temporary database failure %s',
    (code) => {
      expect(isPermanentPurchaseFailure({ code })).toBe(false);
    },
  );
  it.each(['42501', '23514', '22023', 'PGRST301', 'PGRST116'])(
    'stops invalid or unauthorized request %s',
    (code) => {
      expect(isPermanentPurchaseFailure({ code })).toBe(true);
    },
  );
  it.each([408, 429, 503, 504])('retries transient HTTP status %i', (status) => {
    expect(isPermanentPurchaseFailure({ status })).toBe(false);
  });
  it.each([400, 401, 403, 422])(
    'stops terminal HTTP status %i through wrapped errors',
    (status) => {
      expect(isPermanentPurchaseFailure(new Error('upload', { cause: { status } }))).toBe(true);
    },
  );
});

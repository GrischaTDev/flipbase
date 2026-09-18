import { expect, test } from '@playwright/test';
import { assertLocalSupabaseUrl } from './support/local-supabase';

test('lässt Browser-Tests nur gegen die lokale Supabase laufen', () => {
  expect(assertLocalSupabaseUrl('http://127.0.0.1:54351')).toBe('http://127.0.0.1:54351');
  expect(assertLocalSupabaseUrl('http://localhost:54321')).toBe('http://localhost:54321');
  expect(() => assertLocalSupabaseUrl('https://abcdefgh.supabase.co')).toThrow(
    'nur gegen die lokale Supabase',
  );
});

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  assertLocalSupabaseUrl,
  createAnonClient,
  createLocalAdminClient,
} from './support/local-supabase';

test('lässt Browser-Tests nur gegen die lokale Supabase laufen', () => {
  expect(assertLocalSupabaseUrl('http://127.0.0.1:54351')).toBe('http://127.0.0.1:54351');
  expect(assertLocalSupabaseUrl('http://localhost:54321')).toBe('http://localhost:54321');
  expect(() => assertLocalSupabaseUrl('https://abcdefgh.supabase.co')).toThrow(
    'nur gegen die lokale Supabase',
  );
});

test('sperrt freie Registrierung und erlaubt Betreiber-Einladungen @pr-smoke', async () => {
  const email = `e2e-invite-${randomUUID()}@flipbase.local`;
  const password = randomUUID();
  const signup = await createAnonClient().auth.signUp({ email, password });
  expect(signup.error?.message).toMatch(/signups not allowed/iu);

  const admin = createLocalAdminClient();
  const invitation = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'http://127.0.0.1:4200/auth/set-password',
  });
  expect(invitation.error).toBeNull();
  expect(invitation.data.user?.email).toBe(email);
  if (invitation.data.user) await admin.auth.admin.deleteUser(invitation.data.user.id);
});

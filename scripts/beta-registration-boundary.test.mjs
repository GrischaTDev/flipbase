import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('allows new beta accounts only through operator invitations', async () => {
  const [config, routes, loginTemplate, inviteFunction] = await Promise.all([
    readFile('supabase/config.toml', 'utf8'),
    readFile('src/app/app.routes.ts', 'utf8'),
    readFile('src/app/features/auth/login/login.component.html', 'utf8'),
    readFile('supabase/functions/beta-invite/index.ts', 'utf8'),
  ]);

  const authSection = config.match(/\[auth\]([\s\S]*?)(?=\n\[)/u)?.[1] ?? '';
  assert.match(authSection, /\nenable_signup = false\n/u);
  assert.match(routes, /path: 'register',[\s\S]*?redirectTo: 'login',[\s\S]*?pathMatch: 'full'/u);
  assert.doesNotMatch(loginTemplate, /\/auth\/register/u);
  assert.match(routes, /path: 'set-password'/u);
  assert.match(inviteFunction, /inviteUserByEmail/u);
});

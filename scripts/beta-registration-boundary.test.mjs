import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('allows new beta accounts only through operator invitations', async () => {
  const [
    config,
    productionOverride,
    deploymentGuide,
    packageJson,
    routes,
    loginTemplate,
    inviteFunction,
  ] = await Promise.all([
    readFile('supabase/config.toml', 'utf8'),
    readFile('deploy/docker-compose.beta-application.yml', 'utf8'),
    readFile('deploy/README.md', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('src/app/app.routes.ts', 'utf8'),
    readFile('src/app/features/auth/login/login.component.html', 'utf8'),
    readFile('supabase/functions/beta-invite/index.ts', 'utf8'),
  ]);

  const authSection = config.match(/\[auth\]([\s\S]*?)(?=\n\[)/u)?.[1] ?? '';
  assert.match(authSection, /\nenable_signup = false\n/u);
  assert.match(authSection, /additional_redirect_urls[^\n]*\/auth\/set-password/u);
  assert.match(productionOverride, /auth:\s+[\s\S]*?GOTRUE_DISABLE_SIGNUP:\s*["']true["']/u);
  assert.match(
    productionOverride,
    /BETA_APP_URL:\s*\$\{BETA_APP_URL:-https:\/\/app\.flipbase\.de\}/u,
  );
  assert.match(
    deploymentGuide,
    /supabase\/functions\/[\s\S]*?beta-application[\s\S]*?beta-invite[\s\S]*?_shared/u,
  );
  assert.match(deploymentGuide, /force-recreate functions auth/u);
  assert.match(
    deploymentGuide,
    /ADDITIONAL_REDIRECT_URLS=https:\/\/app\.flipbase\.de\/auth\/set-password/u,
  );
  assert.match(routes, /path: 'register',[\s\S]*?redirectTo: 'login',[\s\S]*?pathMatch: 'full'/u);
  assert.doesNotMatch(loginTemplate, /\/auth\/register/u);
  assert.match(routes, /path: 'set-password'/u);
  assert.match(inviteFunction, /inviteUserByEmail/u);
  assert.match(JSON.parse(packageJson).scripts.verify, /npm run test:edge/u);
});

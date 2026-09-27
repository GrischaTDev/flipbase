export interface MarketplaceBrowserServerConfig {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  goLoginToken: string;
  host: string;
  port: number;
}

export function marketplaceBrowserServerConfig(
  environment: NodeJS.ProcessEnv,
): MarketplaceBrowserServerConfig {
  if (environment['MARKETPLACE_BROWSER_TEST_ENABLED'] !== '1')
    throw new Error('Browser-Testdienst ist nicht freigegeben');
  const supabaseUrl = environment['SUPABASE_URL'];
  const publishableKey = environment['SUPABASE_ANON_KEY'];
  const serviceRoleKey = environment['SUPABASE_SERVICE_ROLE_KEY'];
  const goLoginToken = environment['GOLOGIN_API_TOKEN'];
  const port = Number(environment['MARKETPLACE_BROWSER_PORT'] ?? '4179');
  if (
    !supabaseUrl ||
    !publishableKey ||
    !serviceRoleKey ||
    !goLoginToken ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error('Browser-Testdienst ist unvollständig konfiguriert');
  try {
    const url = new URL(supabaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Ungültige URL');
  } catch {
    throw new Error('Browser-Testdienst hat eine ungültige Datenbankadresse');
  }
  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    goLoginToken,
    host: environment['MARKETPLACE_BROWSER_HOST'] ?? '127.0.0.1',
    port,
  };
}

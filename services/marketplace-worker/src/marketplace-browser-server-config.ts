export interface MarketplaceBrowserServerConfig {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  provider: 'local' | 'gologin';
  goLoginToken?: string;
  publicTestUrl?: string;
  host: string;
  port: number;
  scheduledSyncEnabled: boolean;
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
  const provider = environment['MARKETPLACE_BROWSER_PROVIDER'] ?? 'local';
  const scheduledFlag =
    environment['MARKETPLACE_SCHEDULED_SYNC_ENABLED'] ?? (provider === 'gologin' ? '1' : '0');
  if (scheduledFlag !== '0' && scheduledFlag !== '1')
    throw new Error('Automatische Aktualisierung ist ungültig konfiguriert');
  if (scheduledFlag === '1' && provider !== 'gologin')
    throw new Error('Automatische Aktualisierung benötigt den Cloudbetrieb');
  const publicTestUrl = environment['MARKETPLACE_BROWSER_PUBLIC_TEST_URL'];
  const port = Number(environment['MARKETPLACE_BROWSER_PORT'] ?? '4179');
  if (
    !supabaseUrl ||
    !publishableKey ||
    !serviceRoleKey ||
    (provider !== 'local' && provider !== 'gologin') ||
    (provider === 'gologin' && !goLoginToken) ||
    (provider === 'local' && !publicTestUrl) ||
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
  if (provider === 'local') {
    try {
      const url = new URL(publicTestUrl!);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'www.vinted.de' ||
        !/^\/member\/[0-9]+-[a-zA-Z0-9_-]+$/.test(url.pathname) ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        throw new Error('Ungültige Testseite');
    } catch {
      throw new Error('Browser-Testdienst hat eine ungültige öffentliche Testseite');
    }
  }
  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    provider,
    goLoginToken,
    publicTestUrl,
    host: environment['MARKETPLACE_BROWSER_HOST'] ?? '127.0.0.1',
    port,
    scheduledSyncEnabled: scheduledFlag === '1',
  };
}

export interface MarketplaceBrowserServerConfig {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  provider: 'local' | 'gologin' | 'chromium';
  goLoginToken?: string;
  publicTestUrl?: string;
  host: string;
  port: number;
  scheduledSyncEnabled: boolean;
  serverProfileRoot?: string;
  chromiumHostProfileRoot?: string;
  chromiumHostId?: string;
  chromiumImage?: string;
  chromiumNetwork?: string;
  chromiumNetworkId?: string;
  chromiumNetworkFile?: string;
  ipRoyalApiToken?: string;
  chromiumSeccompProfile?: string;
  chromiumWritesEnabled?: boolean;
}

function privateLinuxPath(path: string | undefined): path is string {
  return Boolean(
    path &&
    path.startsWith('/') &&
    path !== '/' &&
    !path.includes('\0') &&
    !path.split('/').some((part) => part === '..' || part === '.'),
  );
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
  if (scheduledFlag === '1' && provider === 'local')
    throw new Error('Automatische Aktualisierung benötigt den Cloudbetrieb');
  const publicTestUrl = environment['MARKETPLACE_BROWSER_PUBLIC_TEST_URL'];
  const port = Number(environment['MARKETPLACE_BROWSER_PORT'] ?? '4179');
  if (
    !supabaseUrl ||
    !publishableKey ||
    !serviceRoleKey ||
    (provider !== 'local' && provider !== 'gologin' && provider !== 'chromium') ||
    (provider === 'gologin' && !goLoginToken) ||
    (provider === 'local' && !publicTestUrl) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error('Browser-Testdienst ist unvollständig konfiguriert');
  const serverProfileRoot = environment['MARKETPLACE_BROWSER_PROFILE_ROOT'];
  const chromiumHostProfileRoot = environment['MARKETPLACE_CHROMIUM_HOST_PROFILE_ROOT'];
  const chromiumHostId = environment['MARKETPLACE_CHROMIUM_HOST_ID'];
  const chromiumImage = environment['MARKETPLACE_CHROMIUM_IMAGE'];
  const chromiumNetwork = environment['MARKETPLACE_CHROMIUM_NETWORK'];
  const chromiumNetworkId = environment['MARKETPLACE_CHROMIUM_NETWORK_ID'] ?? 'direct';
  const chromiumNetworkFile = environment['MARKETPLACE_CHROMIUM_NETWORK_FILE'];
  const ipRoyalApiToken = environment['IPROYAL_API_TOKEN'];
  const chromiumWritesFlag = environment['MARKETPLACE_CHROMIUM_WRITES_ENABLED'] ?? '0';
  const chromiumSeccompProfile =
    environment['MARKETPLACE_CHROMIUM_SECCOMP_PROFILE'] ??
    '/opt/flipbase-marketplace/chromium-seccomp.json';
  if (
    provider === 'chromium' &&
    (environment['MARKETPLACE_CHROMIUM_PILOT_ENABLED'] !== '1' ||
      !privateLinuxPath(serverProfileRoot) ||
      !privateLinuxPath(chromiumHostProfileRoot) ||
      !chromiumHostId ||
      !/^[a-z][a-z0-9-]{1,63}$/.test(chromiumHostId) ||
      !chromiumImage ||
      !/^ghcr\.io\/grischatdev\/flipbase-chromium-session(?::sha-[a-f0-9]{40}|@sha256:[a-f0-9]{64})$/.test(
        chromiumImage,
      ) ||
      chromiumNetwork !== 'flipbase-browser' ||
      (chromiumWritesFlag !== '0' && chromiumWritesFlag !== '1') ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(chromiumNetworkId) ||
      (chromiumNetworkId !== 'direct' && !chromiumNetworkFile) ||
      (ipRoyalApiToken !== undefined && (!ipRoyalApiToken.trim() || !chromiumNetworkFile)) ||
      (chromiumNetworkFile !== undefined && !privateLinuxPath(chromiumNetworkFile)) ||
      !privateLinuxPath(chromiumSeccompProfile))
  )
    throw new Error('Chromium-Pilot ist unvollständig oder unsicher konfiguriert');
  try {
    const url = new URL(supabaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Ungültige URL');
  } catch {
    throw new Error('Browser-Testdienst hat eine ungültige Datenbankadresse');
  }
  if (provider === 'local') {
    try {
      if (!publicTestUrl) throw new Error('Testseite fehlt');
      const url = new URL(publicTestUrl);
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
    ...(provider === 'chromium'
      ? {
          serverProfileRoot,
          chromiumHostProfileRoot,
          chromiumHostId,
          chromiumImage,
          chromiumNetwork,
          chromiumNetworkId,
          chromiumNetworkFile,
          ipRoyalApiToken,
          chromiumSeccompProfile,
          chromiumWritesEnabled: chromiumWritesFlag === '1',
        }
      : {}),
  };
}

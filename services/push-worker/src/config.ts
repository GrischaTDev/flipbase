export interface PushWorkerConfig {
  enabled: boolean;
  allowAll: boolean;
  pilotUsers: string[];
  pilotDevices: string[];
  supabaseUrl: string;
  serviceKey: string;
  publicKey: string;
  privateKey: string;
  subject: string;
  keyId: string;
  commit: string;
  port: number;
  observerUrl: string;
}
function readIdentifiers(input: string | undefined): string[] {
  const ids = (input ?? '')
    .split(',')
    .map((identifier) => identifier.trim())
    .filter(Boolean);
  if (
    ids.length > 100 ||
    ids.some(
      (identifier) =>
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(
          identifier,
        ),
    )
  )
    throw new Error('Invalid pilot configuration');
  return ids;
}
export function readConfig(environment: NodeJS.ProcessEnv = process.env): PushWorkerConfig {
  for (const flag of ['WEB_PUSH_ENABLED', 'WEB_PUSH_ALLOW_ALL'])
    if (environment[flag] && !['true', 'false'].includes(environment[flag] ?? ''))
      throw new Error('Invalid push switch');
  const enabled = environment.WEB_PUSH_ENABLED === 'true';
  const port = Number(environment.WEB_PUSH_HEALTH_PORT ?? 4177);
  const config = {
    enabled,
    allowAll: environment.WEB_PUSH_ALLOW_ALL === 'true',
    pilotUsers: readIdentifiers(environment.WEB_PUSH_PILOT_USER_IDS),
    pilotDevices: readIdentifiers(environment.WEB_PUSH_PILOT_DEVICE_IDS),
    supabaseUrl: environment.SUPABASE_URL ?? '',
    serviceKey: environment.SUPABASE_SERVICE_ROLE_KEY ?? '',
    publicKey: environment.WEB_PUSH_VAPID_PUBLIC_KEY ?? '',
    privateKey: environment.WEB_PUSH_VAPID_PRIVATE_KEY ?? '',
    subject: environment.WEB_PUSH_VAPID_SUBJECT ?? '',
    keyId: environment.WEB_PUSH_VAPID_KEY_ID ?? '',
    commit: environment.FLIPBASE_COMMIT ?? '',
    port,
    observerUrl: environment.WEB_PUSH_OBSERVER_URL ?? '',
  };
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid health port');
  if (config.observerUrl && config.observerUrl !== 'http://push-functions:9000/ebay-order-observer')
    throw new Error('Invalid internal observer URL');
  if (enabled) {
    const backend = new URL(config.supabaseUrl);
    if (
      backend.protocol !== 'https:' ||
      backend.username ||
      backend.password ||
      backend.search ||
      backend.hash ||
      backend.pathname !== '/' ||
      !config.serviceKey ||
      !/^[A-Za-z0-9_-]{87}$/u.test(config.publicKey) ||
      !/^[A-Za-z0-9_-]{43}$/u.test(config.privateKey) ||
      !/^[A-Za-z0-9_-]{1,64}$/u.test(config.keyId) ||
      !/^(mailto:|https:\/\/)/u.test(config.subject)
    )
      throw new Error('Incomplete push configuration');
  }
  return config;
}

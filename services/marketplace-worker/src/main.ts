import { GoLoginCloudBrowser } from './gologin-cloud-browser.ts';
import { GoLoginProfileProvisioner } from './gologin-profile-provisioner.ts';
import { LocalPlaywrightBrowser } from './local-playwright-browser.ts';
import {
  MarketplaceBrowserRecovery,
  SupabaseBrowserRecoveryStore,
} from './marketplace-browser-recovery.ts';
import {
  MarketplaceBrowserHttpApi,
  SupabaseBrowserUserVerifier,
} from './marketplace-browser-http-api.ts';
import { marketplaceBrowserServerConfig } from './marketplace-browser-server-config.ts';
import { MarketplaceBrowserSessionBroker } from './marketplace-browser-session-broker.ts';
import { SupabaseBrowserSessionStore } from './supabase-browser-session-store.ts';
import { SupabaseVintedAccountWriter } from './supabase-vinted-account-writer.ts';

async function main(): Promise<void> {
  const config = marketplaceBrowserServerConfig(process.env);
  const browser =
    config.provider === 'local'
      ? new LocalPlaywrightBrowser(config.publicTestUrl!)
      : new GoLoginCloudBrowser({
          token: config.goLoginToken!,
          startUrl: 'https://www.vinted.de/',
        });
  const leases = new SupabaseBrowserSessionStore({
    url: config.supabaseUrl,
    publishableKey: config.publishableKey,
    serviceRoleKey: config.serviceRoleKey,
  });
  const recovery = new MarketplaceBrowserRecovery(
    new SupabaseBrowserRecoveryStore({
      url: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
    }),
    browser,
  );
  const broker = new MarketplaceBrowserSessionBroker({
    leases,
    profiles: leases,
    browsers: browser,
    recovery,
  });
  await broker.ready();
  const server = new MarketplaceBrowserHttpApi({
    broker,
    users: new SupabaseBrowserUserVerifier(config.supabaseUrl, config.publishableKey),
    profiles:
      config.provider === 'gologin'
        ? new GoLoginProfileProvisioner({
            supabaseUrl: config.supabaseUrl,
            publishableKey: config.publishableKey,
            serviceRoleKey: config.serviceRoleKey,
            goLoginToken: config.goLoginToken!,
          })
        : undefined,
    accounts:
      config.provider === 'gologin'
        ? new SupabaseVintedAccountWriter({
            url: config.supabaseUrl,
            serviceRoleKey: config.serviceRoleKey,
          })
        : undefined,
    readOnly: config.provider === 'local',
  }).createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  let reconciling = false;
  const interval = setInterval(() => {
    if (reconciling) return;
    reconciling = true;
    void broker
      .reconcile()
      .catch(() => undefined)
      .finally(() => {
        reconciling = false;
      });
  }, 30_000);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(interval);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await broker.shutdown();
  };
  process.once(
    'SIGINT',
    () =>
      void stop().catch(() => {
        process.exitCode = 1;
      }),
  );
  process.once(
    'SIGTERM',
    () =>
      void stop().catch(() => {
        process.exitCode = 1;
      }),
  );
}

void main().catch(() => {
  // Anbieterantworten und Umgebungswerte dürfen nie im Prozesslog erscheinen.
  process.exitCode = 1;
});

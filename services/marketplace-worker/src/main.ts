import { GoLoginCloudBrowser } from './gologin-cloud-browser.ts';
import { GoLoginProfileProvisioner } from './gologin-profile-provisioner.ts';
import { join } from 'node:path';
import { ChromiumAccountProfileRegistry } from './chromium-account-profile-registry.ts';
import { ChromiumBoundProfileStore } from './chromium-bound-profile-store.ts';
import { ChromiumContainerLauncher } from './chromium-container-launcher.ts';
import { ChromiumNetworkProfiles } from './chromium-network-profiles.ts';
import { ChromiumPersistentBrowser } from './chromium-persistent-browser.ts';
import { ChromiumProfileProvisioner } from './chromium-profile-provisioner.ts';
import { ChromiumProfileStore } from './chromium-profile-store.ts';
import { MarketplaceProfileBrowser } from './marketplace-profile-browser.ts';
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
import { SupabaseVintedImportWriter } from './supabase-vinted-import-writer.ts';
import { VintedEditAccess } from './vinted-edit-access.ts';
import { MarketplaceSyncRunner } from './marketplace-sync-runner.ts';
import { SupabaseMarketplaceOperationStore } from './supabase-marketplace-operation-store.ts';
import { SupabaseVintedListingCache } from './supabase-vinted-listing-cache.ts';
import { SupabaseVintedProfileCache } from './supabase-vinted-profile-cache.ts';
import { MarketplaceSyncDispatcher } from './marketplace-sync-dispatcher.ts';
import { SupabaseMarketplaceSyncDispatchStore } from './supabase-marketplace-sync-dispatch-store.ts';

async function main(): Promise<void> {
  const config = marketplaceBrowserServerConfig(process.env);
  const goLogin = config.goLoginToken
    ? new GoLoginCloudBrowser({ token: config.goLoginToken, startUrl: 'https://www.vinted.de/' })
    : undefined;
  const legacyProfiles = config.goLoginToken
    ? new GoLoginProfileProvisioner({
        supabaseUrl: config.supabaseUrl,
        publishableKey: config.publishableKey,
        serviceRoleKey: config.serviceRoleKey,
        goLoginToken: config.goLoginToken,
      })
    : undefined;
  let browser: LocalPlaywrightBrowser | GoLoginCloudBrowser | MarketplaceProfileBrowser;
  let profiles: GoLoginProfileProvisioner | ChromiumProfileProvisioner | undefined;
  let registry: ChromiumAccountProfileRegistry | undefined;
  if (config.provider === 'local') {
    if (!config.publicTestUrl) throw new Error('Öffentliche Testseite fehlt');
    browser = new LocalPlaywrightBrowser(config.publicTestUrl);
  } else if (config.provider === 'gologin') {
    if (!goLogin || !legacyProfiles) throw new Error('GoLogin-Zugang fehlt');
    browser = goLogin;
    profiles = legacyProfiles;
  } else {
    if (
      !config.serverProfileRoot ||
      !config.chromiumHostProfileRoot ||
      !config.chromiumHostId ||
      !config.chromiumImage ||
      !config.chromiumNetwork ||
      !config.chromiumNetworkId
    )
      throw new Error('Chromium-Konfiguration fehlt');
    const chromiumRegistry = new ChromiumAccountProfileRegistry({
      root: config.serverProfileRoot,
      hostId: config.chromiumHostId,
      networkId: config.chromiumNetworkId,
    });
    registry = chromiumRegistry;
    const networks = await ChromiumNetworkProfiles.load(config.chromiumNetworkFile);
    networks.resolve(config.chromiumNetworkId);
    const launcher = new ChromiumContainerLauncher({
      image: config.chromiumImage,
      profileRoot: join(config.serverProfileRoot, 'profiles'),
      hostProfileRoot: config.chromiumHostProfileRoot,
      hostId: config.chromiumHostId,
      network: config.chromiumNetwork,
      seccompProfile: config.chromiumSeccompProfile,
    });
    const chromium = new ChromiumPersistentBrowser({
      profileStore: new ChromiumProfileStore({
        root: join(config.serverProfileRoot, 'profiles'),
        inspectProfileProcesses: (directory) => launcher.inspectProfileProcesses(directory),
      }),
      network: {
        resolve: async (profileId) =>
          networks.resolve((await chromiumRegistry.resolve(profileId)).networkId),
      },
      launch: (directory, settings) => launcher.launch(directory, settings ?? {}),
      recoverRuntime: (profileId) => launcher.recover(profileId),
    });
    browser = new MarketplaceProfileBrowser({ chromium, goLogin });
    profiles = new ChromiumProfileProvisioner({
      supabaseUrl: config.supabaseUrl,
      publishableKey: config.publishableKey,
      serviceRoleKey: config.serviceRoleKey,
      registry: chromiumRegistry,
      legacy: legacyProfiles,
      stopProfile: (profileId) => browser.stop(profileId),
    });
  }
  const isCloud = config.provider !== 'local';
  const dispatchStore = isCloud
    ? new SupabaseMarketplaceSyncDispatchStore({
        url: config.supabaseUrl,
        serviceRoleKey: config.serviceRoleKey,
      })
    : undefined;
  let syncRunner: MarketplaceSyncRunner | undefined;
  const workerLifecycle: { stop?: () => Promise<void> } = {};
  const dispatcher = dispatchStore
    ? new MarketplaceSyncDispatcher({
        store: dispatchStore,
        includeScheduled: config.scheduledSyncEnabled,
        maxJobsPerPoll: 32,
        run: (scope) => {
          if (!syncRunner) return Promise.reject(new Error('Abrufdienst ist noch nicht bereit'));
          return syncRunner.runDispatched(scope);
        },
        onRuntimeLost: () => {
          void Promise.resolve()
            .then(async () => {
              await workerLifecycle.stop?.();
            })
            .finally(() => process.exit(1));
        },
      })
    : undefined;
  // Erst die alleinige Runtime beanspruchen; ein zweiter Prozess darf keine Recovery ausführen.
  const runtime = await dispatcher?.initialize();
  dispatcher?.startMonitoring();
  const leases = new SupabaseBrowserSessionStore({
    url: config.supabaseUrl,
    publishableKey: config.publishableKey,
    serviceRoleKey: config.serviceRoleKey,
    runtime,
    onReservationUncertain: dispatcher ? () => dispatcher.invalidate() : undefined,
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
    profiles: registry ? new ChromiumBoundProfileStore({ profiles: leases, registry }) : leases,
    browsers: browser,
    recovery,
    authorizeRuntime: dispatcher ? () => dispatcher.heartbeat() : undefined,
  });
  await broker.ready();
  const importWriter = isCloud
    ? new SupabaseVintedImportWriter({
        url: config.supabaseUrl,
        publishableKey: config.publishableKey,
        serviceRoleKey: config.serviceRoleKey,
      })
    : undefined;
  const operationStore = isCloud
    ? new SupabaseMarketplaceOperationStore({
        url: config.supabaseUrl,
        publishableKey: config.publishableKey,
        serviceRoleKey: config.serviceRoleKey,
      })
    : undefined;
  if (dispatchStore && runtime) await dispatchStore.recover(runtime.workerId, runtime.workerEpoch);
  if (importWriter && operationStore)
    syncRunner = new MarketplaceSyncRunner(broker, importWriter, operationStore, undefined, () => {
      void dispatcher?.poll().catch(() => undefined);
    });
  const server = new MarketplaceBrowserHttpApi({
    broker,
    users: new SupabaseBrowserUserVerifier(config.supabaseUrl, config.publishableKey),
    profiles,
    accounts: isCloud
      ? new SupabaseVintedAccountWriter({
          url: config.supabaseUrl,
          serviceRoleKey: config.serviceRoleKey,
        })
      : undefined,
    imports: importWriter,
    operations: syncRunner,
    listingCache: isCloud
      ? new SupabaseVintedListingCache({
          url: config.supabaseUrl,
          serviceRoleKey: config.serviceRoleKey,
        })
      : undefined,
    profileCache: isCloud
      ? new SupabaseVintedProfileCache({
          url: config.supabaseUrl,
          serviceRoleKey: config.serviceRoleKey,
        })
      : undefined,
    edits:
      config.provider === 'gologin' || config.chromiumWritesEnabled
        ? new VintedEditAccess({
            url: config.supabaseUrl,
            publishableKey: config.publishableKey,
          })
        : undefined,
    readOnly: config.provider === 'local',
    scheduledSync: dispatcher
      ? () => ({
          enabled: dispatcher.scheduledEnabled,
          authorizationVersion: 2,
          allowedIntervals: [3, 5, 10, 15, 30, 60],
        })
      : undefined,
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
    dispatcher?.stop();
    clearInterval(interval);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dispatcher?.drain();
    const cleanup = await Promise.allSettled([broker.shutdown()]);
    await dispatcher?.release();
    if (cleanup.some((result) => result.status === 'rejected'))
      throw new Error('Browser-Stopp fehlgeschlagen');
  };
  workerLifecycle.stop = stop;
  dispatcher?.start();
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
  // Auch ein während der Recovery bereits laufender Heartbeat darf den Fehlstart nicht offen halten.
  process.exit(1);
});

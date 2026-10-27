import type { VintedPublicationVersion } from './vinted-publication-age.ts';
import { chromium, type Browser } from 'playwright';
import { currentVintedPage, vintedBrowserActions } from './vinted-browser-actions.ts';
import {
  type VintedAccountImport,
  type VintedConversationVersion,
  type VintedConversationReadTarget,
} from './vinted-account-import.ts';
import { type VintedAccountIdentity } from './vinted-browser-reader.ts';
import { type VintedLoginCredentials, type VintedLoginResult } from './vinted-browser-login.ts';
import { type VintedVerificationResult } from './vinted-browser-verification.ts';
import {
  type VintedListingEditFields,
  type VintedEditResult,
} from './vinted-browser-listing-edit.ts';
import type {
  MarketplaceMessageCommand,
  MarketplaceMessageResult,
  MarketplaceFavoriteMessageCommand,
  MarketplaceFavoriteMessageResult,
  MarketplaceFavoriteOfferCommand,
  MarketplaceFavoriteOfferResult,
} from '../../../supabase/functions/_shared/marketplace-message-contracts.d.ts';
import type {
  MarketplaceNegotiationCommand,
  MarketplaceNegotiationOffer,
  MarketplaceNegotiationResult,
} from '../../../supabase/functions/_shared/marketplace-negotiation-contracts.d.ts';
import type { ConfirmedNegotiationOffer } from './vinted-negotiation-contracts.ts';
import type { VintedFavoriteEvent } from './vinted-browser-favorites.ts';
import type { MarketplaceListingPhoto } from './marketplace-listing-photo.ts';

export type BrowserConnection = Pick<Browser, 'close' | 'version'> &
  Partial<Pick<Browser, 'contexts' | 'newBrowserCDPSession'>>;
export interface BrowserDragPoint {
  x: number;
  y: number;
  elapsedMs: number;
}

export interface BrowserInfo extends Pick<Browser, 'version'> {
  submitListing?(
    accountId: string,
    action: 'publish' | 'vinted_draft',
    snapshot: import('../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts').MarketplaceListingSnapshot,
    beforeWrite: () => Promise<void>,
    authorize: () => Promise<void>,
    loadPhoto: (imageId: string) => Promise<MarketplaceListingPhoto>,
    categoryPath: readonly number[],
  ): Promise<
    import('../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts').MarketplaceListingResult
  >;
  sendNegotiation?(
    accountId: string,
    command: MarketplaceNegotiationCommand,
    sourceOffer: MarketplaceNegotiationOffer | null,
    confirmedOffer: ConfirmedNegotiationOffer | null,
    authorize: () => Promise<void>,
  ): Promise<MarketplaceNegotiationResult>;
  readFavoriteEvents?(
    accountId: string,
    authorize: () => Promise<void>,
  ): Promise<VintedFavoriteEvent[]>;
  sendFavoriteMessage?(
    accountId: string,
    command: MarketplaceFavoriteMessageCommand,
    authorize: () => Promise<void>,
  ): Promise<MarketplaceFavoriteMessageResult>;
  sendFavoriteOffer?(
    accountId: string,
    command: MarketplaceFavoriteOfferCommand,
    authorize: () => Promise<void>,
    confirmPrice: (original: number, offered: number) => Promise<boolean>,
  ): Promise<MarketplaceFavoriteOfferResult>;
  sendMessage?(
    accountId: string,
    command: MarketplaceMessageCommand,
    authorize: () => Promise<void>,
  ): Promise<MarketplaceMessageResult>;
  initialize?(): Promise<void>;
  capture?(): Promise<Uint8Array>;
  click?(xRatio: number, yRatio: number): Promise<void>;
  drag?(points: BrowserDragPoint[]): Promise<void>;
  type?(value: string): Promise<void>;
  press?(key: 'Enter' | 'Tab' | 'Escape' | 'Backspace'): Promise<void>;
  identify?(): Promise<VintedAccountIdentity | null>;
  importAccount?(
    authorize: () => Promise<void>,
    onStage?: (stage: 'profile' | 'publications' | 'conversations' | 'sales') => Promise<void>,
    previousConversations?: VintedConversationVersion[],
    requestedConversation?: VintedConversationReadTarget,
    previousPublications?: VintedPublicationVersion[],
  ): Promise<VintedAccountImport>;
  login?(
    credentials: VintedLoginCredentials,
    authorize: () => Promise<void>,
  ): Promise<VintedLoginResult>;
  verify?(code: string, authorize: () => Promise<void>): Promise<VintedVerificationResult>;
  readListingEdit?(itemId: string, accountId: string): Promise<VintedListingEditFields>;
  readListingCategory?(
    accountId: string,
    categoryId: number,
    categoryPath: readonly number[],
    authorize: () => Promise<void>,
  ): Promise<
    import('../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts').VintedListingCategoryFields
  >;
  /** Vollständiger Iststand eines eigenen Inserats aus einer eigenen, danach geschlossenen Seite. */
  readListingContent?(
    accountId: string,
    externalId: string,
    authorize: () => Promise<void>,
  ): Promise<
    import('../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts').VintedListingCurrentContent
  >;
  /**
   * Ändert ein eigenes Inserat ohne Kategorie; bestätigt nur nach erneutem Abruf. Mit `photos`
   * werden vorhandene Fotos entfernt oder umsortiert, neue Fotos sind nicht möglich.
   */
  updateListingContent?(
    accountId: string,
    externalId: string,
    base: import('../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts').VintedListingContent,
    desired: import('../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts').VintedListingContent,
    authorize: () => Promise<void>,
    photos?: import('./vinted-browser-listing-photo-order.ts').VintedListingPhotoArrangement,
  ): Promise<VintedEditResult>;
  updateListingPrice?(
    itemId: string,
    accountId: string,
    expectedPriceCents: number,
    priceCents: number,
    authorize: () => Promise<void>,
  ): Promise<import('./vinted-browser-listing-price.ts').VintedListingPriceResult>;
  updateListing?(
    itemId: string,
    accountId: string,
    fields: VintedListingEditFields,
    authorize: () => Promise<void>,
  ): Promise<VintedEditResult>;
  readProfileAbout?(accountId: string): Promise<string>;
  readProfileDetails?(
    accountId: string,
  ): Promise<
    import('../../../supabase/functions/_shared/marketplace-profile-contracts.d.ts').VintedProfileDetails
  >;
  searchProfileCities?(
    accountId: string,
    query: string,
  ): Promise<
    import('../../../supabase/functions/_shared/marketplace-profile-contracts.d.ts').VintedProfileOption[]
  >;
  updateProfileDetails?(
    accountId: string,
    changes: import('../../../supabase/functions/_shared/marketplace-profile-contracts.d.ts').VintedProfileChanges,
    expected: import('../../../supabase/functions/_shared/marketplace-profile-contracts.d.ts').VintedProfileDetails,
    authorize: () => Promise<void>,
  ): Promise<
    import('../../../supabase/functions/_shared/marketplace-profile-contracts.d.ts').VintedProfileSaveResult
  >;
  updateProfileAbout?(
    accountId: string,
    about: string,
    authorize: () => Promise<void>,
    expectedAbout?: string,
  ): Promise<VintedEditResult>;
}

export interface CloudBrowserHandle {
  close(): Promise<void>;
  run<T>(operation: (browser: BrowserInfo) => Promise<T>): Promise<T>;
}

export type BrowserDesktop = Required<
  Pick<BrowserInfo, 'capture' | 'click' | 'drag' | 'type' | 'press'>
>;

interface GoLoginCloudBrowserOptions {
  token: string;
  startUrl?: 'https://www.vinted.de/';
  fetch?: typeof fetch;
  isolated?: {
    open(profileId: string, token: string): Promise<CloudBrowserHandle>;
    stop(profileId: string): Promise<void>;
  };
  connect?: (url: string) => Promise<BrowserConnection>;
}

const apiBaseUrl = 'https://api.gologin.com';
const cloudBrowserUrl = 'wss://cloudbrowser.gologin.com/connect';
const profileIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Gescheiterter Start mit bestätigt beendetem Browser. Trägt nur den festen Abschnitt und eine
 * geprüfte Kurzbeschreibung, nie Anbieterantworten oder Zugangsdaten.
 */
export class ChromiumStartError extends Error {
  readonly phase: 'network' | 'launch' | 'initialize';
  readonly detail: string;
  constructor(phase: 'network' | 'launch' | 'initialize', detail: string) {
    super('Chromium-Start fehlgeschlagen');
    this.phase = phase;
    this.detail = detail;
  }
}

export class CloudBrowserStopUncertainError extends Error {
  constructor() {
    super('Browser-Stopp muss geprüft werden');
  }
}

/** Der Container ist nachweislich beendet und entfernt; nur der saubere Profilabschluss fehlt. */
export class CloudBrowserStoppedUncleanlyError extends Error {
  constructor() {
    super('Browser beendet, Profilabschluss muss geprüft werden');
  }
}

export class GoLoginCloudBrowser {
  private readonly token: string;
  private readonly request: typeof fetch;
  private readonly connect: (url: string) => Promise<BrowserConnection>;
  private readonly isolated?: GoLoginCloudBrowserOptions['isolated'];
  private readonly startUrl?: 'https://www.vinted.de/';

  constructor(options: GoLoginCloudBrowserOptions) {
    if (!options.token.trim()) throw new Error('GoLogin-Zugang fehlt');
    this.token = options.token;
    this.request = options.fetch ?? fetch;
    this.connect = options.connect ?? ((url) => chromium.connectOverCDP(url, { timeout: 30_000 }));
    this.startUrl = options.startUrl;
    this.isolated = options.isolated;
  }

  async open(profileId: string): Promise<CloudBrowserHandle> {
    if (!profileIdPattern.test(profileId)) throw new Error('Ungültige Browserprofil-ID');
    if (this.isolated) {
      let handle: CloudBrowserHandle;
      try {
        handle = await this.isolated.open(profileId, this.token);
        await handle.run(async (browser) => browser.initialize?.());
      } catch (error) {
        let unclean = error instanceof CloudBrowserStoppedUncleanlyError;
        try {
          await this.stop(profileId);
        } catch (stopError) {
          if (!(stopError instanceof CloudBrowserStoppedUncleanlyError))
            throw new CloudBrowserStopUncertainError();
          unclean = true;
        }
        if (unclean) throw new CloudBrowserStoppedUncleanlyError();
        // Anbieterfehler können Zugangsdaten enthalten; nur die feste Kategorie weitergeben.
        // eslint-disable-next-line preserve-caught-error
        throw new Error('Browser-Verbindung fehlgeschlagen');
      }
      let stopped = false;
      let closing: Promise<void> | undefined;
      return {
        run: (operation) => {
          if (stopped || closing) return Promise.reject(new Error('Browsersitzung beendet'));
          return handle.run(operation);
        },
        close: () => {
          if (stopped) return Promise.resolve();
          closing ??= (async () => {
            let unclean = false;
            try {
              await handle.close();
            } catch (error) {
              if (!(error instanceof CloudBrowserStoppedUncleanlyError)) throw error;
              unclean = true;
            }
            await this.stop(profileId);
            stopped = true;
            if (unclean) throw new CloudBrowserStoppedUncleanlyError();
          })().catch((error: unknown) => {
            closing = undefined;
            throw error;
          });
          return closing;
        },
      };
    }
    let connection: BrowserConnection;
    try {
      const endpoint = new URL(cloudBrowserUrl);
      endpoint.searchParams.set('token', this.token);
      endpoint.searchParams.set('profile', profileId);
      connection = await this.connect(endpoint.toString());
    } catch {
      try {
        await this.stop(profileId);
      } catch {
        throw new CloudBrowserStopUncertainError();
      }
      throw new Error('Browser-Verbindung fehlgeschlagen');
    }

    let connectionClosed = false;
    let providerStopped = false;
    let stopPromise: Promise<void> | undefined;
    const browserInfo = vintedBrowserActions(connection);
    const handle: CloudBrowserHandle = {
      run: (operation) => operation(browserInfo),
      close: async () => {
        if (providerStopped) return;
        if (stopPromise) return stopPromise;
        stopPromise = (async () => {
          if (!connectionClosed) {
            try {
              await connection.close();
            } catch {
              // Der Anbieter-Stopp ist für die Freigabe maßgeblich.
            }
            connectionClosed = true;
          }
          await this.stop(profileId);
          providerStopped = true;
        })();
        try {
          await stopPromise;
        } finally {
          stopPromise = undefined;
        }
      },
    };
    if (this.startUrl) {
      try {
        await currentVintedPage(connection).goto(this.startUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 20_000,
        });
      } catch {
        try {
          await handle.close();
        } catch {
          throw new CloudBrowserStopUncertainError();
        }
        throw new Error('Vinted-Startseite konnte nicht geöffnet werden');
      }
    }
    return handle;
  }

  async stop(profileId: string): Promise<void> {
    if (!profileIdPattern.test(profileId)) throw new Error('Ungültige Browserprofil-ID');
    let unclean = false;
    try {
      await this.isolated?.stop(profileId);
    } catch (error) {
      if (!(error instanceof CloudBrowserStoppedUncleanlyError)) throw error;
      unclean = true;
    }
    let response: Response;
    try {
      response = await this.request(`${apiBaseUrl}/browser/${profileId}/web`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error('Browseranbieter nicht erreichbar');
    }
    if (!response.ok) throw new Error(`Browseranbieter antwortete mit HTTP ${response.status}`);
    if (unclean) throw new CloudBrowserStoppedUncleanlyError();
  }
}

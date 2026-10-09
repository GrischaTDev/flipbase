import { ElementRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { MarketplaceApiService } from '../../services/marketplace-api.service';
import { MarketplaceBrowserTestApiService } from '../../services/marketplace-browser-test-api.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { parseMarketplacePage, parseMarketplaceSnapshot } from '../../models/marketplace-response';
import type { AccountScope } from '../../models/marketplace.models';
import type {
  LocalQueuedMessage,
  MarketplaceEntry,
  MarketplacePage,
} from '../../models/marketplace-read.models';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { VintedMessagesComponent } from './vinted-messages.component';
import { VintedOfferActionsComponent } from '../vinted-offer-actions/vinted-offer-actions.component';
import { VintedNegotiationApiService } from '../../services/vinted-negotiation-api.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { VintedMessagingStore } from '../../services/vinted-messaging.store';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import imageCompression from 'browser-image-compression';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';

vi.mock('browser-image-compression', () => ({
  default: Object.assign(vi.fn(), { getDataUrlFromFile: vi.fn() }),
}));

const accounts = createMarketplaceFixtures().connections;
const detailResult = { status: 'success', observedAt: '2026-10-06T10:00:00Z' } as const;
const emptyPage = { items: [], total: 0, nextCursor: null };
function snapshot(scope: AccountScope) {
  return parseMarketplaceSnapshot(
    {
      ...scope,
      profile: null,
      publications: emptyPage,
      sales: emptyPage,
      activity: emptyPage,
      conversations: {
        items: [
          {
            ...scope,
            id: 'conversation-1',
            title: 'Anfrage zum Schal',
            text: 'Ist er noch da?',
            unread: true,
            occurredAt: '2026-10-01T12:00:00Z',
          },
        ],
        total: 1,
        nextCursor: null,
      },
    },
    scope,
  );
}
function messages(
  scope: AccountScope,
  items: Record<string, unknown>[] = [
    {
      id: 'message-1',
      text: '<b>Hallo!</b>',
      direction: 'inbound',
      messageType: 'text',
      occurredAt: '2026-10-01T12:00:00Z',
    },
    {
      id: 'message-2',
      title: 'Preisangebot',
      text: 'Kannst du 12 Euro machen?',
      priceLabel: '12,00 €',
      direction: 'outbound',
      messageType: 'offer_message',
    },
    { id: 'message-3', text: 'Bestellung abgeschlossen', messageType: 'status_message' },
  ],
  nextCursor: string | null = null,
): MarketplacePage<MarketplaceEntry> {
  return parseMarketplacePage(
    {
      items: items.map((item) => ({ ...scope, ...item, conversationId: 'conversation-1' })),
      total: items.length,
      nextCursor,
    },
    scope,
    'conversation-1',
  );
}
let restore: (() => void) | undefined;
let workspace = signal({ id: accounts[0].workspaceId, archived_at: null });
let params = new BehaviorSubject(convertToParamMap({}));
let api: {
  listConnections: ReturnType<typeof vi.fn>;
  readSnapshot: ReturnType<typeof vi.fn>;
  readPage: ReturnType<typeof vi.fn>;
  markConversationRead: ReturnType<typeof vi.fn>;
};
let store: MarketplaceAccountStore;
let browserApi: { readConversation: ReturnType<typeof vi.fn> };
let local: {
  error: ReturnType<typeof signal<string | null>>;
  busy: ReturnType<typeof signal<boolean>>;
  messagesAllowed: ReturnType<typeof signal<boolean>>;
  inboxImported: ReturnType<typeof signal<null>>;
  hasValidBinding: ReturnType<typeof vi.fn<() => boolean>>;
  approveInbox: ReturnType<typeof vi.fn>;
  syncInbox: ReturnType<typeof vi.fn>;
  openInboxConversation: ReturnType<typeof vi.fn>;
};
let messaging: {
  canSend: ReturnType<typeof vi.fn<() => boolean>>;
  cloudSendAllowed: ReturnType<typeof signal<boolean>>;
  revokeCloudSend: ReturnType<typeof vi.fn>;
  messages: ReturnType<typeof signal<LocalQueuedMessage[]>>;
  busy: ReturnType<typeof signal<boolean>>;
  error: ReturnType<typeof signal<string | null>>;
  load: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};
let dialog: { frage: ReturnType<typeof vi.fn>; zeigeHinweis: ReturnType<typeof vi.fn> };
beforeAll(async () => {
  registerLocaleData(localeDe, 'de');
  restore = await prepareMarketplaceRendering([
    {
      type: VintedOfferActionsComponent,
      path: 'src/app/features/marketplaces/components/vinted-offer-actions/vinted-offer-actions.component.ts',
    },
    {
      type: VintedMessagesComponent,
      path: 'src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts',
    },
    ...[
      [ButtonComponent, 'button'],
      [BadgeComponent, 'badge'],
      [CardComponent, 'card'],
      [ProductThumbnailComponent, 'product-thumbnail'],
      [CustomSearchInputComponent, 'custom-search-input'],
      [CustomSelectComponent, 'custom-select'],
      [TextFieldComponent, 'text-field'],
      [LoadingIndicatorComponent, 'loading-indicator'],
      [ModalShellComponent, 'modal-shell'],
      [NumberInputComponent, 'number-input'],
    ].map(([type, name]) => ({
      type,
      path: `src/app/shared/components/${name}/${name}.component.ts`,
    })),
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
beforeEach(() => {
  vi.mocked(imageCompression).mockReset();
  vi.mocked(imageCompression.getDataUrlFromFile).mockReset();
  workspace = signal({ id: accounts[0].workspaceId, archived_at: null });
  params = new BehaviorSubject(convertToParamMap({}));
  api = {
    listConnections: vi.fn().mockResolvedValue({ canManage: true, connections: accounts }),
    readSnapshot: vi.fn().mockImplementation(async (scope: AccountScope) => snapshot(scope)),
    readPage: vi.fn().mockImplementation(async (scope: AccountScope) => messages(scope)),
    markConversationRead: vi.fn().mockResolvedValue(true),
  };
  local = {
    error: signal<string | null>(null),
    busy: signal(false),
    messagesAllowed: signal(false),
    inboxImported: signal(null),
    hasValidBinding: vi.fn().mockReturnValue(true),
    approveInbox: vi.fn().mockResolvedValue(undefined),
    syncInbox: vi.fn().mockResolvedValue(undefined),
    openInboxConversation: vi.fn().mockResolvedValue(detailResult),
  };
  messaging = {
    canSend: vi.fn().mockImplementation(() => {
      const store = TestBed.inject(MarketplaceAccountStore);
      return (
        store.canManage() &&
        store.selectedConnection()?.status === 'connected' &&
        (store.selectedConnection()?.executionMode === 'cloud' ||
          (local.hasValidBinding() && local.messagesAllowed()))
      );
    }),
    cloudSendAllowed: signal(false),
    revokeCloudSend: vi.fn(),
    messages: signal([]),
    busy: signal(false),
    error: signal(null),
    load: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(true),
    retry: vi.fn().mockResolvedValue(true),
  };
  dialog = {
    frage: vi.fn().mockResolvedValue(false),
    zeigeHinweis: vi.fn().mockResolvedValue(true),
  };
  browserApi = { readConversation: vi.fn().mockResolvedValue(detailResult.observedAt) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      MarketplaceAccountStore,
      { provide: VintedLocalExtensionStore, useValue: local },
      { provide: VintedMessagingStore, useValue: messaging },
      { provide: VintedNegotiationApiService, useValue: { enqueue: vi.fn(), read: vi.fn() } },
      { provide: ConfirmDialogService, useValue: dialog },
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } },
      },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ id: 'user-a' }),
          session: signal({ access_token: 'test-token' }),
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceApiService, useValue: api },
      { provide: MarketplaceBrowserTestApiService, useValue: browserApi },
    ],
  });
  store = TestBed.inject(MarketplaceAccountStore);
  vi.spyOn(store, 'refreshCloudConversation').mockResolvedValue({ status: 'cancelled' });
});
async function settle(fixture: ComponentFixture<VintedMessagesComponent>) {
  fixture.detectChanges();
  TestBed.tick();
  for (let index = 0; index < 15; index++) await Promise.resolve();
  fixture.detectChanges();
  TestBed.tick();
}
async function render() {
  const fixture = TestBed.createComponent(VintedMessagesComponent);
  // Der vorhandene Vitest-JIT-Lauf erzeugt keine Signal-ViewQuery-Metadaten.
  // Nur diese Frameworkabfrage ergänzen; Fokus und Scrollverhalten laufen im echten DOM.
  for (const [property, selector] of [
    ['heading', '[data-conversation-heading]'],
    ['listHeading', '#vinted-conversations-title'],
    ['log', '[role="log"]'],
  ]) {
    Object.defineProperty(fixture.componentInstance, property, {
      value: () => {
        const element = fixture.nativeElement.querySelector(selector);
        return element ? new ElementRef(element) : undefined;
      },
    });
  }
  await settle(fixture);
  return fixture;
}
function button(fixture: ComponentFixture<VintedMessagesComponent>, text: string) {
  const result = [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ].find((node) => node.textContent?.includes(text) || node.getAttribute('aria-label') === text);
  if (!result) throw new Error(`Button fehlt: ${text}`);
  return result;
}
describe('Freigabe aktueller Käuferangebote', () => {
  function offerComponent() {
    const scope = { workspaceId: accounts[0].workspaceId, connectionId: accounts[0].connectionId };
    const account = {
      ...accounts[0],
      externalAccountId: '22',
      executionMode: 'cloud' as const,
      status: 'connected' as const,
    };
    vi.spyOn(store, 'selectedConnection').mockReturnValue(account);
    vi.spyOn(store, 'canManage').mockReturnValue(true);
    vi.spyOn(store, 'loadingMessages').mockReturnValue(false);
    messaging.canSend.mockReturnValue(true);
    messaging.cloudSendAllowed.set(true);
    const component = TestBed.createComponent(VintedMessagesComponent).componentInstance;
    const offer = {
      offerId: '123',
      transactionId: '456',
      itemId: '789',
      buyerId: '11',
      sellerId: '22',
      originalPriceCents: 5000,
      offeredPriceCents: 2000,
      currency: 'EUR',
      status: 'pending',
    };
    const entry = messages(scope, [
      {
        id: 'offer',
        occurredAt: '2026-09-01T12:00:00Z',
        direction: 'inbound',
        messageType: 'offer_request_message',
        negotiationOffer: offer,
      },
    ]).items[0];
    const conversation = signal({
      ...entry,
      id: 'conversation-1',
      partnerId: '11',
      itemId: '789',
      transactionStatus: 'negotiating',
    });
    const transcript = signal<readonly MarketplaceEntry[]>([entry]);
    Object.defineProperty(component, 'conversation', { value: conversation });
    Object.defineProperty(component, 'transcript', { value: transcript });
    Object.defineProperty(component, 'context', { value: () => 'context' });
    Object.defineProperty(component, 'isRefreshingConversation', { value: () => false });
    Object.defineProperty(component, 'conversationReadError', { value: () => null });
    return { component, entry, transcript, conversation };
  }
  it('erlaubt ein zeitlich altes, aber weiterhin aktuelles belegtes Angebot', () => {
    const { component, entry } = offerComponent();
    expect(component.canActOnOffer(entry)).toBe(true);
    messaging.cloudSendAllowed.set(false);
    expect(component.canActOnOffer(entry)).toBe(false);
  });
  it('sperrt überholte, unvollständige und fremde Angebote', () => {
    const { component, entry, transcript } = offerComponent();
    expect(component.canActOnOffer({ ...entry, negotiationOffer: null })).toBe(false);
    expect(component.canActOnOffer({ ...entry, connectionId: 'foreign' })).toBe(false);
    expect(component.canActOnOffer({ ...entry, offerStatus: 'accepted' })).toBe(false);
    transcript.set([
      entry,
      {
        ...entry,
        id: 'newer',
        occurredAt: '2026-10-09T12:00:00Z',
        direction: 'outbound',
        messageType: 'offer_message',
        negotiationOffer: null,
      },
    ]);
    expect(component.canActOnOffer(entry)).toBe(false);
  });
  it('sperrt falsche Artikel und abgeschlossene Gespräche', () => {
    const { component, entry, conversation } = offerComponent();
    conversation.update((current) => ({ ...current, itemId: 'foreign' }));
    expect(component.canActOnOffer(entry)).toBe(false);
    conversation.update((current) => ({ ...current, itemId: '789', transactionStatus: 'sold' }));
    expect(component.canActOnOffer(entry)).toBe(false);
  });
});
describe('Vollständiges Laden eines Gesprächs', () => {
  function useLocalAccount() {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    local.messagesAllowed.set(true);
  }

  it('liest beim bewussten Übersichtseinstieg denselben Vinted-Detailverlauf', async () => {
    useLocalAccount();
    params.next(
      convertToParamMap({
        connectionId: accounts[0].connectionId,
        conversationId: 'conversation-1',
      }),
    );
    const fixture = await render();
    await settle(fixture);
    expect(local.openInboxConversation).toHaveBeenCalledWith(
      'conversation-1',
      expect.any(Function),
    );
  });
  it('wartet beim Übersichtseinstieg die noch laufende Prüfung des Nachrichtenzugriffs ab', async () => {
    useLocalAccount();
    local.messagesAllowed.set(false);
    local.busy.set(true);
    let finish: (() => void) | undefined;
    local.openInboxConversation.mockImplementation(() =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }).then(() => detailResult),
    );
    params.next(
      convertToParamMap({
        connectionId: accounts[0].connectionId,
        conversationId: 'conversation-1',
      }),
    );
    const fixture = await render();
    await settle(fixture);
    expect(local.openInboxConversation).toHaveBeenCalledWith(
      'conversation-1',
      expect.any(Function),
    );
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Wird aktualisiert',
    );
    local.messagesAllowed.set(true);
    local.busy.set(false);
    finish?.();
    await settle(fixture);
    expect(local.openInboxConversation).toHaveBeenCalledTimes(1);
  });
  it('kennzeichnet Cache und unbekannten Artikel neutral trotz neuer Kontosynchronisation', async () => {
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Gespeicherter Stand',
    );
    expect(
      fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent,
    ).not.toContain('Synchronisiert');
    expect(fixture.nativeElement.querySelector('[data-conversation-item]')?.textContent).toContain(
      'Artikel noch nicht geladen',
    );
  });
  it('überträgt einen fremden lokalen Fehler nicht auf ein gespeichertes Gespräch', async () => {
    const fixture = await render();
    local.error.set('Ein anderer Abruf ist fehlgeschlagen');
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Gespeicherter Stand',
    );
  });
  it('zeigt nur den tatsächlichen Prüfzeitpunkt dieses Gesprächs als bestätigt', async () => {
    useLocalAccount();
    let checked = false;
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
      const current = snapshot(scope);
      return {
        ...current,
        conversations: {
          ...current.conversations,
          items: current.conversations.items.map((entry) => ({
            ...entry,
            detailCheckedAt: checked ? '2026-10-06T10:00:00Z' : null,
          })),
        },
      };
    });
    const fixture = await render();
    const entry = store.snapshot()?.conversations.items[0];
    if (!entry) throw new Error('Testgespräch fehlt');
    local.openInboxConversation.mockImplementation(async () => {
      checked = true;
      await store.refreshLocalConnection(entry, true);
      return detailResult;
    });
    await fixture.componentInstance.openConversation(entry);
    await settle(fixture);
    const status = fixture.nativeElement.querySelector('[data-conversation-sync]');
    expect(status?.textContent).toContain('Synchronisiert');
    expect(status?.getAttribute('title')).toContain('06.10.2026');
  });
  it('zeigt ein Cloud-Gespräch nach tatsächlicher Detailübernahme als synchronisiert', async () => {
    vi.mocked(store.refreshCloudConversation).mockRestore();
    let checked = false;
    api.readPage.mockImplementation(async (scope: AccountScope) =>
      messages(scope, [
        {
          id: 'cloud-message',
          text: checked ? 'Aktuelle Cloud-Nachricht' : 'Alter Verlauf',
          direction: 'inbound',
        },
      ]),
    );
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
      const current = snapshot(scope);
      return {
        ...current,
        conversations: {
          ...current.conversations,
          items: current.conversations.items.map((entry) => ({
            ...entry,
            detailCheckedAt: checked ? detailResult.observedAt : null,
          })),
        },
      };
    });
    browserApi.readConversation.mockImplementation(async () => {
      checked = true;
      return detailResult.observedAt;
    });
    const fixture = await render();
    const entry = store.snapshot()?.conversations.items[0];
    if (!entry) throw new Error('Testgespräch fehlt');
    await fixture.componentInstance.openConversation(entry);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Synchronisiert',
    );
    expect(local.openInboxConversation).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="log"]')?.textContent).toContain(
      'Aktuelle Cloud-Nachricht',
    );
  });
  it.each(['cloud', 'local'] as const)(
    'markiert ein erfolgreich geöffnetes %s-Gespräch als gelesen',
    async (executionMode) => {
      vi.mocked(store.refreshCloudConversation).mockResolvedValue(detailResult);
      api.listConnections.mockResolvedValue({
        canManage: true,
        connections: [{ ...accounts[0], executionMode }],
      });
      api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
        const current = snapshot(scope);
        return {
          ...current,
          conversations: {
            ...current.conversations,
            items: current.conversations.items.map((entry) => ({
              ...entry,
              readVersion: 'a'.repeat(32),
              detailCheckedAt: detailResult.observedAt,
            })),
          },
        };
      });
      const fixture = await render();
      button(fixture, 'Anfrage zum Schal').click();
      await settle(fixture);
      expect(api.markConversationRead).toHaveBeenCalledOnce();
      expect(store.snapshot()?.conversations.items[0].unread).toBe(false);
      expect(
        fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent,
      ).toContain('Synchronisiert');
      expect(
        fixture.nativeElement.querySelector('[aria-label="Gespräch"]')?.textContent,
      ).not.toContain('Ungelesen');
    },
  );
  it('behält nach abgelehntem Cloud-Abruf den gespeicherten Verlauf mit Fehlerhinweis', async () => {
    vi.mocked(store.refreshCloudConversation).mockRestore();
    browserApi.readConversation.mockRejectedValue(new Error('Gespräch nicht erreichbar'));
    const fixture = await render();
    const entry = store.snapshot()?.conversations.items[0];
    if (!entry) throw new Error('Testgespräch fehlt');
    await fixture.componentInstance.openConversation(entry);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Aktualisierung fehlgeschlagen',
    );
    expect(fixture.nativeElement.querySelector('[role="log"]')?.textContent).toContain(
      '<b>Hallo!</b>',
    );
    expect(
      fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent,
    ).not.toContain('Synchronisiert');
  });

  it('bestätigt nach fehlgeschlagenem Snapshotlesen keinen alten Gesprächsstempel als neuen Abgleich', async () => {
    useLocalAccount();
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
      const current = snapshot(scope);
      return {
        ...current,
        conversations: {
          ...current.conversations,
          items: current.conversations.items.map((entry) => ({
            ...entry,
            detailCheckedAt: '2026-10-05T10:00:00Z',
          })),
        },
      };
    });
    const fixture = await render();
    const entry = store.snapshot()?.conversations.items[0];
    if (!entry) throw new Error('Testgespräch fehlt');
    local.openInboxConversation.mockImplementation(async () => {
      api.readSnapshot.mockRejectedValueOnce(new Error('Snapshot nicht erreichbar'));
      await store.refreshLocalConnection(entry, true);
      return detailResult;
    });
    await fixture.componentInstance.openConversation(entry);
    await settle(fixture);
    const status = fixture.nativeElement.querySelector('[data-conversation-sync]');
    expect(status?.textContent).not.toContain('Synchronisiert');
    expect(status?.textContent).toContain('Aktualisierung fehlgeschlagen');
    expect(fixture.nativeElement.querySelector('[role="log"]')?.textContent).toContain(
      '<b>Hallo!</b>',
    );
  });
  it('behält einen Detailfehler beim betroffenen Gespräch und nicht beim nächsten', async () => {
    useLocalAccount();
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
      const current = snapshot(scope);
      return {
        ...current,
        conversations: {
          ...current.conversations,
          items: [
            current.conversations.items[0],
            { ...current.conversations.items[0], id: 'conversation-2', title: 'Ben' },
          ],
          total: 2,
        },
      };
    });
    local.openInboxConversation.mockResolvedValueOnce({
      status: 'failed',
      error: 'Vinted ist nicht erreichbar',
    });
    const fixture = await render();
    const entries = store.snapshot()?.conversations.items;
    if (!entries) throw new Error('Testgespräche fehlen');
    await fixture.componentInstance.openConversation(entries[0]);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Aktualisierung fehlgeschlagen',
    );
    expect(fixture.nativeElement.textContent).toContain('Vinted ist nicht erreichbar');
    await fixture.componentInstance.openConversation(entries[1]);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Gespeicherter Stand',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Vinted ist nicht erreichbar');
  });

  it('zeigt bekannte Kopfdaten sofort auch während ein leerer Verlauf geprüft wird', async () => {
    useLocalAccount();
    let finishRead: ((page: MarketplacePage<MarketplaceEntry>) => void) | undefined;
    api.readPage.mockReturnValueOnce(
      new Promise<MarketplacePage<MarketplaceEntry>>((resolve) => {
        finishRead = resolve;
      }),
    );
    let finishProvider: (() => void) | undefined;
    local.openInboxConversation.mockImplementation(() =>
      new Promise<void>((resolve) => {
        finishProvider = resolve;
      }).then(() => detailResult),
    );
    const fixture = await render();
    const entry = store.snapshot()?.conversations.items[0];
    if (!entry) throw new Error('Testgespräch fehlt');
    const opening = fixture.componentInstance.openConversation(entry);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-loading]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-conversation-heading]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-conversation-item]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-message-composer]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Wird aktualisiert',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Nachrichten werden geladen');
    api.readPage.mockResolvedValue(messages(accounts[0], []));
    finishRead?.(messages(accounts[0], []));
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-loading]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="log"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-message-kind]')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Wird aktualisiert',
    );
    finishProvider?.();
    await opening;
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Gespeicherter Stand',
    );
  });

  it('zeigt gespeicherte Daten während der Vinted-Prüfung und aktualisiert nur den Status', async () => {
    useLocalAccount();
    let finishProvider: (() => void) | undefined;
    local.openInboxConversation.mockImplementation(() =>
      new Promise<void>((resolve) => {
        finishProvider = resolve;
      }).then(() => detailResult),
    );
    const fixture = await render();
    const entry = store.snapshot()?.conversations.items[0];
    if (!entry) throw new Error('Testgespräch fehlt');
    const opening = fixture.componentInstance.openConversation(entry);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(local.openInboxConversation).toHaveBeenCalledWith(entry.id, expect.any(Function));
    expect(root.querySelector('[data-conversation-loading]')).toBeNull();
    expect(root.querySelector('[data-conversation-heading]')).not.toBeNull();
    expect(root.querySelector('[data-conversation-item]')).not.toBeNull();
    expect(root.querySelector('[role="log"]')?.textContent).toContain('<b>Hallo!</b>');
    expect(root.querySelector('[data-message-composer]')).not.toBeNull();
    expect(root.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Wird aktualisiert',
    );
    expect(root.querySelector('[data-conversation-sync] .bg-fb-badge-warning')).not.toBeNull();
    let finishReload: ((page: MarketplacePage<MarketplaceEntry>) => void) | undefined;
    api.readPage.mockReturnValueOnce(
      new Promise<MarketplacePage<MarketplaceEntry>>((resolve) => {
        finishReload = resolve;
      }),
    );
    finishProvider?.();
    await settle(fixture);
    expect(store.loadingMessages()).toBe(true);
    expect(root.textContent).not.toContain('Nachrichten werden geladen');
    expect(root.querySelector('[role="log"]')?.textContent).toContain('<b>Hallo!</b>');
    expect(root.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Wird aktualisiert',
    );
    finishReload?.(
      messages(accounts[0], [
        { id: 'message-1', text: 'Aktualisierte Nachricht', direction: 'inbound' },
      ]),
    );
    await opening;
    await settle(fixture);
    expect(root.querySelector('[data-conversation-loading]')).toBeNull();
    expect(root.querySelector('[data-conversation-heading]')).not.toBeNull();
    expect(root.querySelector('[data-conversation-item]')?.textContent).toContain(
      'Artikel noch nicht geladen',
    );
    expect(root.querySelector('[data-message-composer]')).not.toBeNull();
    expect(root.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Gespeicherter Stand',
    );
    expect(root.querySelector('[role="log"]')?.textContent).toContain('Aktualisierte Nachricht');
    expect(document.activeElement).not.toBe(root.querySelector('[data-conversation-heading]'));
  });

  it('beendet den Spinner bei Fehlern und behauptet keinen erfolgreichen Abgleich', async () => {
    useLocalAccount();
    local.openInboxConversation.mockImplementation(async () => {
      local.error.set('Vinted ist nicht erreichbar');
      return { status: 'failed', error: 'Vinted ist nicht erreichbar' };
    });
    const fixture = await render();
    const entry = store.snapshot()?.conversations.items[0];
    if (!entry) throw new Error('Testgespräch fehlt');
    await fixture.componentInstance.openConversation(entry);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-loading]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Aktualisierung fehlgeschlagen',
    );
    expect(fixture.nativeElement.querySelector('[role="log"]')).not.toBeNull();
  });

  it('lässt einen älteren Abruf den Spinner des inzwischen gewählten Gesprächs nicht entfernen', async () => {
    useLocalAccount();
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
      const current = snapshot(scope);
      return {
        ...current,
        conversations: {
          items: [
            current.conversations.items[0],
            { ...current.conversations.items[0], id: 'conversation-2', title: 'Ben' },
          ],
          total: 2,
          nextCursor: null,
        },
      };
    });
    const completions: (() => void)[] = [];
    local.openInboxConversation.mockImplementation(() =>
      new Promise<void>((resolve) => completions.push(resolve)).then(() => detailResult),
    );
    const fixture = await render();
    const entries = store.snapshot()?.conversations.items;
    if (!entries) throw new Error('Testgespräche fehlen');
    const first = fixture.componentInstance.openConversation(entries[0]);
    await settle(fixture);
    const second = fixture.componentInstance.openConversation(entries[1]);
    await settle(fixture);
    completions[0]();
    await first;
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-sync]')?.textContent).toContain(
      'Wird aktualisiert',
    );
    completions[1]();
    await second;
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-loading]')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-conversation-heading]')?.textContent,
    ).toContain('Ben');
  });

  it('behält das bekannte Artikelbild bei fehlenden Artikeldetails und zeigt das Partnerbild im Kopf', async () => {
    useLocalAccount();
    let available = true;
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
      const current = snapshot(scope);
      return {
        ...current,
        conversations: {
          ...current.conversations,
          items: [
            {
              ...current.conversations.items[0],
              imageUrl: 'https://images.example.org/avatar.jpg',
              itemImageUrl: available ? 'https://images.example.org/scarf.jpg' : null,
              itemTitle: available ? 'Seidenschal' : null,
              itemPrice: available ? 58 : null,
              itemCurrency: available ? 'EUR' : null,
              lastActiveAt: available ? '2026-10-05T10:00:00Z' : null,
            },
          ],
        },
      };
    });
    const fixture = await render();
    const entry = store.snapshot()?.conversations.items[0];
    if (!entry) throw new Error('Testgespräch fehlt');
    local.openInboxConversation.mockImplementation(async () => {
      available = false;
      await store.refreshLocalConnection(
        { workspaceId: entry.workspaceId, connectionId: entry.connectionId },
        true,
      );
      return detailResult;
    });
    await fixture.componentInstance.openConversation(entry);
    await settle(fixture);
    const strip = fixture.nativeElement.querySelector('[data-conversation-item]');
    expect(strip?.textContent).toContain('Seidenschal');
    expect(fixture.componentInstance.conversation()).toMatchObject({
      itemPrice: 58,
      itemCurrency: 'EUR',
      lastActiveAt: '2026-10-05T10:00:00Z',
    });
    expect(strip?.querySelector('img')?.getAttribute('src')).toBe(
      'https://images.example.org/scarf.jpg',
    );
    expect(
      fixture.nativeElement.querySelector('img[src="https://images.example.org/avatar.jpg"]'),
    ).not.toBeNull();
  });

  it('entfernt technische Angebotstitel und erhält echte zusätzliche Texte und Entscheidungen', async () => {
    api.readPage.mockImplementation(async (scope: AccountScope) =>
      messages(scope, [
        {
          id: 'offer-1',
          messageType: 'offer_message',
          title: 'Offer Message',
          text: 'offer_message',
          priceLabel: '11,00 € statt 14,00 €',
          offerStatus: 'rejected',
        },
        {
          id: 'offer-2',
          messageType: 'offer_request_message',
          title: 'offer_request_message',
          text: 'Kannst Du 12 Euro machen?',
          priceLabel: '12,00 €',
        },
      ]),
    );
    const fixture = await render();
    const entry = store.snapshot()?.conversations.items[0];
    if (!entry) throw new Error('Testgespräch fehlt');
    await fixture.componentInstance.openConversation(entry);
    await settle(fixture);
    const log = fixture.nativeElement.querySelector('[role="log"]');
    expect(log?.textContent).not.toMatch(/Offer Message|offer_message|offer_request_message/);
    expect(log?.textContent).toContain('11,00 €');
    expect(log?.textContent).toContain('Abgelehnt');
    expect(log?.textContent).toContain('Kannst Du 12 Euro machen?');
  });
});

describe('Kompakter gespeicherter Vinted-Gesprächsbereich', () => {
  it('zählt alle Filter einschließlich leerer Kategorien und sortiert datierte Angebotsereignisse', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.filterOptions().map((option) => option.label)).toEqual([
      'Alle',
      'Ungelesen (1)',
      'Fragen (1)',
      'Verhandlung (0)',
      'Verkauft (0)',
      'Systemnachrichten (0)',
    ]);
    api.readPage.mockImplementation(async (scope: AccountScope) =>
      messages(scope, [
        {
          id: 'later',
          text: 'Verkauft',
          occurredAt: '2026-10-02T08:00:00Z',
          messageType: 'status_message',
        },
        {
          id: 'offer',
          occurredAt: '2026-10-01T20:00:00Z',
          direction: 'inbound',
          messageType: 'offer_request_message',
          priceLabel: '11,00 € statt 14,00 €',
          offerStatus: 'rejected',
        },
      ]),
    );
    const conversation = store.snapshot()?.conversations.items[0];
    if (!conversation) throw new Error('Testgespräch fehlt');
    await fixture.componentInstance.openConversation(conversation);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(
      [...root.querySelectorAll('[data-message-kind]')].map((entry) =>
        entry.getAttribute('data-message-kind'),
      ),
    ).toEqual(['offer', 'system']);
    expect(root.querySelectorAll('[data-message-day]')).toHaveLength(2);
    expect(root.querySelector('del')?.textContent).toBe('14,00 €');
    expect(root.textContent).toContain('Angebot erhalten');
    expect(root.textContent).toContain('Abgelehnt');
    expect(root.textContent).toContain('Letzte Aktivität unbekannt');
  });

  it('zeigt den Produktbezug und Nachrichtbilder und sortiert nur nach vorhandenen Zeitangaben', async () => {
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
      const current = snapshot(scope);
      return {
        ...current,
        conversations: {
          ...current.conversations,
          items: [
            {
              ...current.conversations.items[0],
              title: 'Anna',
              itemTitle: 'Seidenschal',
              itemPrice: 12,
              itemCurrency: 'EUR',
              itemImageUrl: 'https://images.example.org/scarf.jpg',
              lastActiveAt: '2026-10-01T11:00:00Z',
            },
            {
              ...current.conversations.items[0],
              id: 'conversation-2',
              title: 'Ben',
              occurredAt: '2026-09-30T12:00:00Z',
              unread: false,
            },
          ],
          total: 2,
        },
      };
    });
    api.readPage.mockImplementation(async (scope: AccountScope) =>
      messages(scope, [
        {
          id: 'message-image',
          text: 'Hier das Bild',
          imageUrls: ['https://images.example.org/message.jpg'],
        },
      ]),
    );
    const fixture = await render();
    expect(fixture.componentInstance.visibleConversations().map((entry) => entry.title)).toEqual([
      'Anna',
      'Ben',
    ]);
    fixture.componentInstance.conversationSort.set('oldest');
    expect(fixture.componentInstance.visibleConversations().map((entry) => entry.title)).toEqual([
      'Ben',
      'Anna',
    ]);
    fixture.componentInstance.search.set('Seidenschal');
    await settle(fixture);
    button(fixture, 'Anna').click();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Seidenschal');
    expect(fixture.nativeElement.textContent).toContain('12,00');
    expect(fixture.nativeElement.textContent).toContain('Zuletzt aktiv');
    expect(
      fixture.nativeElement.querySelector('img[src="https://images.example.org/message.jpg"]'),
    ).not.toBeNull();
  });
  it('sucht in echten Gesprächsdaten und filtert ungelesene Gespräche', async () => {
    const fixture = await render();
    fixture.componentInstance.search.set('Schal');
    fixture.componentInstance.conversationFilter.set('unread');
    expect(fixture.componentInstance.visibleConversations()).toHaveLength(1);
    fixture.componentInstance.search.set('Nicht vorhanden');
    expect(fixture.componentInstance.visibleConversations()).toHaveLength(0);
    fixture.componentInstance.search.set('');
    fixture.componentInstance.conversationFilter.set('negotiating');
    expect(fixture.componentInstance.visibleConversations()).toHaveLength(0);
  });
  it('übernimmt einen Versandauftrag und löscht den Entwurf erst bei bestätigter Einreihung', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    local.messagesAllowed.set(true);
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    expect(local.openInboxConversation).toHaveBeenCalledWith(
      'conversation-1',
      expect.any(Function),
    );
    fixture.componentInstance.composer.controls.text.setValue('Hallo!');
    messaging.send.mockResolvedValue(false);
    await fixture.componentInstance.sendMessage();
    expect(fixture.componentInstance.composer.controls.text.value).toBe('Hallo!');
    messaging.send.mockResolvedValue(true);
    await fixture.componentInstance.sendMessage();
    expect(messaging.send).toHaveBeenLastCalledWith(
      { workspaceId: accounts[0].workspaceId, connectionId: accounts[0].connectionId },
      'conversation-1',
      'Hallo!',
      null,
    );
    expect(fixture.componentInstance.composer.controls.text.value).toBe('');
  });
  it('kennzeichnet einen unklaren Versand und verlangt vor der Wiederholung eine Bestätigung', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    local.messagesAllowed.set(true);
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    messaging.messages.set([
      {
        id: 'queued-1',
        requestId: 'request-1',
        conversationId: 'conversation-1',
        text: 'Versand prüfen',
        state: 'outcome_unknown',
        createdAt: '2026-10-05T00:00:00Z',
        updatedAt: '2026-10-05T00:00:00Z',
        externalMessageId: null,
        errorCode: 'timeout',
        attachment: null,
      },
    ]);
    await settle(fixture);
    const queued = fixture.nativeElement.querySelector('[data-queue-state="outcome_unknown"]');
    expect(queued.textContent).toContain('Versandstatus unklar');
    expect(queued.textContent).not.toContain('Gesendet');
    expect(queued.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Versand prüfen und wiederholen',
    );
    button(fixture, 'Versand prüfen und wiederholen').click();
    await settle(fixture);
    expect(dialog.frage).toHaveBeenCalledOnce();
    expect(messaging.retry).not.toHaveBeenCalled();
    dialog.frage.mockResolvedValue(true);
    button(fixture, 'Versand prüfen und wiederholen').click();
    await settle(fixture);
    expect(messaging.retry).toHaveBeenCalledWith(
      { workspaceId: accounts[0].workspaceId, connectionId: accounts[0].connectionId },
      'conversation-1',
      'queued-1',
      true,
    );
    expect(fixture.nativeElement.querySelector('[role="log"]').lastElementChild).toBe(
      fixture.nativeElement.querySelector('[data-conversation-sync]'),
    );
  });
  it('zeigt eine gesendete Nachricht nur einmal nach exakter externer Zuordnung', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    api.readPage.mockImplementation(async (scope: AccountScope) => {
      const page = messages(scope, [
        { id: 'message-sent', text: 'Bestätigte Nachricht', direction: 'outbound' },
      ]);
      return { ...page, items: page.items.map((entry) => ({ ...entry, externalId: '123' })) };
    });
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const queued: LocalQueuedMessage = {
      id: 'queued-1',
      requestId: 'request-1',
      conversationId: 'conversation-1',
      text: 'Bestätigte Nachricht',
      state: 'sent',
      createdAt: '2026-10-05T00:00:00Z',
      updatedAt: '2026-10-05T00:00:00Z',
      externalMessageId: '123',
      errorCode: null,
      attachment: null,
    };
    messaging.messages.set([queued]);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-queue-state="sent"]')).toBeNull();
    messaging.messages.set([{ ...queued, externalMessageId: '124' }]);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-queue-state="sent"]')).not.toBeNull();
  });
  it('sendet einen unklaren Auftrag nicht erneut, wenn der frische Verlauf denselben Text enthält', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    local.messagesAllowed.set(true);
    api.readPage.mockImplementation(async (scope: AccountScope) =>
      messages(scope, [
        {
          id: 'already-sent',
          text: 'Schon gesendet',
          direction: 'outbound',
          occurredAt: '2026-10-05T10:01:00Z',
        },
      ]),
    );
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const queued: LocalQueuedMessage = {
      id: 'queued-1',
      requestId: 'request-1',
      conversationId: 'conversation-1',
      text: 'Schon gesendet',
      state: 'outcome_unknown',
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-05T10:00:30Z',
      externalMessageId: null,
      errorCode: 'timeout',
      attachment: null,
    };
    messaging.messages.set([queued]);
    await fixture.componentInstance.retryMessage(queued);
    expect(local.openInboxConversation).toHaveBeenCalledTimes(2);
    expect(dialog.zeigeHinweis).toHaveBeenCalledOnce();
    expect(dialog.frage).not.toHaveBeenCalled();
    expect(messaging.retry).not.toHaveBeenCalled();
  });
  it('begrenzt den Dateinamen und erklärt vor dem Senden die fehlende Bildbestätigung', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const file = new File(['small'], `${'ä'.repeat(180)}.png`, { type: 'image/png' });
    vi.mocked(imageCompression).mockResolvedValue(file);
    vi.mocked(imageCompression.getDataUrlFromFile).mockResolvedValue(
      'data:image/png;base64,aGVsbG8=',
    );
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    await fixture.componentInstance.selectAttachment({ target: input } as unknown as Event);
    await settle(fixture);
    expect([...(fixture.componentInstance.attachment()?.name ?? '')]).toHaveLength(120);
    expect(fixture.componentInstance.attachment()?.name).toMatch(/\.png$/u);
    expect(fixture.nativeElement.querySelector('[role="note"]')?.textContent).toContain(
      'nicht zuverlässig bestätigt',
    );
    expect(messaging.send).not.toHaveBeenCalled();
  });
  it('weist überlange Texte ab und verwirft Entwürfe bei Kontowechsel', async () => {
    const fixture = await render();
    fixture.componentInstance.composer.controls.text.setValue('x'.repeat(5001));
    await fixture.componentInstance.sendMessage();
    expect(messaging.send).not.toHaveBeenCalled();
    await store.selectConnection(accounts[1].connectionId);
    await settle(fixture);
    expect(fixture.componentInstance.composer.controls.text.value).toBe('');
  });
  it('verkleinert nur PNG/JPEG und übernimmt kein Bild nach einem Kontowechsel', async () => {
    const fixture = await render();
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['file'], 'image.gif', { type: 'image/gif' })],
    });
    await fixture.componentInstance.selectAttachment({ target: input } as unknown as Event);
    expect(fixture.componentInstance.composerError()).toContain('PNG');
    expect(imageCompression).not.toHaveBeenCalled();
    let complete: ((file: File) => void) | undefined;
    vi.mocked(imageCompression).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    vi.mocked(imageCompression.getDataUrlFromFile).mockResolvedValue(
      'data:image/png;base64,aGVsbG8=',
    );
    Object.defineProperty(input, 'files', {
      value: [new File(['file'], 'image.png', { type: 'image/png' })],
    });
    const preparation = fixture.componentInstance.selectAttachment({
      target: input,
    } as unknown as Event);
    await store.selectConnection(accounts[1].connectionId);
    await settle(fixture);
    complete?.(new File(['small'], 'image.png', { type: 'image/png' }));
    await preparation;
    expect(fixture.componentInstance.attachment()).toBeNull();
    expect(imageCompression).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ maxSizeMB: 0.25, maxWidthOrHeight: 1600 }),
    );
  });
  it('fragt vor der lokalen Nachrichtenfreigabe und übernimmt eine Ablehnung', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    const fixture = await render();
    button(fixture, 'Nachrichtenzugriff erlauben').click();
    await settle(fixture);
    expect(dialog.frage).toHaveBeenCalledWith(
      expect.objectContaining({ bestaetigenText: 'Nachrichtenzugriff erlauben' }),
    );
    expect(local.approveInbox).not.toHaveBeenCalled();
    dialog.frage.mockResolvedValue(true);
    button(fixture, 'Nachrichtenzugriff erlauben').click();
    await settle(fixture);
    expect(local.approveInbox).toHaveBeenCalledOnce();
  });
  it('zeigt bei freigegebenem Postfach keine zusätzliche Sync-Karte', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    local.messagesAllowed.set(true);
    const fixture = await render();
    expect(fixture.nativeElement.textContent).not.toContain('Lokales Postfach');
    expect(fixture.nativeElement.textContent).not.toContain('Nachrichtenzugriff erlauben');
    expect(dialog.frage).not.toHaveBeenCalled();
  });
  it('erteilt nach Workspacewechsel während des Dialogs keine Nachrichtenfreigabe', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    let finish: ((accepted: boolean) => void) | undefined;
    dialog.frage.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const fixture = await render();
    button(fixture, 'Nachrichtenzugriff erlauben').click();
    workspace.set({ id: 'other-workspace', archived_at: null });
    finish?.(true);
    await settle(fixture);
    expect(local.approveInbox).not.toHaveBeenCalled();
  });
  it('öffnet gespeicherte Nachrichten als Text und kennzeichnet Angebote ohne Schreibaktion', async () => {
    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain('Anfrage zum Schal');
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('<b>Hallo!</b>');
    expect(host.querySelector('b')).toBeNull();
    expect(host.querySelector('[data-message-direction="outbound"]')?.textContent).toContain(
      '12,00 €',
    );
    expect(host.querySelector('[data-message-kind="system"]')?.textContent).toContain(
      'Bestellung abgeschlossen',
    );
    expect(host.querySelector('textarea')).not.toBeNull();
    expect(messaging.send).not.toHaveBeenCalled();
    expect(host.querySelector('button')?.textContent).not.toContain('Annehmen');
  });
  it.each(['cloud', 'local'] as const)(
    'zeigt in %s nur für bestätigte eigene automatische Nachrichten ein Bot-Icon',
    async (executionMode) => {
      api.listConnections.mockResolvedValue({
        canManage: true,
        connections: [{ ...accounts[0], executionMode }],
      });
      api.readPage.mockImplementation(async (scope: AccountScope) =>
        messages(scope, [
          {
            id: 'auto',
            text: 'Hallo!',
            direction: 'outbound',
            messageType: 'text',
            isAutomated: true,
          },
          { id: 'manual', text: 'Hallo!', direction: 'outbound', messageType: 'text' },
          {
            id: 'incoming',
            text: 'Hallo!',
            direction: 'inbound',
            messageType: 'text',
            isAutomated: true,
          },
          {
            id: 'system',
            text: 'Status',
            direction: 'outbound',
            messageType: 'status_message',
            isAutomated: true,
          },
        ]),
      );
      const fixture = await render();
      button(fixture, 'Anfrage zum Schal').click();
      await settle(fixture);
      const host = fixture.nativeElement as HTMLElement;
      const bot = host.querySelector('[data-message-row="auto"] [data-automated-message-avatar]');
      expect(bot?.getAttribute('aria-label')).toBe('Automatisch von Flipbase gesendet');
      expect(bot?.getAttribute('title')).toBe('Automatisch von Flipbase gesendet');
      expect(bot?.querySelector('svg')).not.toBeNull();
      expect(bot?.querySelector('app-product-thumbnail')).toBeNull();
      expect(host.querySelectorAll('[data-automated-message-avatar]')).toHaveLength(1);
      expect(
        host.querySelector('[data-message-row="manual"] app-product-thumbnail'),
      ).not.toBeNull();
      expect(
        host.querySelector('[data-message-row="incoming"] app-product-thumbnail'),
      ).not.toBeNull();
      expect(host.querySelector('[data-message-row="system"] [data-message-avatar]')).toBeNull();
      expect((await axe.run(host)).violations).toEqual([]);
      expect(messaging.send).not.toHaveBeenCalled();
    },
  );
  it.each(['cloud', 'local'] as const)(
    'zeigt in %s die Profilbilder des richtigen Absenders und neutrale Platzhalter',
    async (executionMode) => {
      api.listConnections.mockResolvedValue({
        canManage: true,
        connections: [{ ...accounts[0], executionMode }],
      });
      api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
        const current = snapshot(scope);
        return {
          ...current,
          profile: {
            ...scope,
            username: 'testkonto',
            imageUrl: 'https://images.example.test/self.jpg',
          },
          conversations: {
            ...current.conversations,
            items: current.conversations.items.map((entry) => ({
              ...entry,
              imageUrl: 'https://images.example.test/partner.jpg',
            })),
          },
        };
      });
      const fixture = await render();
      button(fixture, 'Anfrage zum Schal').click();
      await settle(fixture);
      const host = fixture.nativeElement as HTMLElement;
      const inbound = host.querySelector('[data-message-row="message-1"] [data-message-avatar]');
      const outbound = host.querySelector('[data-message-row="message-2"] [data-message-avatar]');
      expect(inbound?.querySelector('img')?.getAttribute('src')).toBe(
        'https://images.example.test/partner.jpg',
      );
      expect(outbound?.querySelector('img')?.getAttribute('src')).toBe(
        'https://images.example.test/self.jpg',
      );
      expect(inbound?.querySelector('.rounded-full')).not.toBeNull();
      expect(outbound?.querySelector('.rounded-full')).not.toBeNull();
      expect(host.querySelector('[data-message-row="message-3"] [data-message-avatar]')).toBeNull();
      inbound?.querySelector('img')?.dispatchEvent(new Event('error'));
      outbound?.querySelector('img')?.dispatchEvent(new Event('error'));
      await settle(fixture);
      expect(inbound?.querySelector('[data-product-placeholder]')?.getAttribute('aria-label')).toBe(
        'Profilbild von Anfrage zum Schal',
      );
      expect(
        outbound?.querySelector('[data-product-placeholder]')?.getAttribute('aria-label'),
      ).toBe('Profilbild von testkonto');
      expect(messaging.send).not.toHaveBeenCalled();
    },
  );

  it('zeigt für Cloud das Schreibfeld ohne Versandverwaltung unter dem Chat', async () => {
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-message-composer]')).not.toBeNull();
    fixture.componentInstance.composer.controls.text.setValue('Cloudtest');
    await fixture.componentInstance.sendMessage();
    expect(messaging.send).toHaveBeenLastCalledWith(
      { workspaceId: accounts[0].workspaceId, connectionId: accounts[0].connectionId },
      'conversation-1',
      'Cloudtest',
      null,
    );
    expect(local.openInboxConversation).not.toHaveBeenCalled();
    messaging.cloudSendAllowed.set(true);
    await settle(fixture);
    expect(fixture.nativeElement.textContent).not.toContain('Cloud-Versandfreigabe widerrufen');
    expect(messaging.revokeCloudSend).not.toHaveBeenCalled();
  });
  it('verschiebt bei einem Mausklick den Fokus nicht auf den Gesprächstitel', async () => {
    const fixture = await render();
    const trigger = button(fixture, 'Anfrage zum Schal');
    trigger.focus();
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await settle(fixture);
    expect(document.activeElement).toBe(trigger);
  });
  it('führt bei Tastaturbedienung Fokus zum Gespräch und beim Zurück zur ausgewählten Zeile', async () => {
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    expect(document.activeElement?.getAttribute('data-conversation-heading')).toBe('');
    button(fixture, 'Zur Gesprächsliste').click();
    await settle(fixture);
    expect(store.selectedConversationId()).toBeNull();
    expect(document.activeElement?.textContent).toContain('Anfrage zum Schal');
  });
  it('erklärt den noch nicht gespeicherten ungelesenen Verlauf ohne Lesestatusgarantie', async () => {
    api.readPage.mockResolvedValue(emptyPage);
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('ungelesenen Verlauf gespeichert');
    expect(fixture.nativeElement.textContent).not.toContain('Lesestatus bleibt unverändert');
    expect(fixture.nativeElement.querySelector('a[href*="vinted.de"]')).toBeNull();
  });
  it('wählt bei einem Direktlink ausschließlich ein vorhandenes Konto und dessen Gespräch', async () => {
    params.next(
      convertToParamMap({
        connectionId: accounts[1].connectionId,
        conversationId: 'conversation-1',
      }),
    );
    const fixture = await render();
    await settle(fixture);
    expect(store.selectedConnection()?.connectionId).toBe(accounts[1].connectionId);
    expect(
      fixture.nativeElement.querySelector('[data-message-direction="inbound"]')?.textContent,
    ).toContain('Hallo!');
    params.next(
      convertToParamMap({ connectionId: 'foreign-account', conversationId: 'conversation-1' }),
    );
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('nicht verfügbar');
    expect(store.selectedConnection()?.connectionId).toBe(accounts[1].connectionId);
  });
  it('verarbeitet wechselnde und erneut ausgewählte Gesprächsdirektlinks reaktiv', async () => {
    params.next(
      convertToParamMap({
        connectionId: accounts[1].connectionId,
        conversationId: 'conversation-1',
      }),
    );
    const fixture = await render();
    await settle(fixture);
    params.next(
      convertToParamMap({
        connectionId: accounts[0].connectionId,
        conversationId: 'conversation-1',
      }),
    );
    await settle(fixture);
    await settle(fixture);
    expect(store.selectedConnection()?.connectionId).toBe(accounts[0].connectionId);
    params.next(
      convertToParamMap({
        connectionId: accounts[1].connectionId,
        conversationId: 'conversation-1',
      }),
    );
    await settle(fixture);
    await settle(fixture);
    expect(store.selectedConnection()?.connectionId).toBe(accounts[1].connectionId);
    button(fixture, 'Zur Gesprächsliste').click();
    await settle(fixture);
    params.next(convertToParamMap({}));
    await settle(fixture);
    params.next(
      convertToParamMap({
        connectionId: accounts[1].connectionId,
        conversationId: 'conversation-1',
      }),
    );
    await settle(fixture);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-conversation-heading]')).not.toBeNull();
  });
  it('erhält die Lesestelle beim Voranstellen älterer Nachrichten', async () => {
    const scope = { workspaceId: accounts[0].workspaceId, connectionId: accounts[0].connectionId };
    api.readPage.mockResolvedValueOnce(
      messages(
        scope,
        [
          { id: 'new-1', text: 'Neue 1' },
          { id: 'new-2', text: 'Neue 2' },
        ],
        'older',
      ),
    );
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const log = fixture.nativeElement.querySelector('[role="log"]') as HTMLElement;
    Object.defineProperty(log, 'scrollHeight', {
      configurable: true,
      get: () => log.querySelectorAll('article').length * 100,
    });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 100 });
    log.scrollTop = 40;
    log.dispatchEvent(new Event('scroll'));
    api.readPage.mockResolvedValue(
      messages(scope, [
        { id: 'old-1', text: 'Ältere 1' },
        { id: 'old-2', text: 'Ältere 2' },
      ]),
    );
    button(fixture, 'Ältere Nachrichten').click();
    await settle(fixture);
    expect(log.scrollTop).toBe(240);
    expect(log.textContent?.indexOf('Ältere')).toBeLessThan(log.textContent?.indexOf('Neue') ?? -1);
  });
  it('zeigt verspätete Antworten nach dem Workspacewechsel nicht im neuen Kontext', async () => {
    let resolve!: (value: MarketplacePage<MarketplaceEntry>) => void;
    api.readPage.mockImplementation(
      () => new Promise<MarketplacePage<MarketplaceEntry>>((done) => (resolve = done)),
    );
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    api.listConnections.mockResolvedValue({ canManage: true, connections: [] });
    workspace.set({ id: 'workspace-b', archived_at: null });
    await settle(fixture);
    resolve(
      messages({ workspaceId: accounts[0].workspaceId, connectionId: accounts[0].connectionId }),
    );
    await settle(fixture);
    expect(fixture.nativeElement.textContent).not.toContain('Hallo!');
    expect(fixture.nativeElement.querySelector('[role="log"]')).toBeNull();
  });
  it('erhält Gespräch, Fokus und Leseposition nach einem Hintergrundimport', async () => {
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const log = fixture.nativeElement.querySelector('[role="log"]') as HTMLElement;
    Object.defineProperty(log, 'scrollHeight', {
      configurable: true,
      get: () => log.querySelectorAll('article').length * 100,
    });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 100 });
    log.scrollTop = 45;
    log.dispatchEvent(new Event('scroll'));
    const focused = button(fixture, 'Anfrage zum Schal');
    focused.focus();
    api.readPage.mockImplementation(async (scope: AccountScope) =>
      messages(scope, [
        { id: 'message-4', text: 'Neue Antwort' },
        { id: 'message-1', text: 'Alte Nachricht' },
      ]),
    );
    const connection = store.selectedConnection()!;
    await store.refreshImportedSnapshot(
      { workspaceId: connection.workspaceId, connectionId: connection.connectionId },
      '2026-10-02T12:00:00Z',
    );
    await settle(fixture);
    expect(log.scrollTop).toBe(45);
    expect(document.activeElement).toBe(focused);
    expect(fixture.nativeElement.textContent).toContain('Neue Antwort');
    expect(store.selectedConversationId()).toBe('conversation-1');
  });
  it('behält validierte Gesprächsmetadaten wenn das ausgewählte Gespräch außerhalb der ersten Seite liegt', async () => {
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => ({
      ...snapshot(scope),
      conversations: { items: [], total: 80, nextCursor: 'next-page' },
    }));
    const connection = store.selectedConnection()!;
    await store.refreshImportedSnapshot(
      { workspaceId: connection.workspaceId, connectionId: connection.connectionId },
      '2026-10-02T12:00:00Z',
    );
    await settle(fixture);
    expect(
      fixture.nativeElement.querySelector('[data-conversation-heading]')?.textContent,
    ).toContain('Anfrage zum Schal');
    expect(fixture.nativeElement.textContent).toContain('Hallo!');
  });
  it('zeigt bei einem Lesefehler eine gezielte Wiederholenaktion und anschließend gespeicherte Daten', async () => {
    api.readPage.mockRejectedValueOnce(new Error('Netzfehler'));
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    button(fixture, 'Nachrichten erneut laden').click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Hallo!');
  });
  it('hat einen zugänglichen Gesprächsbereich ohne neue AXE-Verstöße', async () => {
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const result = await axe.run(fixture.nativeElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it('behält geladene Nachrichten und die Lesestelle bei einem Fehler der älteren Seite und wiederholt genau diese Seite', async () => {
    const scope = { workspaceId: accounts[0].workspaceId, connectionId: accounts[0].connectionId };
    api.readPage.mockResolvedValueOnce(
      messages(scope, [{ id: 'new-1', text: 'Bereits geladene Nachricht' }], 'older-page'),
    );
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const log = fixture.nativeElement.querySelector('[role="log"]') as HTMLElement;
    Object.defineProperty(log, 'scrollHeight', {
      configurable: true,
      get: () => log.querySelectorAll('article').length * 100,
    });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 30 });
    log.scrollTop = 35;
    log.dispatchEvent(new Event('scroll'));
    const previousArticle = log.querySelector('article');
    api.readPage.mockRejectedValueOnce(new Error('Netzfehler beim Nachladen'));
    button(fixture, 'Ältere Nachrichten').click();
    await settle(fixture);
    expect(previousArticle?.isConnected).toBe(true);
    expect(log.textContent).toContain('Bereits geladene Nachricht');
    expect(log.scrollTop).toBe(35);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    api.readPage.mockResolvedValueOnce(
      messages(scope, [{ id: 'old-1', text: 'Erfolgreich nachgeladene alte Nachricht' }]),
    );
    button(fixture, 'Ältere Nachrichten erneut laden').click();
    await settle(fixture);
    expect(log.textContent).toContain('Bereits geladene Nachricht');
    expect(log.textContent).toContain('Erfolgreich nachgeladene alte Nachricht');
    expect(log.scrollTop).toBe(135);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('behält den vorhandenen Verlauf bei einem fehlgeschlagenen Hintergrundlesen', async () => {
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const log = fixture.nativeElement.querySelector('[role="log"]') as HTMLElement;
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 100 });
    log.scrollTop = 175;
    log.dispatchEvent(new Event('scroll'));
    const previousArticle = log.querySelector('article');
    api.readPage.mockRejectedValueOnce(new Error('Hintergrundlesen fehlgeschlagen'));
    await store.refreshImportedSnapshot(accounts[0], '2026-10-02T12:00:00Z');
    await settle(fixture);
    expect(previousArticle?.isConnected).toBe(true);
    expect(log.textContent).toContain('Hallo!');
    expect(log.scrollTop).toBe(175);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('wiederholt das zuvor gewählte gespeicherte Gespräch auch außerhalb der ersten Snapshotseite', async () => {
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => ({
      ...snapshot(scope),
      conversations: { items: [], total: 80, nextCursor: 'next-page' },
    }));
    api.readPage.mockRejectedValueOnce(new Error('Netzfehler'));
    await store.refreshImportedSnapshot(accounts[0], '2026-10-02T12:00:00Z');
    await settle(fixture);
    api.readPage.mockImplementationOnce(async (scope: AccountScope) =>
      messages(scope, [{ id: 'retried', text: 'Erneut geladener gespeicherter Verlauf' }]),
    );
    button(fixture, 'Nachrichten erneut laden').click();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Erneut geladener gespeicherter Verlauf');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(store.selectedConnection()?.connectionId).toBe(accounts[0].connectionId);
    expect(store.selectedConversationId()).toBe('conversation-1');
  });

  it('behält den Verlauf bei einem Gesprächslistenfehler und wiederholt nur diese Seite', async () => {
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => {
      const result = snapshot(scope);
      return {
        ...result,
        conversations: { ...result.conversations, total: 2, nextCursor: 'next-conversations' },
      };
    });
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    const log = fixture.nativeElement.querySelector('[role="log"]') as HTMLElement;
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 100 });
    log.scrollTop = 175;
    log.dispatchEvent(new Event('scroll'));
    const previousArticle = log.querySelector('article');
    api.readPage.mockRejectedValueOnce(new Error('Gesprächsliste nicht erreichbar'));
    button(fixture, 'Weitere Gespräche laden').click();
    await settle(fixture);
    expect(previousArticle?.isConnected).toBe(true);
    expect(log.scrollTop).toBe(175);
    api.readPage.mockImplementationOnce(async (scope: AccountScope) => ({
      items: [
        {
          ...snapshot(scope).conversations.items[0],
          id: 'conversation-2',
          title: 'Weiteres Gespräch',
        },
      ],
      total: 2,
      nextCursor: null,
    }));
    button(fixture, 'Weitere Gespräche erneut laden').click();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Weiteres Gespräch');
    expect(log.textContent).toContain('Hallo!');
    expect(log.scrollTop).toBe(175);
    expect(store.selectedConversationId()).toBe('conversation-1');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
});

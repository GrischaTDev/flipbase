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
import type { MarketplaceEntry, MarketplacePage } from '../../models/marketplace-read.models';
import { VintedMessagesComponent } from './vinted-messages.component';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

const accounts = createMarketplaceFixtures().connections;
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
};
let store: MarketplaceAccountStore;
let local: {
  busy: ReturnType<typeof signal<boolean>>;
  messagesAllowed: ReturnType<typeof signal<boolean>>;
  inboxImported: ReturnType<typeof signal<null>>;
  hasValidBinding: ReturnType<typeof vi.fn>;
  approveInbox: ReturnType<typeof vi.fn>;
  syncInbox: ReturnType<typeof vi.fn>;
};
let dialog: { frage: ReturnType<typeof vi.fn> };
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedMessagesComponent,
      path: 'src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts',
    },
    ...[
      [ButtonComponent, 'button'],
      [BadgeComponent, 'badge'],
      [CardComponent, 'card'],
      [ProductThumbnailComponent, 'product-thumbnail'],
    ].map(([type, name]) => ({
      type,
      path: `src/app/shared/components/${name}/${name}.component.ts`,
    })),
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
beforeEach(() => {
  workspace = signal({ id: accounts[0].workspaceId, archived_at: null });
  params = new BehaviorSubject(convertToParamMap({}));
  api = {
    listConnections: vi.fn().mockResolvedValue({ canManage: true, connections: accounts }),
    readSnapshot: vi.fn().mockImplementation(async (scope: AccountScope) => snapshot(scope)),
    readPage: vi.fn().mockImplementation(async (scope: AccountScope) => messages(scope)),
  };
  local = {
    busy: signal(false),
    messagesAllowed: signal(false),
    inboxImported: signal(null),
    hasValidBinding: vi.fn().mockReturnValue(true),
    approveInbox: vi.fn().mockResolvedValue(undefined),
    syncInbox: vi.fn().mockResolvedValue(undefined),
  };
  dialog = { frage: vi.fn().mockResolvedValue(false) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      MarketplaceAccountStore,
      { provide: VintedLocalExtensionStore, useValue: local },
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
      { provide: MarketplaceBrowserTestApiService, useValue: {} },
    ],
  });
  store = TestBed.inject(MarketplaceAccountStore);
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
  ].find((node) => node.textContent?.includes(text));
  if (!result) throw new Error(`Button fehlt: ${text}`);
  return result;
}
describe('Kompakter gespeicherter Vinted-Gesprächsbereich', () => {
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
  it('aktualisiert ein freigegebenes lokales Postfach über die Erweiterung', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accounts[0], executionMode: 'local' }],
    });
    local.messagesAllowed.set(true);
    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain('manuell');
    button(fixture, 'Nachrichten synchronisieren').click();
    await settle(fixture);
    expect(local.syncInbox).toHaveBeenCalledOnce();
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
    expect(host.querySelector('textarea,input')).toBeNull();
    expect(host.querySelector('button')?.textContent).not.toContain('Annehmen');
  });
  it('führt beim Öffnen Fokus zum Gespräch und beim Zurück zur ausgewählten Zeile', async () => {
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    expect(document.activeElement?.getAttribute('data-conversation-heading')).toBe('');
    button(fixture, 'Zur Gesprächsliste').click();
    await settle(fixture);
    expect(store.selectedConversationId()).toBeNull();
    expect(document.activeElement?.textContent).toContain('Anfrage zum Schal');
  });
  it('erklärt den noch nicht importierten ungelesenen Verlauf ohne Vinted zu öffnen', async () => {
    api.readPage.mockResolvedValue(emptyPage);
    const fixture = await render();
    button(fixture, 'Anfrage zum Schal').click();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Vinted-Lesestatus');
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

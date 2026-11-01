import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { EbayAccountApiService } from '../../services/ebay-account-api.service';
import { EbayMessagesComponent } from './ebay-messages.component';

describe('eBay-Postfach: Darstellung und Bedienung', () => {
  let restore: (() => void) | undefined;
  beforeAll(async () => {
    restore = await prepareMarketplaceRendering([
      {
        type: EbayMessagesComponent,
        path: 'src/app/features/marketplaces/components/ebay-messages/ebay-messages.component.ts',
      },
    ]);
  });
  afterAll(() => restore?.());
  const message = {
    id: 'm1',
    createdAt: '2026-11-01T10:00:00Z',
    text: '<script>Fremder Text</script>',
    sender: 'buyer',
    recipient: 'seller',
    attachments: [],
  };
  const conversation = {
    id: 'c1',
    type: 'FROM_MEMBERS' as const,
    title: 'Wollschal',
    unreadCount: 1,
    listingId: '123',
    latestMessage: message,
  };
  let api: {
    loadStatus: ReturnType<typeof vi.fn>;
    loadInbox: ReturnType<typeof vi.fn>;
    loadConversation: ReturnType<typeof vi.fn>;
    sendReply: ReturnType<typeof vi.fn>;
  };
  const user = signal({ id: 'u' });
  const workspace = signal({ id: 'w', archived_at: null });
  beforeEach(() => {
    sessionStorage.clear();
    user.set({ id: 'u' });
    workspace.set({ id: 'w', archived_at: null });
    api = {
      loadStatus: vi.fn(async () => ({
        configured: true,
        messagingAvailable: true,
        connection: {
          workspaceId: 'w',
          connectionId: 'c',
          status: 'connected',
          username: 'seller',
        },
      })),
      loadInbox: vi.fn(async () => ({ conversations: [conversation], total: 1, nextOffset: null })),
      loadConversation: vi.fn(async () => ({ messages: [message], nextOffset: null })),
      sendReply: vi.fn(async () => ({
        ...message,
        id: 'm2',
        sender: 'seller',
        recipient: 'buyer',
        text: 'Hallo zurück',
      })),
    };
    TestBed.configureTestingModule({
      imports: [EbayMessagesComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: user } },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: workspace },
        },
        { provide: EbayAccountApiService, useValue: api },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('erhält eine Antwort bei Sitzungserneuerung und verwirft sie beim Nutzerwechsel', async () => {
    const fixture = TestBed.createComponent(EbayMessagesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    await vi.waitFor(() => expect(component.store.loading()).toBe(false));
    await component.open(conversation);
    component.reply.setValue('Noch nicht gesendet');
    user.set({ id: 'u' });
    workspace.set({ id: 'w', archived_at: null });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.reply.value).toBe('Noch nicht gesendet');
    expect(component.store.selected()?.id).toBe('c1');
    expect(api.loadStatus).toHaveBeenCalledTimes(1);
    user.set({ id: 'other' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.reply.value).toBe('');
    expect(component.store.selected()).toBeNull();
    expect(api.sendReply).not.toHaveBeenCalled();
  });
  it('zeigt Gespräch und Verlauf, behandelt Anbietertext als Text und sendet nur über die Aktion', async () => {
    const fixture = TestBed.createComponent(EbayMessagesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    await vi.waitFor(() => expect(component.store.conversations().length).toBe(1));
    await component.open(conversation);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('script')).toBeNull();
    expect(element.textContent).toContain('<script>Fremder Text</script>');
    component.reply.setValue('Hallo zurück');
    fixture.detectChanges();
    expect(api.sendReply).not.toHaveBeenCalled();
    await component.send();
    expect(api.sendReply).toHaveBeenCalledTimes(1);
    expect(component.reply.value).toBe('');
    fixture.detectChanges();
    expect(
      (await axe.run(element, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([]);
  });
  it('bewahrt ungesendete Texte je Gespräch getrennt', async () => {
    const fixture = TestBed.createComponent(EbayMessagesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    await vi.waitFor(() => expect(component.store.loading()).toBe(false));
    await component.open(conversation);
    component.reply.setValue('Schal-Antwort');
    await component.open({ ...conversation, id: 'c2' });
    expect(component.reply.value).toBe('');
    component.reply.setValue('Andere Antwort');
    await component.open(conversation);
    expect(component.reply.value).toBe('Schal-Antwort');
    expect(api.sendReply).not.toHaveBeenCalled();
  });
});

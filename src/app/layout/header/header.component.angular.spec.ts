import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TRANSLATIONS_DE, TRANSLATIONS_EN } from '../../core/i18n/translations';
import { AuthService } from '../../core/services/auth.service';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
import { PwaService } from '../../core/services/pwa.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ThemeService } from '../../core/services/theme.service';
import { WebhookService } from '../../core/services/webhook.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { HeaderComponent } from './header.component';
import type { AppNotification } from '../../core/models/webhook.models';
import { MarketplaceFeedbackNotificationStore } from '../../features/marketplaces/services/marketplace-feedback-notification.store';
import { MarketplaceFavoriteNotificationStore } from '../../features/marketplaces/services/marketplace-favorite-notification.store';
import { MarketplaceMessageNotificationStore } from '../../features/marketplaces/services/marketplace-message-notification.store';

const generalNotification: AppNotification = {
  id: 'general-1',
  type: 'system',
  title: 'Allgemeiner Hinweis',
  message: 'Allgemeiner Text',
  timestamp: '2026-10-01T10:00:00Z',
  read: false,
  link: '/sales',
};
const favoriteNotification: AppNotification = {
  id: 'marketplace:favorite-1',
  type: 'alert',
  title: 'Neue Favoriten',
  message: 'Nettoanstieg bei einem Inserat',
  timestamp: '2026-10-01T11:00:00Z',
  read: false,
  link: '/marketplaces/vinted/listings',
};

describe('HeaderComponent', () => {
  beforeAll(async () => {
    const resources: Readonly<Record<string, string>> = {
      './header.component.html': 'src/app/layout/header/header.component.html',
      './badge.component.html': 'src/app/shared/components/badge/badge.component.html',
      './badge.component.scss': 'src/app/shared/components/badge/badge.component.scss',
    };
    await ɵresolveComponentResources((url) => {
      const resourcePath = resources[url];
      if (!resourcePath) throw new Error(`Unbekannte Komponenten-Ressource: ${url}`);
      return readFile(resolve(resourcePath), 'utf8');
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  async function renderHeader(
    favorites: AppNotification[] = [],
    unreadFavorites = 0,
    generalNotifications = favorites.length ? [generalNotification] : [],
    feedback: AppNotification[] = [],
    unreadFeedback = feedback.length,
    messages: AppNotification[] = [],
    unreadMessages = messages.length,
  ) {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'de' }),
        {
          provide: AuthService,
          useValue: {
            userName: signal('Daniel'),
            userEmail: signal('daniel@example.com'),
            signOut: vi.fn(),
          },
        },
        {
          provide: WorkspaceService,
          useValue: {
            currentWorkspace: signal({ id: 'workspace-1', name: 'Flipbase' }),
            workspaces: signal([]),
            switchWorkspace: vi.fn(),
          },
        },
        {
          provide: WebhookService,
          useValue: {
            unreadCount: signal(favorites.length ? 1 : 0),
            notifications: signal(generalNotifications),
            markAsRead: vi.fn(),
            markAllAsRead: vi.fn(),
            clearNotifications: vi.fn(),
          },
        },
        {
          provide: MarketplaceFavoriteNotificationStore,
          useValue: {
            notifications: signal(favorites),
            unreadCount: signal(unreadFavorites),
            error: signal<string | null>(null),
            reload: vi.fn(async () => undefined),
            markAsRead: vi.fn(async () => undefined),
            markAllAsRead: vi.fn(async () => undefined),
            clearNotifications: vi.fn(async () => undefined),
          },
        },
        {
          provide: MarketplaceFeedbackNotificationStore,
          useValue: {
            notifications: signal(feedback),
            unreadCount: signal(unreadFeedback),
            reload: vi.fn(async () => undefined),
            markAsRead: vi.fn(async () => undefined),
            markAllAsRead: vi.fn(async () => undefined),
            clearNotifications: vi.fn(async () => undefined),
          },
        },
        {
          provide: MarketplaceMessageNotificationStore,
          useValue: {
            notifications: signal(messages),
            unreadCount: signal(unreadMessages),
            reload: vi.fn(async () => undefined),
            markAsRead: vi.fn(async () => undefined),
            markAllAsRead: vi.fn(async () => undefined),
            clearNotifications: vi.fn(async () => undefined),
          },
        },
        { provide: ConfirmDialogService, useValue: { zeigeHinweis: vi.fn() } },
        { provide: ThemeService, useValue: { isDark: signal(false), toggleTheme: vi.fn() } },
        { provide: PwaService, useValue: { isOnline: signal(true) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: SyncStatusService, useValue: { istZentralGemeldet: vi.fn(() => false) } },
        {
          provide: PlatformOperatorService,
          useValue: { operator: signal(false), isOperator: vi.fn(async () => false) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HeaderComponent);
    const translator = TestBed.inject(TranslateService);
    translator.setTranslation('de', TRANSLATIONS_DE);
    translator.setTranslation('en', TRANSLATIONS_EN);
    await firstValueFrom(translator.use('de'));
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('zeigt Nachrichteneingänge mit Kontogespräch und markiert nur die Flipbase-Meldung', async () => {
    const incoming: AppNotification = {
      ...generalNotification,
      id: 'marketplace-message:7',
      title: 'Neue Nachricht · Testkonto',
      link: '/marketplaces/vinted/messages?connectionId=account-a&conversationId=conversation-a',
    };
    const fixture = await renderHeader([], 0, [], [], 0, [incoming], 67);
    const element = fixture.nativeElement as HTMLElement;
    const bell = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="header-notification-menu"]',
    );
    expect(bell?.textContent).toContain('67');
    bell?.click();
    fixture.detectChanges();
    expect(
      element.querySelector<HTMLAnchorElement>('#header-notification-menu a')?.getAttribute('href'),
    ).toBe(incoming.link);
    const messages = TestBed.inject(MarketplaceMessageNotificationStore);
    await fixture.componentInstance.oeffneBenachrichtigung(incoming);
    expect(messages.markAsRead).toHaveBeenCalledWith('marketplace-message:7');
    expect(TestBed.inject(WebhookService).markAsRead).not.toHaveBeenCalled();
    expect(messages.reload).toHaveBeenCalledOnce();
    await fixture.componentInstance.onMarkAllNotificationsRead();
    await fixture.componentInstance.onClearNotifications();
    expect(messages.markAllAsRead).toHaveBeenCalledOnce();
    expect(messages.clearNotifications).toHaveBeenCalledOnce();
  });

  it('erhält Kontoparameter in Sammellinks und Suchparameter samt Abschnitt in allgemeinen Links', async () => {
    const fixture = await renderHeader(
      [{ ...favoriteNotification, link: '/marketplaces/vinted/listings?connectionId=account-b' }],
      1,
      [{ ...generalNotification, link: '/sales?status=paid#recent' }],
    );
    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector<HTMLButtonElement>('button[aria-controls="header-notification-menu"]')!
      .click();
    fixture.detectChanges();
    const links = [...element.querySelectorAll<HTMLAnchorElement>('#header-notification-menu a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/marketplaces/vinted/listings?connectionId=account-b',
      '/sales?status=paid#recent',
    ]);
  });

  it('zeigt beide Meldungsströme chronologisch und zählt alle ungelesenen Favoriten', async () => {
    const fixture = await renderHeader([favoriteNotification], 70);
    const element = fixture.nativeElement as HTMLElement;
    const bell = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="header-notification-menu"]',
    )!;
    expect(bell.textContent).toContain('71');
    bell.click();
    fixture.detectChanges();
    const items = [...element.querySelectorAll('#header-notification-menu a')];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Neue Favoriten');
    expect(items[1].textContent).toContain('Allgemeiner Hinweis');
    expect(TestBed.inject(MarketplaceFavoriteNotificationStore).reload).toHaveBeenCalledOnce();
    bell.click();
    fixture.detectChanges();
    expect(TestBed.inject(MarketplaceFavoriteNotificationStore).reload).toHaveBeenCalledOnce();
  });

  it('begrenzt die kombinierte Ansicht auf die neuesten 50 Einträge ohne den Zähler abzuschneiden', async () => {
    const favorites = Array.from({ length: 53 }, (_, index) => ({
      ...favoriteNotification,
      id: `marketplace:favorite-${index}`,
      title: `Favoriten ${index}`,
      timestamp: new Date(Date.UTC(2026, 9, 1, 11, index)).toISOString(),
    }));
    const fixture = await renderHeader(favorites, 53);
    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector<HTMLButtonElement>('button[aria-controls="header-notification-menu"]')!
      .click();
    fixture.detectChanges();
    const items = [...element.querySelectorAll('#header-notification-menu a')];
    expect(items).toHaveLength(50);
    expect(items[0].textContent).toContain('Favoriten 52');
    expect(
      element.querySelector('button[aria-controls="header-notification-menu"]')?.textContent,
    ).toContain('54');
  });

  it('entfernt gesperrte Favoriten aus der Glocke und lässt allgemeine Meldungen sichtbar', async () => {
    const fixture = await renderHeader([favoriteNotification], 1);
    const element = fixture.nativeElement as HTMLElement;
    element
      .querySelector<HTMLButtonElement>('button[aria-controls="header-notification-menu"]')!
      .click();
    fixture.detectChanges();
    const store = TestBed.inject(MarketplaceFavoriteNotificationStore);
    const mockedStore = store as unknown as {
      notifications: ReturnType<typeof signal<AppNotification[]>>;
      unreadCount: ReturnType<typeof signal<number>>;
      error: ReturnType<typeof signal<string | null>>;
    };
    mockedStore.notifications.set([]);
    mockedStore.unreadCount.set(0);
    mockedStore.error.set('Favoritenmeldungen konnten nicht geladen werden.');
    fixture.detectChanges();
    expect(element.querySelector('#header-notification-menu')?.textContent).not.toContain(
      'Neue Favoriten',
    );
    expect(element.querySelector('#header-notification-menu')?.textContent).toContain(
      'Allgemeiner Hinweis',
    );
    expect(
      element.querySelector('#header-notification-menu [role="status"]')?.textContent,
    ).toContain('Favoritenmeldungen konnten nicht geladen werden.');
    expect(
      element
        .querySelector('button[aria-controls="header-notification-menu"]')
        ?.textContent?.trim(),
    ).toBe('1');
  });

  it('verwendet eine feste Kopfhoehe und gleich grosse Bedienelemente', async () => {
    const fixture = await renderHeader();
    const element = fixture.nativeElement as HTMLElement;
    const header = element.querySelector('header');
    const workspaceButton = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="header-workspace-menu"]',
    );
    const notificationButton = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="header-notification-menu"]',
    );
    const userButton = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="header-user-menu"]',
    );

    expect(header?.classList).toContain('h-14');
    expect(header?.classList).not.toContain('min-h-14');
    expect(workspaceButton?.classList).toContain('h-9');
    expect(notificationButton?.classList).toContain('h-9');
    expect(notificationButton?.classList).toContain('w-9');
    expect(userButton?.classList).toContain('h-9');
  });
  it('zeigt neue Bewertungen und zählt alle drei Meldungsströme in der Glocke', async () => {
    const review: AppNotification = {
      ...favoriteNotification,
      id: 'marketplace-feedback:7',
      title: 'Neue Bewertung · Maike Vintage',
      message: 'Bewertung von anna · 5 von 5 Sternen.',
      link: '/marketplaces/vinted/profile?connectionId=account-a#reviews',
    };
    const fixture = await renderHeader(
      [favoriteNotification],
      70,
      [generalNotification],
      [review],
      3,
    );
    fixture.componentInstance.toggleNotificationDropdown();
    fixture.detectChanges();
    expect(fixture.componentInstance.unreadCount()).toBe(74);
    expect(fixture.nativeElement.textContent).toContain('Neue Bewertung · Maike Vintage');
    const link = fixture.nativeElement.querySelector(
      'a[href="/marketplaces/vinted/profile?connectionId=account-a#reviews"]',
    );
    expect(link).not.toBeNull();
  });

  it('zeigt Vinted-Logo vor Vinted-Meldungen und verwendet dezenten Ungelesen-Indikator ohne Brand-Surface', async () => {
    const unreadVinted: AppNotification = {
      id: 'marketplace-message:42',
      type: 'alert',
      title: 'Neuer Preisvorschlag · Maike Vintage',
      message: 'Neuer Preisvorschlag von ebruj.',
      timestamp: '2026-10-09T08:37:00Z',
      read: false,
      link: '/marketplaces/vinted/messages?connectionId=acc-1&conversationId=conv-1',
    };
    const purchaseNotif: AppNotification = {
      id: 'general-purchase',
      type: 'purchase',
      title: 'Neuer Einkauf #B 2026 19',
      message: 'Einkaufskosten: 120,00 €.',
      timestamp: '2026-10-09T07:00:00Z',
      read: true,
      link: '/purchases/123',
    };
    const fixture = await renderHeader([], 0, [purchaseNotif], [], 0, [unreadVinted], 1);
    fixture.componentInstance.toggleNotificationDropdown();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const menu = element.querySelector('#header-notification-menu');
    expect(menu).not.toBeNull();

    const vintedImg = menu?.querySelector<HTMLImageElement>(
      'img[src="/images/platforms/vinted.svg"]',
    );
    expect(vintedImg).not.toBeNull();

    const unreadLink = menu?.querySelector<HTMLAnchorElement>(
      'a[href*="/marketplaces/vinted/messages"]',
    );
    expect(unreadLink).not.toBeNull();
    expect(unreadLink?.classList.contains('bg-fb-brand-surface')).toBe(false);
    expect(unreadLink?.querySelector('[title="Ungelesen"]')).not.toBeNull();
  });

  it('zeigt den Benutzer-Avatar mit Flipbase-Gelb und Dropdown-Chevron', async () => {
    const fixture = await renderHeader();
    const element = fixture.nativeElement as HTMLElement;
    const userBtn = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="header-user-menu"]',
    );
    expect(userBtn).not.toBeNull();
    expect(userBtn?.textContent).toContain('D');
    expect(userBtn?.textContent).toContain('▾');

    const avatar = userBtn?.querySelector('.bg-\\[\\#fcc601\\]');
    expect(avatar).not.toBeNull();
  });

  it('bietet im Benutzer-Dropdown segmentierte Umschalter für Design und Sprache', async () => {
    const fixture = await renderHeader();
    fixture.componentInstance.toggleUserDropdown();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const userMenu = element.querySelector('#header-user-menu');
    expect(userMenu).not.toBeNull();
    expect(userMenu?.textContent).toContain('Sprache');
    expect(userMenu?.textContent).toContain('Design');
    expect(userMenu?.textContent).not.toContain('Erscheinungsbild');

    const themeGroup = userMenu?.querySelector('[data-header-action="theme"]');
    const languageGroup = userMenu?.querySelector('[data-header-action="language"]');
    expect(themeGroup).not.toBeNull();
    expect(languageGroup).not.toBeNull();

    const themeButtons = themeGroup?.querySelectorAll('button');
    expect(themeButtons).toHaveLength(2);
    expect(themeButtons?.[0]?.textContent).toContain('Hell');
    expect(themeButtons?.[1]?.textContent).toContain('Dunkel');

    const languageButtons = languageGroup?.querySelectorAll('button');
    expect(languageButtons).toHaveLength(2);
    expect(languageButtons?.[0]?.textContent?.trim()).toBe('DE');
    expect(languageButtons?.[1]?.textContent?.trim()).toBe('EN');
  });
});

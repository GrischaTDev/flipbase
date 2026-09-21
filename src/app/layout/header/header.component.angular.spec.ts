import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

  async function renderHeader(): Promise<HTMLElement> {
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
            unreadCount: signal(0),
            notifications: signal([]),
            markAsRead: vi.fn(),
            markAllAsRead: vi.fn(),
            clearNotifications: vi.fn(),
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
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('verwendet eine feste Kopfhoehe und gleich grosse Bedienelemente', async () => {
    const element = await renderHeader();
    const header = element.querySelector('header');
    const workspaceButton = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="header-workspace-menu"]',
    );
    const notificationButton = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="header-notification-menu"]',
    );
    const themeButton = element.querySelector<HTMLButtonElement>(
      'button[data-header-action="theme"]',
    );
    const languageSwitch = element.querySelector('[data-header-action="language"]');
    const userButton = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="header-user-menu"]',
    );

    expect(header?.classList).toContain('h-14');
    expect(header?.classList).not.toContain('min-h-14');
    expect(workspaceButton?.classList).toContain('h-9');
    for (const button of [notificationButton, themeButton]) {
      expect(button?.classList).toContain('h-9');
      expect(button?.classList).toContain('w-9');
    }
    expect(languageSwitch?.classList).toContain('h-9');
    expect(userButton?.classList).toContain('h-9');
  });
});

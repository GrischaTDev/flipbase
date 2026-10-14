import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { provideRouter, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { App } from './app';
import { StoreLayoutComponent } from './features/store/store-layout/store-layout.component';
import { ToastService } from './shared/components/toast/toast.service';
import { ToastSyncBridgeService } from './shared/components/toast/toast-sync-bridge.service';
import { PwaService } from './core/services/pwa.service';
import { PushNavigationService } from './core/services/push-navigation.service';
import { OfflinePurchaseContextService } from './features/purchases/services/offline-purchase-context.service';
import { AppStartupService } from './core/services/app-startup.service';
import { WebPushService } from './core/services/web-push.service';

beforeAll(async () => {
  registerLocaleData(localeDe);
  const dateien: Record<string, string> = {
    './button.component.scss': 'src/app/shared/components/button/button.component.scss',
    './button.component.html': 'src/app/shared/components/button/button.component.html',
    './pwa-update-notice.component.html':
      'src/app/shared/components/pwa-update-notice/pwa-update-notice.component.html',
    './push-navigation-notice.component.html':
      'src/app/shared/components/push-navigation-notice/push-navigation-notice.component.html',
    './pwa-install-dialog.component.html':
      'src/app/shared/components/pwa-install-dialog/pwa-install-dialog.component.html',
    './modal-shell.component.html':
      'src/app/shared/components/modal-shell/modal-shell.component.html',
    './modal-shell.component.scss':
      'src/app/shared/components/modal-shell/modal-shell.component.scss',
    './app.html': 'src/app/app.html',
    './app.css': 'src/app/app.css',
    './toast-container.component.html':
      'src/app/shared/components/toast/toast-container.component.html',
    './toast-container.component.scss':
      'src/app/shared/components/toast/toast-container.component.scss',
    './store-layout.component.html':
      'src/app/features/store/store-layout/store-layout.component.html',
    './store-cart-drawer.component.html':
      'src/app/features/store/components/store-cart-drawer/store-cart-drawer.component.html',
  };
  await ɵresolveComponentResources(async (url) => {
    const datei = dateien[url];
    if (!datei) throw new Error(`Unbekannte Test-Ressource: ${url}`);
    return readFile(resolve(datei), { encoding: 'utf8' });
  });
});

describe('root-globaler Toast-Container', () => {
  it('rendert auch außerhalb einer Feature-Route Erfolgs- und Fehlermeldungen', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: 'shop', component: StoreLayoutComponent }]),
        {
          provide: TranslateService,
          useValue: { setTranslation: () => undefined, use: () => undefined },
        },
        { provide: ToastSyncBridgeService, useValue: {} },
        { provide: WebPushService, useValue: {} },
        {
          provide: PwaService,
          useValue: { updateAvailable: signal(false), installDialogOpen: signal(false) },
        },
        { provide: PushNavigationService, useValue: { pending: signal(null) } },
        { provide: OfflinePurchaseContextService, useValue: {} },
        { provide: AppStartupService, useValue: { markRouteRendered: () => undefined } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    const toast = TestBed.inject(ToastService);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/shop');
    await fixture.whenStable();

    toast.success('Bestellung bestätigt');
    toast.error('Checkout fehlgeschlagen');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(router.url).toBe('/shop');
    expect(root.querySelector('app-store-layout')).not.toBeNull();
    expect(root.querySelector('section[aria-label="Benachrichtigungen"]')).not.toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Bestellung bestätigt');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Checkout fehlgeschlagen');
  });
});

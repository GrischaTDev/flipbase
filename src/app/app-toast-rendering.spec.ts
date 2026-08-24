import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { provideRouter, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { App } from './app';
import { StoreLayoutComponent } from './features/store/store-layout/store-layout.component';
import { ToastService } from './shared/components/toast/toast.service';
import { ToastSyncBridgeService } from './shared/components/toast/toast-sync-bridge.service';

beforeAll(async () => {
  registerLocaleData(localeDe);
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  const dateien: Record<string, string> = {
    './app.html': 'src/app/app.html',
    './app.css': 'src/app/app.css',
    './toast-container.component.html':
      'src/app/shared/components/toast/toast-container.component.html',
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
afterAll(() => TestBed.resetTestEnvironment());

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

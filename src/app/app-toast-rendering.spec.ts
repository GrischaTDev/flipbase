import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { App } from './app';
import { ToastService } from './shared/components/toast/toast.service';
import { ToastSyncBridgeService } from './shared/components/toast/toast-sync-bridge.service';

beforeAll(async () => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  const dateien: Record<string, string> = {
    './app.html': 'src/app/app.html',
    './app.css': 'src/app/app.css',
    './toast-container.component.html':
      'src/app/shared/components/toast/toast-container.component.html',
  };
  await ɵresolveComponentResources(async (url) =>
    readFile(resolve(dateien[url]), { encoding: 'utf8' }),
  );
});
afterAll(() => TestBed.resetTestEnvironment());

describe('root-globaler Toast-Container', () => {
  it('rendert auch außerhalb einer Feature-Route Erfolgs- und Fehlermeldungen', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: TranslateService,
          useValue: { setTranslation: () => undefined, use: () => undefined },
        },
        { provide: ToastSyncBridgeService, useValue: {} },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    const toast = TestBed.inject(ToastService);

    toast.success('Bestellung bestätigt');
    toast.error('Checkout fehlgeschlagen');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('section[aria-label="Benachrichtigungen"]')).not.toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Bestellung bestätigt');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Checkout fehlgeschlagen');
  });
});

import '@angular/compiler';
import { Component, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BottomNavComponent } from './bottom-nav.component';

class TestPageComponent {}
Component({ selector: 'app-test-page', template: '' })(TestPageComponent);

describe('Mobile Vinted-Navigation', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
  });
  afterEach(() => TestBed.resetTestingModule());
  it('zeigt eBay-Schnellziele und markiert den Editor unter Inseraten', async () => {
    TestBed.configureTestingModule({
      imports: [BottomNavComponent],
      providers: [provideRouter([{ path: '**', component: TestPageComponent }])],
    });
    const fixture = TestBed.createComponent(BottomNavComponent);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/marketplaces/ebay/listings/123/edit?connection=a');
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect([...element.querySelectorAll('a')].map((link) => link.textContent?.trim())).toEqual([
      'Flipbase',
      'Inserate',
      'Bestellungen',
      'Statistiken',
    ]);
    expect(element.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe(
      '/marketplaces/ebay/listings',
    );
    await router.navigateByUrl('/marketplaces/ebay/orders');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe(
      '/marketplaces/ebay/orders',
    );
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('a[href="/purchases"]')).not.toBeNull();
  });
  it('wechselt zwischen Vinted und Flipbase und markiert auch Inseratdetails', async () => {
    TestBed.configureTestingModule({
      imports: [BottomNavComponent],
      providers: [provideRouter([{ path: '**', component: TestPageComponent }])],
    });
    const fixture = TestBed.createComponent(BottomNavComponent);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/marketplaces/vinted/listings/account-a/item-a');
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('a[href="/purchases"]')).toBeNull();
    expect(
      element
        .querySelector('a[href="/marketplaces/vinted/listings"]')
        ?.getAttribute('aria-current'),
    ).toBe('page');
    expect(element.querySelector('a[href="/dashboard"]')?.textContent).toContain('Flipbase');
    let menuOpened = false;
    fixture.componentInstance.toggleMenu.subscribe(() => {
      menuOpened = true;
    });
    element.querySelector<HTMLButtonElement>('button')?.click();
    expect(menuOpened).toBe(true);
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('a[href="/purchases"]')).not.toBeNull();
    expect(element.querySelector('a[href="/marketplaces/vinted/messages"]')).toBeNull();
  });
});

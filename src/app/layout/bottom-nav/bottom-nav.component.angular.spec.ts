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

import '@angular/compiler';
import { Component, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VintedBotShellComponent } from './vinted-bot-shell.component';
import { SniperAdminState } from '../services/sniper-admin-state';

class TestPageComponent {}
Component({ selector: 'app-test-page', template: '<h1>Botbereich</h1>' })(TestPageComponent);
let allowOperation = true;

describe('VintedBotShellComponent', () => {
  beforeEach(async () => {
    await ɵresolveComponentResources(() =>
      readFile(
        'src/app/features/platform-admin/vinted-bot-shell/vinted-bot-shell.component.html',
        'utf8',
      ),
    );
    allowOperation = true;
    TestBed.overrideComponent(VintedBotShellComponent, {
      set: {
        template: await readFile(
          'src/app/features/platform-admin/vinted-bot-shell/vinted-bot-shell.component.html',
          'utf8',
        ),
        templateUrl: undefined,
        providers: [{ provide: SniperAdminState, useValue: {} }],
      },
    });
    await TestBed.configureTestingModule({
      imports: [VintedBotShellComponent],
      providers: [
        provideRouter([
          {
            path: 'admin/vinted-bot',
            children: [
              { path: 'queries', component: TestPageComponent },
              {
                path: 'operation',
                canActivate: [() => allowOperation],
                component: TestPageComponent,
              },
            ],
          },
        ]),
      ],
    }).compileComponents();
  });
  afterEach(() => TestBed.resetTestingModule());

  it('renders both existing routes in one continuous surface without an inner sidebar', async () => {
    const fixture = TestBed.createComponent(VintedBotShellComponent);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    for (const section of ['queries', 'operation']) {
      await router.navigateByUrl('/admin/vinted-bot/' + section);
      await fixture.whenStable();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).toContain('Botbereich');
      expect(element.querySelector('nav')).toBeNull();
      expect(element.querySelector('app-custom-select')).toBeNull();
    }
  });

  it('does not replace the active content when a route guard rejects navigation', async () => {
    const fixture = TestBed.createComponent(VintedBotShellComponent);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/admin/vinted-bot/queries');
    await fixture.whenStable();
    allowOperation = false;
    expect(await router.navigateByUrl('/admin/vinted-bot/operation')).toBe(false);
    expect(router.url).toBe('/admin/vinted-bot/queries');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Botbereich');
  });
});

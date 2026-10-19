import { SupabaseService } from '../../../../core/services/supabase.service';
import '@angular/compiler';
import { Component, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { glob, readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MarketplaceSettingsService } from '../../../../core/services/marketplace-settings.service';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { MarketplacePlatformPickerComponent } from '../../../../shared/components/marketplace-platform-picker/marketplace-platform-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { MarketplacesSettingsComponent } from './marketplaces-settings.component';

class MockPageComponent {}
Component({ selector: 'app-mock-page', template: '' })(MockPageComponent);

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

describe('MarketplacesSettingsComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const fileName = url.replace(/^\.\//, '');
      const matches: string[] = [];
      for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
      if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
      return readFile(matches[0], 'utf8');
    });

    registerSignalInputs(MarketplacesSettingsComponent, ['showAccountManagement']);
    registerSignalInputs(CardComponent, ['padding']);
    registerSignalInputs(MarketplacePlatformPickerComponent, [
      'presentation',
      'platforms',
      'selectedPlatforms',
      'disabledPlatforms',
      'disabled',
    ]);
    const pickerMetadata = (
      MarketplacePlatformPickerComponent as unknown as { ɵcmp: AngularInputMetadata }
    ).ɵcmp;
    pickerMetadata.outputs = { ...pickerMetadata.outputs, platformSelected: 'platformSelected' };
    registerSignalInputs(ButtonComponent, ['size', 'icon', 'link', 'variant', 'wrapLabel']);
  });

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [MarketplacesSettingsComponent],
      providers: [
        provideRouter([
          { path: 'marketplaces/vinted/accounts', component: MockPageComponent },
          { path: 'marketplaces/ebay', component: MockPageComponent },
          { path: 'marketplaces/kleinanzeigen', component: MockPageComponent },
        ]),
        MarketplaceSettingsService,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: () => {
                const query = {
                  select: () => query,
                  eq: () => query,
                  maybeSingle: async () => ({
                    data: { vinted: true, ebay: true, kleinanzeigen: true },
                    error: null,
                  }),
                };
                return query;
              },
              rpc: async (
                _name: string,
                value: { p_vinted: boolean; p_ebay: boolean; p_kleinanzeigen: boolean },
              ) => ({
                data: {
                  vinted: value.p_vinted,
                  ebay: value.p_ebay,
                  kleinanzeigen: value.p_kleinanzeigen,
                },
                error: null,
              }),
            },
          },
        },
      ],
    }).compileComponents();
    await TestBed.inject(MarketplaceSettingsService).load('test-user', 'test-workspace');
  });

  afterEach(() => TestBed.resetTestingModule());

  it('rendert alle drei Marktplätze mit ihren Toggles', () => {
    const fixture = TestBed.createComponent(MarketplacesSettingsComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Vinted');
    expect(element.textContent).toContain('eBay');
    expect(element.textContent).toContain('Kleinanzeigen');
    expect(element.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(3);
  });

  it('schaltet die Sichtbarkeit eines Marktplatzes unabhängig von der Kontoverwaltung um', async () => {
    const fixture = TestBed.createComponent(MarketplacesSettingsComponent);
    const service = TestBed.inject(MarketplaceSettingsService);
    fixture.detectChanges();

    await fixture.componentInstance.onToggle('vinted', false);
    fixture.detectChanges();

    expect(service.isVintedEnabled()).toBe(false);
    expect(
      fixture.nativeElement
        .querySelector('button[aria-label="Vinted"]')
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });
  it('bietet im Sichtbarkeitsdialog nur Marktplatzschalter ohne Kontoverwaltung', () => {
    const fixture = TestBed.createComponent(MarketplacesSettingsComponent);
    fixture.componentRef.setInput('showAccountManagement', false);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('a')).toHaveLength(0);
    expect(element.querySelectorAll('app-card')).toHaveLength(0);
    expect(element.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(3);
  });
  it('bietet die zentrale Verwaltung an, wenn die Route keinen Sichtbarkeitswert liefert', () => {
    const fixture = TestBed.createComponent(MarketplacesSettingsComponent);
    fixture.componentRef.setInput('showAccountManagement', undefined);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('a')).toHaveLength(1);
    expect(element.querySelector('a[href="/marketplaces/overview"]')).not.toBeNull();
  });
  it('behält die zentrale Verwaltung nach dem Ausblenden eines Marktplatzes erreichbar', async () => {
    const fixture = TestBed.createComponent(MarketplacesSettingsComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('a[href="/marketplaces/overview"]')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('button[aria-label="eBay"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(MarketplaceSettingsService).isEbayEnabled()).toBe(false);
    expect(element.querySelector('button[aria-label="eBay"]')?.getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(element.querySelector('a[href="/marketplaces/overview"]')).not.toBeNull();
  });
});

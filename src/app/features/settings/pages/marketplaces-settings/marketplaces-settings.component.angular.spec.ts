import '@angular/compiler';
import { Component, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { glob, readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MarketplaceSettingsService } from '../../../../core/services/marketplace-settings.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { MarketplacesSettingsComponent } from './marketplaces-settings.component';

class MockPageComponent {}
Component({ selector: 'app-mock-page', template: '' })(MockPageComponent);

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
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

    registerSignalInputs(CardComponent, ['padding']);
    registerSignalInputs(BadgeComponent, ['tone']);
    registerSignalInputs(CustomCheckboxComponent, ['checked', 'ariaLabel']);
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
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('rendert alle drei Marktplätze mit ihren Toggles', () => {
    const fixture = TestBed.createComponent(MarketplacesSettingsComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Vinted Hub');
    expect(element.textContent).toContain('eBay');
    expect(element.textContent).toContain('Kleinanzeigen');
    expect(element.textContent).toContain('3 von 3 aktiv');
  });

  it('schaltet Marktplätze um, wenn Checkbox geändert wird', () => {
    const fixture = TestBed.createComponent(MarketplacesSettingsComponent);
    const service = TestBed.inject(MarketplaceSettingsService);
    fixture.detectChanges();

    fixture.componentInstance.onToggle('vinted', false);
    fixture.detectChanges();

    expect(service.isVintedEnabled()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('2 von 3 aktiv');
  });
});

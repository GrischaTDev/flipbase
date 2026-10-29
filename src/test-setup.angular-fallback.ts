import '@angular/compiler';
import {
  ɵclearResolutionOfComponentResourcesQueue,
  ɵrestoreComponentResolutionQueue,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, beforeAll } from 'vitest';
import { teardownAngularRendering } from './test-support/angular-test-teardown';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

let restoreBindings: (() => void) | undefined;
beforeAll(async () => {
  // Nur bereits vom Test importierte gemeinsame Komponenten vorbereiten.
  // Diensttests brauchen dadurch weder Button noch dessen gesamte Symbolbibliothek.
  const queue = ɵclearResolutionOfComponentResourcesQueue();
  ɵrestoreComponentResolutionQueue(queue);
  const sharedPaths = new Map([
    ['ButtonComponent', 'src/app/shared/components/button/button.component.ts'],
    ['FormFieldComponent', 'src/app/shared/components/form-field/form-field.component.ts'],
  ]);
  const components = [...queue.keys()].flatMap((type) => {
    const path = sharedPaths.get(type.name);
    return path ? [{ type, path }] : [];
  });
  if (components.length) {
    const { prepareMarketplaceRendering } = await import('../e2e/support/marketplace-rendering');
    restoreBindings = await prepareMarketplaceRendering(components);
  }
});
afterAll(() => teardownAngularRendering(restoreBindings));

import {
  ChangeDetectionStrategy,
  Component,
  ɵclearResolutionOfComponentResourcesQueue,
  ɵrestoreComponentResolutionQueue,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FirstRenderingChild } from './fixtures/first/child';
import { RenderingHost } from './fixtures/host';
import { prepareMarketplaceRendering } from '../../e2e/support/marketplace-rendering';
import { teardownAngularRendering } from './angular-test-teardown';

const host = {
  type: RenderingHost,
  path: 'src/test-support/fixtures/host.ts',
};
interface Metadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}
const definition = () => (FirstRenderingChild as unknown as { ɵcmp: Metadata }).ɵcmp;

afterEach(() => TestBed.resetTestingModule());

describe('Angular-JIT-Testvorbereitung', () => {
  it('löst transitive und umbenannte Ressourcen verzeichnisgenau auf und erhält Signal-Aliase', async () => {
    const restore = await prepareMarketplaceRendering([host]);
    try {
      TestBed.configureTestingModule({
        imports: [RenderingHost],
        errorOnUnknownElements: true,
        errorOnUnknownProperties: true,
      });
      const fixture = TestBed.createComponent(RenderingHost);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Aliase funktionieren: false');
      expect(fixture.nativeElement.textContent).toContain('Eigenständige zweite Ressource');
      fixture.nativeElement.querySelector('button').click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selected()).toBe(true);
      expect(fixture.componentInstance.lastConfirmation()).toBe('Aliase funktionieren');
      expect(fixture.nativeElement.textContent).toContain('Aliase funktionieren: true');
      fixture.destroy();
    } finally {
      restore();
    }
  });

  it('bindet vom Builder umbenannte Klassen weiterhin an ihre eindeutigen Quellen', async () => {
    const hostName = RenderingHost.name;
    const childName = FirstRenderingChild.name;
    Object.defineProperty(RenderingHost, 'name', { value: 'BundledHost', configurable: true });
    Object.defineProperty(FirstRenderingChild, 'name', {
      value: 'BundledChild',
      configurable: true,
    });
    let restore: (() => void) | undefined;
    try {
      restore = await prepareMarketplaceRendering([host]);
      TestBed.configureTestingModule({ imports: [RenderingHost], errorOnUnknownProperties: true });
      const fixture = TestBed.createComponent(RenderingHost);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('button').click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selected()).toBe(true);
      expect(fixture.componentInstance.lastConfirmation()).toBe('Aliase funktionieren');
      fixture.destroy();
    } finally {
      restore?.();
      Object.defineProperty(RenderingHost, 'name', { value: hostName, configurable: true });
      Object.defineProperty(FirstRenderingChild, 'name', { value: childName, configurable: true });
    }
  });

  it('zerstört lebende Fixtures vor dem Zurücksetzen ihrer Bindungsmetadaten', async () => {
    const restore = await prepareMarketplaceRendering([host]);
    const order: string[] = [];
    TestBed.configureTestingModule({ imports: [RenderingHost] });
    const fixture = TestBed.createComponent(RenderingHost);
    fixture.detectChanges();
    fixture.componentRef.onDestroy(() => {
      order.push('destroy');
      expect(definition().inputs['label']).toBeDefined();
    });
    // Diese Änderung plant noch einen Renderlauf nach dem synchronen Testende.
    fixture.componentInstance.selected.set(true);
    try {
      teardownAngularRendering(() => {
        order.push('restore');
        restore();
      });
      expect(fixture.componentRef.hostView.destroyed).toBe(true);
      expect(order).toEqual(['destroy', 'restore']);
    } finally {
      TestBed.resetTestingModule();
      restore();
    }
  });

  it('stellt die ursprünglichen Metadaten nach verschachtelter Vorbereitung exakt wieder her', async () => {
    const outerRestore = await prepareMarketplaceRendering([host]);
    try {
      const original = { ...definition() };
      const restore = await prepareMarketplaceRendering([host]);
      expect(definition().inputs).not.toBe(original.inputs);
      restore();
      restore();
      expect(definition().inputs).toBe(original.inputs);
      expect(definition().declaredInputs).toBe(original.declaredInputs);
      expect(definition().outputs).toBe(original.outputs);
    } finally {
      outerRestore();
    }
  });

  it('weist widersprüchliche Bindungen zurück und hinterlässt keine teilweise ersetzten Metadaten', async () => {
    const outerRestore = await prepareMarketplaceRendering([host]);
    const metadata = definition();
    const original = metadata.outputs;
    metadata.outputs = { ...metadata.outputs, confirmed: 'wrongProperty' };
    const conflicting = metadata.outputs;
    try {
      await expect(prepareMarketplaceRendering([host])).rejects.toThrow(
        'Widersprüchlicher Testausgang',
      );
      expect(metadata.outputs).toBe(conflicting);
    } finally {
      metadata.outputs = original;
      outerRestore();
    }
  });

  it('meldet echte fehlende Ressourcen und erhält die Queue für einen korrigierten Versuch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flipbase-angular-resource-'));
    const previousQueue = ɵclearResolutionOfComponentResourcesQueue();
    class ForeignRenderingResource {}
    Component({
      selector: 'app-test-foreign-resource',
      templateUrl: './foreign-unread.html',
      changeDetection: ChangeDetectionStrategy.OnPush,
    })(ForeignRenderingResource);
    class MissingRenderingResource {}
    Component({
      selector: 'app-test-missing-resource',
      templateUrl: './missing.html',
      changeDetection: ChangeDetectionStrategy.OnPush,
    })(MissingRenderingResource);
    const path = join(directory, 'missing.ts');
    await writeFile(path, 'export class MissingRenderingResource {}');
    try {
      await expect(
        prepareMarketplaceRendering([{ type: MissingRenderingResource, path }]),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      const failedQueue = ɵclearResolutionOfComponentResourcesQueue();
      expect(failedQueue.has(MissingRenderingResource)).toBe(true);
      expect(failedQueue.get(ForeignRenderingResource)?.templateUrl).toBe('./foreign-unread.html');
      ɵrestoreComponentResolutionQueue(failedQueue);
      await writeFile(join(directory, 'missing.html'), '<p>Nach Korrektur verfügbar</p>');
      const restore = await prepareMarketplaceRendering([{ type: MissingRenderingResource, path }]);
      try {
        const remainingQueue = ɵclearResolutionOfComponentResourcesQueue();
        expect(remainingQueue.has(MissingRenderingResource)).toBe(false);
        expect(remainingQueue.get(ForeignRenderingResource)?.templateUrl).toBe(
          './foreign-unread.html',
        );
        // Die fremde Komponente gehört nicht zur nachfolgenden TestBed-Fixture.
        TestBed.configureTestingModule({ imports: [MissingRenderingResource] });
        const fixture = TestBed.createComponent(MissingRenderingResource);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Nach Korrektur verfügbar');
        fixture.destroy();
      } finally {
        restore();
      }
    } finally {
      ɵrestoreComponentResolutionQueue(previousQueue);
      await rm(directory, { recursive: true, force: true });
    }
  });
});

import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import type { ListingImageDraft } from '../../models/listing.models';
import { ListingImageEditorComponent } from './listing-image-editor.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}
const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(ListingImageEditorComponent, ['images', 'disabled']);
  registerSignalInputs(ButtonComponent, [
    'variant',
    'size',
    'icon',
    'iconOnly',
    'disabled',
    'ariaLabel',
    'title',
  ]);
});

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});

afterEach(() => TestBed.resetTestingModule());

describe('ListingImageEditorComponent', () => {
  it('shows a touch-sortable grid with named icon actions and keeps title image order', () => {
    const fixture = TestBed.createComponent(ListingImageEditorComponent);
    const images: ListingImageDraft[] = ['eins', 'zwei', 'drei'].map((name) => ({
      key: name,
      storagePath: `items/${name}.jpg`,
      file: null,
      fileName: `${name}.jpg`,
      previewUrl: '',
    }));
    fixture.componentRef.setInput('images', images);
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector('ol') as HTMLOListElement;
    expect(list.classList.contains('cdk-drop-list')).toBe(true);
    expect(list.querySelectorAll('li.cdk-drag')).toHaveLength(3);
    expect(list.querySelector('button[aria-label="drei.jpg entfernen"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Entfernen');
    expect(fixture.componentInstance.dragStartDelay.touch).toBeGreaterThan(0);

    let reordered: readonly ListingImageDraft[] = [];
    fixture.componentInstance.imagesChange.subscribe((value) => (reordered = value));
    fixture.componentInstance.onReordered({
      previousIndex: 2,
      currentIndex: 0,
    } as CdkDragDrop<unknown>);

    expect(reordered.map((image) => image.key)).toEqual(['drei', 'eins', 'zwei']);
    expect(fixture.componentInstance.drafts()[0]?.fileName).toBe('drei.jpg');
    fixture.destroy();
  });
});

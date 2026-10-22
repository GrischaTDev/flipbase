import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { VintedListingMediaComponent } from './vinted-listing-media.component';

afterEach(() => TestBed.resetTestingModule());
it('erhält gespeicherte Pfade bei Namen und ersetzt sie erst für neue Bilddateien', () => {
  const component = TestBed.runInInjectionContext(() => new VintedListingMediaComponent());
  const first = {
    key: '1',
    file: null,
    fileName: 'alt.jpg',
    storagePath: 'workspace/1/1.jpg',
    previewUrl: 'https://example.test/1.jpg',
  };
  Object.assign(component, { images: signal([first]) });
  const changed = vi.fn();
  component.imagesChange.subscribe(changed);
  component.change([{ ...component.media()[0], fileName: 'neu.jpg' }]);
  expect(changed.mock.calls[0][0][0]).toMatchObject({
    storagePath: first.storagePath,
    fileName: 'neu.jpg',
    file: null,
  });
  const file = new File(['crop'], 'crop.jpg', { type: 'image/jpeg' });
  component.change([{ ...component.media()[0], file, previewUrl: 'data:crop' }]);
  expect(changed.mock.calls[1][0][0]).toMatchObject({ storagePath: null, previewUrl: 'data:crop' });
});

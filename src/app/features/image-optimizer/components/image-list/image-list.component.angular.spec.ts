import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { defaultAdjustments } from '../../services/adjustments';
import type { OptimizerImage } from '../../models/optimizer-image';
import { ImageListComponent } from './image-list.component';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => {
    const path = url.includes('badge.component')
      ? `../../../../shared/components/badge/${url}`
      : url;
    return readFile(new URL(path, import.meta.url), 'utf8');
  });
});

afterEach(() => TestBed.resetTestingModule());

it('shows the GPS warning as text without a projected decorative marker', () => {
  const image: OptimizerImage = {
    id: 'gps-image',
    file: new File([''], 'gps.jpg', { type: 'image/jpeg' }),
    dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: { width: 1, height: 1 },
    reviewed: false,
    adjustments: defaultAdjustments(),
    metadata: {
      status: 'read',
      gps: { latitude: 52.5, longitude: 13.4 },
      fields: [],
      ai: { contentCredential: 'absent', declaredSource: null },
      capturedAt: null,
    },
  };
  // Der Fallback-Compiler benötigt die Signal-Metadaten explizit.
  interface Metadata {
    inputs: Record<string, unknown>;
    declaredInputs: Record<string, string>;
  }
  const patches = [
    { type: ImageListComponent, names: ['images', 'activeId', 'disabled', 'reviewedCount'] },
    { type: BadgeComponent, names: ['tone', 'size', 'mono'] },
  ].map(({ type, names }) => {
    const metadata = (type as unknown as { ɵcmp: Metadata }).ɵcmp;
    const original = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
    metadata.inputs = { ...metadata.inputs };
    metadata.declaredInputs = { ...metadata.declaredInputs };
    for (const name of names) {
      metadata.inputs[name] = [name, 1, null];
      metadata.declaredInputs[name] = name;
    }
    return { metadata, original };
  });
  try {
    TestBed.configureTestingModule({ imports: [ImageListComponent] });
    const fixture = TestBed.createComponent(ImageListComponent);
    fixture.componentRef.setInput('images', [image]);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const badge = host.querySelector('app-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('GPS');
    expect(badge?.textContent).toContain('Enthält Standortdaten.');
    expect(badge?.querySelector('[aria-hidden="true"], svg, [data-badge-marker]')).toBeNull();
    fixture.destroy();
  } finally {
    for (const { metadata, original } of patches) Object.assign(metadata, original);
  }
});

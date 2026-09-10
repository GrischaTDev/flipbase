import '@angular/compiler';
import { createComponent, EnvironmentInjector, ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BadgeComponent } from './badge.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('BadgeComponent', () => {
  let component: BadgeComponent;
  let fixture: ComponentFixture<BadgeComponent>;

  beforeEach(async () => {
    const metadata = (BadgeComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      tone: ['tone', 1, null],
      size: ['size', 1, null],
      mono: ['mono', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      tone: 'tone',
      size: 'size',
      mono: 'mono',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BadgeComponent],
    });

    fixture = TestBed.createComponent(BadgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (BadgeComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('should apply success tone styling', () => {
    fixture.componentRef.setInput('tone', 'success');
    fixture.detectChanges();

    const span: HTMLElement = fixture.nativeElement.querySelector('span');
    expect(span.className).toContain('text-emerald-300');
  });

  it('does not expose decorative marker, icon or uppercase variants', () => {
    for (const removedInput of ['dot', 'marker', 'pulse', 'icon', 'uppercase']) {
      expect(removedInput in component, removedInput).toBe(false);
    }
  });

  it.each(['neutral', 'info', 'success', 'caution', 'critical'])(
    'renders %s status as unchanged text without a marker',
    (tone) => {
      const host = document.createElement('div');
      const projected = createComponent(BadgeComponent, {
        hostElement: host,
        environmentInjector: TestBed.inject(EnvironmentInjector),
        projectableNodes: [[document.createTextNode('Bestellt · SKU ABC')]],
      });
      try {
        projected.setInput('tone', tone);
        projected.changeDetectorRef.detectChanges();
        const badge = host.querySelector('span');
        expect(badge?.textContent).toBe('Bestellt · SKU ABC');
        expect(badge?.querySelector('[data-badge-marker], svg, [aria-hidden="true"]')).toBeNull();
        expect(badge?.className).not.toMatch(/uppercase|tracking-wider/);
      } finally {
        projected.destroy();
      }
    },
  );
});

import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
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
      dot: ['dot', 1, null],
      marker: ['marker', 1, null],
      pulse: ['pulse', 1, null],
      icon: ['icon', 1, null],
      mono: ['mono', 1, null],
      uppercase: ['uppercase', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      tone: 'tone',
      size: 'size',
      dot: 'dot',
      marker: 'marker',
      pulse: 'pulse',
      icon: 'icon',
      mono: 'mono',
      uppercase: 'uppercase',
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

  it('should render dot when dot input is true', () => {
    fixture.componentRef.setInput('dot', true);
    fixture.detectChanges();

    const dotSpan = fixture.nativeElement.querySelector('span > span');
    expect(dotSpan).toBeTruthy();
    expect(dotSpan.className).toContain('rounded-full');
  });

  it('renders the Shopify-style square marker for table statuses', () => {
    fixture.componentRef.setInput('marker', 'square');
    fixture.detectChanges();

    const marker = fixture.nativeElement.querySelector('[data-badge-marker]') as HTMLElement;
    expect(marker).toBeTruthy();
    expect(marker.className).toContain('rounded-[2px]');
    expect(marker.className).not.toContain('rounded-full');
  });
});

import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TwoColumnLayoutComponent } from './two-column-layout.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('TwoColumnLayoutComponent', () => {
  let component: TwoColumnLayoutComponent;
  let fixture: ComponentFixture<TwoColumnLayoutComponent>;

  beforeEach(async () => {
    const metadata = (TwoColumnLayoutComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      ratio: ['ratio', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      ratio: 'ratio',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TwoColumnLayoutComponent],
    });

    fixture = TestBed.createComponent(TwoColumnLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (TwoColumnLayoutComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('should apply 2/3 (col-span-8) and 1/3 (col-span-4) default ratio', () => {
    const container = fixture.nativeElement.firstElementChild as HTMLElement;
    const mainEl = container.firstElementChild as HTMLElement;
    const asideEl = container.querySelector('aside') as HTMLElement;
    expect(mainEl.className).toContain('lg:col-span-8');
    expect(asideEl.className).toContain('lg:col-span-4');
  });

  it('should apply 7/12 (col-span-7) and 5/12 (col-span-5) ratio when configured', () => {
    fixture.componentRef.setInput('ratio', '7-5');
    fixture.detectChanges();

    const container = fixture.nativeElement.firstElementChild as HTMLElement;
    const mainEl = container.firstElementChild as HTMLElement;
    const asideEl = container.querySelector('aside') as HTMLElement;
    expect(mainEl.className).toContain('lg:col-span-7');
    expect(asideEl.className).toContain('lg:col-span-5');
  });
});

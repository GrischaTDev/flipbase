import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CardComponent } from './card.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('CardComponent', () => {
  let component: CardComponent;
  let fixture: ComponentFixture<CardComponent>;

  beforeEach(async () => {
    const metadata = (CardComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      title: ['title', 1, null],
      subtitle: ['subtitle', 1, null],
      variant: ['variant', 1, null],
      padding: ['padding', 1, null],
      rounded: ['rounded', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      title: 'title',
      subtitle: 'subtitle',
      variant: 'variant',
      padding: 'padding',
      rounded: 'rounded',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CardComponent],
    });

    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (CardComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('should render header when title is provided', () => {
    fixture.componentRef.setInput('title', 'Lieferantendaten');
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('[data-card-header]');
    expect(header).toBeTruthy();
    expect(header.textContent).toContain('Lieferantendaten');
  });

  it('should not render header when title and subtitle are empty', () => {
    const header = fixture.nativeElement.querySelector('[data-card-header]');
    expect(header).toBeNull();
  });

  it('überblendet den Kartenrahmen beim ersten Rendern nicht', () => {
    fixture.componentRef.setInput('variant', 'surface');
    fixture.detectChanges();

    const classes = (fixture.nativeElement as HTMLElement).classList;
    expect(classes).toContain('border-transparent');
    expect(classes).not.toContain('transition-colors');
  });
});

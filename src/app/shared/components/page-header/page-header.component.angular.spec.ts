import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PageHeaderComponent } from './page-header.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('PageHeaderComponent', () => {
  let component: PageHeaderComponent;
  let fixture: ComponentFixture<PageHeaderComponent>;

  beforeEach(async () => {
    const metadata = (PageHeaderComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      title: ['title', 1, null],
      subtitle: ['subtitle', 1, null],
      backLink: ['backLink', 1, null],
      backLabel: ['backLabel', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      title: 'title',
      subtitle: 'subtitle',
      backLink: 'backLink',
      backLabel: 'backLabel',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PageHeaderComponent],
      providers: [provideRouter([])],
    });

    fixture = TestBed.createComponent(PageHeaderComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Bestellungen');
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (PageHeaderComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('should create and render title', () => {
    expect(component).toBeTruthy();
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1.textContent).toContain('Bestellungen');
  });

  it('should render back navigation when backLink is set', () => {
    fixture.componentRef.setInput('backLink', '/purchases');
    fixture.componentRef.setInput('backLabel', 'Zurück zur Übersicht');
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav');
    expect(nav).toBeTruthy();
    expect(nav.textContent).toContain('Zurück zur Übersicht');
  });
});

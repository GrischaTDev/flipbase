import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { CustomSelectDialogTestHostComponent } from '../components/custom-select/custom-select-dialog-test-host.component';

beforeAll(async () => {
  await ɵresolveComponentResources((url) =>
    readFile(new URL('../components/custom-select/' + url, import.meta.url), 'utf8'),
  );
});

afterEach(() => {
  TestBed.resetTestingModule();
  document.body.style.overflow = '';
});

it('sperrt bei übereinander geöffneten Dialogen nur den Hintergrund und stellt ihn wieder her', () => {
  TestBed.configureTestingModule({ imports: [CustomSelectDialogTestHostComponent] });
  const background = document.createElement('button');
  document.body.append(background);
  document.body.style.overflow = 'scroll';
  const first = TestBed.createComponent(CustomSelectDialogTestHostComponent);
  first.detectChanges();
  TestBed.tick();
  expect(background.inert).toBe(true);
  // TestBed entfernt sonst beim zweiten Aufbau seinen vorherigen root-Testknoten.
  (first.nativeElement as HTMLElement).id = 'first-dialog-fixture';
  const second = TestBed.createComponent(CustomSelectDialogTestHostComponent);
  second.detectChanges();
  TestBed.tick();
  expect((first.nativeElement as HTMLElement).inert).toBe(true);
  expect((second.nativeElement as HTMLElement).inert).not.toBe(true);
  second.destroy();
  expect((first.nativeElement as HTMLElement).inert).not.toBe(true);
  expect(background.inert).toBe(true);
  expect(document.body.style.overflow).toBe('hidden');
  first.destroy();
  expect(background.inert).not.toBe(true);
  expect(document.body.style.overflow).toBe('scroll');
  background.remove();
  document.body.style.overflow = '';
});

it('räumt eine verwaiste Modalsperre auf, wenn ein Hintergrund-Tab wieder sichtbar wird', () => {
  TestBed.configureTestingModule({ imports: [CustomSelectDialogTestHostComponent] });
  const background = document.createElement('button');
  document.body.append(background);
  document.body.style.overflow = 'scroll';

  const fixture = TestBed.createComponent(CustomSelectDialogTestHostComponent);
  fixture.detectChanges();
  TestBed.tick();

  expect(background.inert).toBe(true);
  expect(document.body.style.overflow).toBe('hidden');

  // Bildet den problematischen Browser-Zustand nach: Der Dialog-Knoten ist nach
  // längerem Backgrounding nicht mehr im Dokument, die Direktive hält aber noch
  // ihren alten Zustand. Beim Zurückkehren darf dieser Zustand die App nicht
  // weiter unbedienbar machen.
  (fixture.nativeElement as HTMLElement).remove();
  document.dispatchEvent(new Event('visibilitychange'));

  expect(background.inert).toBe(false);
  expect(document.body.style.overflow).toBe('scroll');

  fixture.destroy();
  background.remove();
});

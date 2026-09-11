import '@angular/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { DropZoneComponent } from './drop-zone.component';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

function render(isDragActive: boolean): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [DropZoneComponent],
  }).createComponent(DropZoneComponent);
  Object.assign(fixture.componentInstance, {
    isDragActive: signal(isDragActive),
    hasImages: signal(false),
  });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Ablageflaeche', () => {
  it('traegt kein linear-surface mehr', () => {
    // Rueckfallsicherung fuer die Ursache: dessen Hintergrund in normalem CSS
    // schlaegt jede Tailwind-Hintergrundklasse, der Ablagezustand blieb
    // unsichtbar.
    expect(render(false).querySelector('label')?.classList.contains('linear-surface')).toBe(false);
  });

  it('faerbt die Flaeche beim Hineinziehen deutlich ein', () => {
    const label = render(true).querySelector('label');

    expect(label?.className).toContain('bg-fb-primary-subtle');
    expect(label?.textContent).toContain('Jetzt loslassen');
  });

  it('zeigt schon im Ruhezustand ein Symbol', () => {
    expect(render(false).querySelector('label svg')).not.toBeNull();
  });
});

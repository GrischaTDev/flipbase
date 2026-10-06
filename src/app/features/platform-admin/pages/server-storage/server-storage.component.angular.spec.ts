import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ServerStorageService } from '../../services/server-storage.service';
import { ServerStorageComponent } from './server-storage.component';

interface InputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}
const snapshots = new Map<unknown, InputMetadata>();

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${url.replace(/^\.\//u, '')}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource ${url} ist nicht eindeutig.`);
    return readFile(matches[0], 'utf8');
  });
  for (const [component, names] of [
    [PageHeaderComponent, ['title', 'subtitle', 'icon']],
    [CardComponent, ['title', 'variant']],
    [ButtonComponent, ['icon', 'loading']],
    [BadgeComponent, ['tone']],
  ] as const) {
    const metadata = (component as unknown as { ɵcmp: InputMetadata }).ɵcmp;
    snapshots.set(component, {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
      outputs: metadata.outputs,
    });
    metadata.inputs = {
      ...metadata.inputs,
      ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      ...Object.fromEntries(names.map((name) => [name, name])),
    };
    if (component === ButtonComponent)
      metadata.outputs = { ...metadata.outputs, clicked: 'clicked' };
  }
});

afterAll(() => {
  for (const [component, snapshot] of snapshots) {
    const metadata = (component as { ɵcmp: InputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    metadata.outputs = snapshot.outputs;
  }
});

describe('ServerStorageComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render(snapshot: unknown) {
    const load = vi.fn().mockResolvedValue(snapshot);
    await TestBed.configureTestingModule({
      imports: [ServerStorageComponent],
      providers: [provideRouter([]), { provide: ServerStorageService, useValue: { load } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ServerStorageComponent);
    fixture.detectChanges();
    await fixture.componentInstance.state.refresh();
    fixture.detectChanges();
    return { fixture, load, element: fixture.nativeElement as HTMLElement };
  }

  it('zeigt echte Werte, Messzeit und eine benannte zugängliche Belegungsanzeige', async () => {
    const { element, load } = await render({
      id: 1,
      total_bytes: 80 * 1024 ** 3,
      used_bytes: 44 * 1024 ** 3,
      available_bytes: 32 * 1024 ** 3,
      reported_at: new Date().toISOString(),
    });
    expect(element.textContent).toContain('Server-Speicher');
    expect(element.textContent).toContain('44');
    expect(element.textContent).toContain('32');
    expect(element.querySelector('time')?.getAttribute('datetime')).toBeTruthy();
    expect(element.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBeTruthy();
    const button = element.querySelector<HTMLButtonElement>('app-button button');
    expect(button?.textContent).toContain('Aktualisieren');
    button?.click();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    const results = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('zeigt ohne erste Meldung keine Nullbelegung als gesunden Server', async () => {
    const { element } = await render(null);
    expect(element.textContent).toContain('Noch keine Speichermeldung');
    expect(element.textContent).not.toContain('Genügend Speicherplatz');
    expect(element.querySelector('[role="meter"]')).toBeNull();
  });
});

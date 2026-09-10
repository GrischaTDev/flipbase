import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { PackagePriceDialogComponent } from './package-price-dialog.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) {
      throw new Error(`Test-Ressource ${url} ist nicht eindeutig: ${matches.join(', ')}`);
    }
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(PackagePriceDialogComponent, ['lineCount']);
  registerSignalInputs(ModalShellComponent, ['title', 'subtitle', 'size']);
  registerSignalInputs(NumberInputComponent, ['min', 'step', 'unit', 'asCurrency', 'ariaLabel']);
});

afterEach(() => TestBed.resetTestingModule());

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});

function render(lineCount = 3) {
  const fixture = TestBed.configureTestingModule({
    imports: [PackagePriceDialogComponent],
  }).createComponent(PackagePriceDialogComponent);
  fixture.componentRef.setInput('lineCount', lineCount);
  fixture.detectChanges();
  return fixture;
}

describe('PackagePriceDialogComponent', () => {
  it('erklärt die stückzahlunabhängige Verteilung je Produktposition', () => {
    const host = render().nativeElement as HTMLElement;

    expect(host.textContent).toContain('Paketpreis verteilen');
    expect(host.textContent).toContain('3 Produktpositionen');
    expect(host.textContent).toContain('unabhängig von der Stückzahl');
  });

  it('gibt einen gültigen Paketpreis zur Bestätigung aus', () => {
    const fixture = render();
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type="number"]',
    );

    if (!input) throw new Error('Paketpreisfeld fehlt');
    input.value = '10';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-confirm-package-price]')
      ?.click();

    expect(confirmed).toHaveBeenCalledWith(10);
  });

  it('bricht ohne Bestätigung ab', () => {
    const fixture = render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-cancel-package-price]')
      ?.click();

    expect(closed).toHaveBeenCalledOnce();
  });
});

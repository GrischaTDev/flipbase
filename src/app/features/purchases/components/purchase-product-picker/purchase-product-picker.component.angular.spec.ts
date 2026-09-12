import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import axe from 'axe-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CatalogProduct } from '../../../../core/models/flipbase.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { PurchaseProductPickerComponent } from './purchase-product-picker.component';

interface InputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

/**
 * Der Dialog bindet mehrere gemeinsame Bausteine ein. Statt jede Vorlage von
 * Hand zuzuordnen, wird sie unter `src/app` an ihrem Dateinamen gesucht.
 */
async function collectTemplates(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.html') || entry.name.endsWith('.scss'))
        found.set(entry.name, path);
    }
  };
  await walk(resolve('src/app'));
  return found;
}

/**
 * Die Vorlagen werden zur Laufzeit uebersetzt; dabei erkennt Angular die
 * signalbasierten Eingaenge der Bausteine nicht. Sie werden deshalb von Hand
 * nachgetragen, wie in den uebrigen Tests gemeinsamer Bausteine auch.
 */
const SIGNAL_INPUTS: readonly (readonly [unknown, readonly string[]])[] = [
  [ModalShellComponent, ['title', 'subtitle', 'size', 'hasFooter', 'closeOnBackdrop']],
  [TextFieldComponent, ['label', 'labelHidden', 'placeholder', 'type', 'prefixIcon']],
  [CustomCheckboxComponent, ['checked', 'ariaLabel', 'size', 'disabled', 'indeterminate']],
  [ProductThumbnailComponent, ['src', 'alt', 'size']],
  [ButtonComponent, ['variant', 'size', 'disabled', 'loading', 'fullWidth']],
];

const restore: (() => void)[] = [];

function patchSignalInputs(): void {
  for (const [component, names] of SIGNAL_INPUTS) {
    const metadata = (component as { ɵcmp: InputMetadata }).ɵcmp;
    const previous = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
    restore.push(() => Object.assign(metadata, previous));
    metadata.inputs = {
      ...metadata.inputs,
      ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      ...Object.fromEntries(names.map((name) => [name, name])),
    };
  }
}

let templates: Map<string, string>;
let saved: InputMetadata;

beforeAll(async () => {
  templates = await collectTemplates();
  await ɵresolveComponentResources(async (url) => {
    const path = templates.get(basename(url));
    return path ? readFile(path, 'utf8') : '';
  });
});

const products: readonly CatalogProduct[] = [
  { id: 'p1', workspace_id: 'w1', title: 'Rote Jacke', ean: '111' },
  { id: 'p2', workspace_id: 'w1', title: 'Blaue Hose', ean: '222' },
] as unknown as readonly CatalogProduct[];

function createPicker() {
  const metadata = (PurchaseProductPickerComponent as unknown as { ɵcmp: InputMetadata }).ɵcmp;
  saved = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
  metadata.inputs = {
    ...metadata.inputs,
    products: ['products', 1, null],
    imageUrls: ['imageUrls', 1, null],
    initialSearch: ['initialSearch', 1, null],
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    products: 'products',
    imageUrls: 'imageUrls',
    initialSearch: 'initialSearch',
  };
  patchSignalInputs();
  TestBed.configureTestingModule({ imports: [PurchaseProductPickerComponent] });
  const fixture = TestBed.createComponent(PurchaseProductPickerComponent);
  fixture.componentRef.setInput('products', products);
  fixture.componentRef.setInput('imageUrls', { p1: '/images/jacke.webp' });
  fixture.detectChanges();
  return fixture;
}

beforeEach(() => TestBed.resetTestingModule());

afterEach(() => {
  TestBed.resetTestingModule();
  while (restore.length) restore.pop()?.();
  if (!saved) return;
  const metadata = (PurchaseProductPickerComponent as unknown as { ɵcmp: InputMetadata }).ɵcmp;
  Object.assign(metadata, saved);
});

function rowOf(fixture: ReturnType<typeof createPicker>, index: number): HTMLElement {
  const host = fixture.nativeElement as HTMLElement;
  return host.querySelectorAll<HTMLElement>('.divide-y > div')[index];
}

describe('PurchaseProductPickerComponent', () => {
  it('wählt einen Artikel durch einen Klick irgendwo in der Zeile aus', () => {
    const fixture = createPicker();

    rowOf(fixture, 0).click();
    fixture.detectChanges();

    expect([...fixture.componentInstance.selection()]).toEqual(['p1']);
  });

  it('hebt die Auswahl beim erneuten Klick auf die Zeile wieder auf', () => {
    const fixture = createPicker();

    rowOf(fixture, 0).click();
    rowOf(fixture, 0).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selection().size).toBe(0);
  });

  it('gibt den Klick auf die Checkbox nicht zusätzlich an die Zeile weiter', () => {
    // Ohne diese Sperre schlüge die Auswahl zweimal um und bliebe stehen. Die
    // Checkbox selbst meldet ihre Änderung über einen signalbasierten Ausgang,
    // den die Laufzeitübersetzung dieser Tests nicht verdrahtet; geprüft wird
    // hier deshalb nur, dass die Zeile den Klick nicht ein zweites Mal behandelt.
    const fixture = createPicker();
    const checkbox = rowOf(fixture, 1).querySelector('button[role="checkbox"]') as HTMLElement;

    checkbox.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selection().size).toBe(0);
  });

  it('wählt beim Klick auf das Bild nichts aus, sondern zeigt nur die Vorschau', () => {
    const fixture = createPicker();
    const image = rowOf(fixture, 0).querySelector(
      'app-product-thumbnail button',
    ) as HTMLButtonElement;

    image.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selection().size).toBe(0);
  });

  it('besteht AXE in der Artikelliste, obwohl die Zeile kein Bedienelement ist', async () => {
    // Geprüft wird die Liste, nicht der ganze Dialog: dessen Titel läuft über
    // einen signalbasierten Eingang, den die Laufzeitübersetzung nicht verdrahtet.
    const fixture = createPicker();
    const list = (fixture.nativeElement as HTMLElement).querySelector('.divide-y') as HTMLElement;

    const result = await axe.run(list, { rules: { 'color-contrast': { enabled: false } } });

    expect(result.violations).toEqual([]);
  });

  it('beschriftet das Vorschaubild mit dem Artikelnamen', () => {
    const fixture = createPicker();
    const image = rowOf(fixture, 0).querySelector('app-product-thumbnail button');

    expect(image?.getAttribute('aria-label')).toBe('Rote Jacke vergrößert ansehen');
  });
});

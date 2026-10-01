import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ArticlePickerComponent } from './article-picker.component';
import type { ArticlePickerEntry } from './article-picker.models';
import { ModalShellComponent } from '../modal-shell/modal-shell.component';
import { ButtonComponent } from '../button/button.component';
import { TextFieldComponent } from '../text-field/text-field.component';
import { ProductThumbnailComponent } from '../product-thumbnail/product-thumbnail.component';
import { CustomSelectComponent } from '../custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../custom-checkbox/custom-checkbox.component';
import { ModalDialogDirective } from '../../directives/modal-dialog.directive';

interface Metadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}
const snapshots: { metadata: Metadata; snapshot: Metadata }[] = [];
function bridge(type: unknown, inputs: readonly string[], outputs: readonly string[] = []): void {
  const value = type as { ɵcmp?: Metadata; ɵdir?: Metadata };
  const metadata = value.ɵcmp ?? value.ɵdir;
  if (!metadata) throw new Error('Angular-Metadaten fehlen');
  snapshots.push({ metadata, snapshot: { ...metadata } });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputs.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputs.map((name) => [name, name])),
  };
  metadata.outputs = {
    ...metadata.outputs,
    ...Object.fromEntries(outputs.map((name) => [name, name])),
  };
}
const variant = (id: string, quantity: number): ArticlePickerEntry => ({
  id,
  groupId: 'nike',
  title: 'Nike Tanjun',
  size: id === 'size36' ? '36,5' : '37',
  color: 'Schwarz Weiß',
  brand: 'Nike',
  category: 'Schuhe > Sneaker',
  imageKey: id,
  availableQuantity: quantity,
});

async function render(entries: readonly ArticlePickerEntry[]) {
  await TestBed.configureTestingModule({
    imports: [ArticlePickerComponent],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(ArticlePickerComponent);
  fixture.componentRef.setInput('entries', entries);
  fixture.detectChanges();
  return fixture;
}

describe('Gemeinsame Artikel- und Variantenauswahl', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const files = await readdir(resolve('src/app'), { recursive: true });
      const matches = files.filter((file) => file.split(/[\\/]/).at(-1) === url.slice(2));
      if (matches.length !== 1) throw new Error(`Unbekannte Komponenten-Ressource: ${url}`);
      return readFile(resolve('src/app', matches[0]), 'utf8');
    });
    bridge(
      ArticlePickerComponent,
      [
        'entries',
        'imageUrls',
        'initialSearch',
        'loading',
        'errorMessage',
        'allowCreate',
        'allowVariantCreation',
        'detailsOpen',
        'variantHint',
        'selectionMode',
        'selection',
      ],
      [
        'closed',
        'selected',
        'createRequested',
        'variantCreateRequested',
        'imageFailed',
        'retryRequested',
      ],
    );
    bridge(ModalShellComponent, ['title', 'size'], ['closed']);
    bridge(ModalDialogDirective, ['dialogTitel', 'schliesstBeiKlickAussen']);
    bridge(ButtonComponent, ['variant', 'size', 'disabled', 'icon', 'type'], ['clicked']);
    bridge(TextFieldComponent, ['label', 'placeholder']);
    bridge(ProductThumbnailComponent, ['src'], ['imageFailed']);
    bridge(CustomSelectComponent, [
      'options',
      'variant',
      'widthClass',
      'ariaLabel',
      'placeholder',
      'value',
    ]);
    bridge(CustomCheckboxComponent, ['checked', 'ariaLabel']);
    const select = (CustomSelectComponent as unknown as { ɵcmp: Metadata }).ɵcmp;
    select.outputs = { ...select.outputs, value: 'valueChange' };
    const checkbox = (CustomCheckboxComponent as unknown as { ɵcmp: Metadata }).ɵcmp;
    checkbox.outputs = { ...checkbox.outputs, checked: 'checkedChange' };
  });
  afterEach(() => TestBed.resetTestingModule());
  afterAll(() => {
    for (const { metadata, snapshot } of snapshots) {
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
      metadata.outputs = snapshot.outputs;
    }
  });

  it('öffnet die Variantengruppe und übernimmt exakt die geklickte Größe', async () => {
    const fixture = await render([variant('size36', 1), variant('size37', 2)]);
    const selected: string[][] = [];
    fixture.componentInstance.selected.subscribe((entries) =>
      selected.push(entries.map((entry) => entry.id)),
    );
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-product-group="nike"]')?.click();
    fixture.detectChanges();
    const row = host.querySelector<HTMLButtonElement>('[data-product-option="size36"]');
    expect(row?.textContent).toContain('Größe 36,5');
    expect(row?.textContent).toContain('Verfügbar: 1 Stück');
    row?.click();
    fixture.detectChanges();
    const confirm = [...host.querySelectorAll<HTMLButtonElement>('footer button')].find((button) =>
      button.textContent?.includes('Hinzufügen'),
    );
    confirm?.click();
    expect(selected).toEqual([['size36']]);
  });

  it('zeigt eine ausverkaufte Variante, lässt sie aber nicht auswählen', async () => {
    const fixture = await render([variant('size36', 0)]);
    fixture.componentInstance.openGroup('nike');
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-product-option="size36"]',
    );
    expect(row?.disabled).toBe(true);
    row?.click();
    expect(fixture.componentInstance.selection().size).toBe(0);
  });

  it('blockiert eine inzwischen nicht mehr verfügbare Auswahl auch beim Bestätigen', async () => {
    const fixture = await render([variant('size36', 1)]);
    fixture.componentInstance.toggle('size36');
    fixture.componentRef.setInput('entries', [variant('size36', 0)]);
    fixture.detectChanges();
    const selected: unknown[] = [];
    fixture.componentInstance.selected.subscribe((entries) => selected.push(entries));
    fixture.componentInstance.confirm();
    expect(selected).toEqual([]);
    expect(fixture.componentInstance.canConfirm()).toBe(false);
  });

  it('bietet im Verkaufsmodus keine Anlage von Artikeln oder Varianten an', async () => {
    const fixture = await render([variant('size36', 1)]);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).not.toContain('Produkt erstellen');
    fixture.componentInstance.openGroup('nike');
    fixture.detectChanges();
    expect(host.textContent).not.toContain('Neue Variante');
  });

  it('stellt einen Ladefehler nicht als leere Bestandsliste dar', async () => {
    const fixture = await render([]);
    fixture.componentRef.setInput('errorMessage', 'Bestand konnte nicht geladen werden');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Bestand konnte nicht geladen werden',
    );
    expect(host.textContent).not.toContain('Keine passenden Artikel gefunden');
    expect(fixture.componentInstance.canConfirm()).toBe(false);
  });

  it('blockiert die Bestätigung während eines erneuten Ladevorgangs', async () => {
    const fixture = await render([variant('size36', 1)]);
    fixture.componentInstance.toggle('size36');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.canConfirm()).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')?.textContent,
    ).toContain('geladen');
  });
});

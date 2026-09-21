import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Source } from '../../../../core/models/flipbase.models';
import { SourcesService } from '../../../../core/services/sources.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { PurchaseSourceDialogComponent } from './purchase-source-dialog.component';

interface AngularBindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const metadataSnapshots = new Map<unknown, AngularBindingMetadata>();

function bridgeBindings(
  target: unknown,
  inputs: readonly string[],
  outputs: readonly string[] = [],
  directive = false,
): void {
  const definition = directive ? 'ɵdir' : 'ɵcmp';
  const metadata = (target as Record<string, AngularBindingMetadata>)[definition];
  metadataSnapshots.set(target, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  });
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

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = String(url).replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) {
      throw new Error(`Test-Ressource ${fileName} ist nicht eindeutig: ${matches.join(', ')}`);
    }
    return readFile(matches[0], 'utf8');
  });
  bridgeBindings(ModalShellComponent, ['title'], ['closed']);
  bridgeBindings(
    ModalDialogDirective,
    ['dialogTitel', 'schliesstBeiKlickAussen'],
    ['dialogClose'],
    true,
  );
  bridgeBindings(TextFieldComponent, ['id', 'label', 'required']);
  bridgeBindings(ButtonComponent, ['variant', 'disabled', 'loading'], ['clicked']);
});

afterEach(() => TestBed.resetTestingModule());

afterAll(() => {
  for (const [target, snapshot] of metadataSnapshots) {
    const metadata =
      (target as Record<string, AngularBindingMetadata>)['ɵcmp'] ??
      (target as Record<string, AngularBindingMetadata>)['ɵdir'];
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    metadata.outputs = snapshot.outputs;
  }
});

const createdSource: Source = {
  id: 'source-1',
  workspace_id: 'workspace-1',
  name: 'Flohmarkt Berlin',
};
const createSource = vi.fn(async () => ({ data: createdSource, error: null }));

function renderSourceDialog() {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [PurchaseSourceDialogComponent],
    providers: [{ provide: SourcesService, useValue: { createSource } }],
  }).createComponent(PurchaseSourceDialogComponent);
  const created = vi.spyOn(fixture.componentInstance.created, 'emit');
  const closed = vi.spyOn(fixture.componentInstance.closed, 'emit');
  fixture.detectChanges();
  return { fixture, created, closed };
}

describe('PurchaseSourceDialogComponent', () => {
  afterEach(() => createSource.mockReset().mockResolvedValue({ data: createdSource, error: null }));

  it('deaktiviert Speichern bis zu einem nichtleeren Namen', () => {
    const { fixture } = renderSourceDialog();
    const save = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[data-save-source] button',
    );

    expect(save?.disabled).toBe(true);

    fixture.componentInstance.form.controls.name.setValue('Flohmarkt Berlin');
    fixture.detectChanges();

    expect(save?.disabled).toBe(false);
  });

  it('behält Eingabe und Dialog bei einem Speicherfehler', async () => {
    createSource.mockResolvedValue({ data: null, error: new Error('Offline') });
    const { fixture, closed } = renderSourceDialog();
    fixture.componentInstance.form.controls.name.setValue('Flohmarkt Berlin');

    await fixture.componentInstance.save();
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe('Offline');
    expect(fixture.componentInstance.form.controls.name.value).toBe('Flohmarkt Berlin');
    expect(closed).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('Offline');
  });

  it('gibt die gespeicherte Bezugsquelle an das Elternformular aus', async () => {
    const { fixture, created } = renderSourceDialog();
    fixture.componentInstance.form.controls.name.setValue('Flohmarkt Berlin');

    await fixture.componentInstance.save();

    expect(created).toHaveBeenCalledWith(expect.objectContaining({ id: 'source-1' }));
  });

  it('verwendet einen zugänglichen Dialog mit genau einem Pflichtfeld', () => {
    const { fixture } = renderSourceDialog();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-modal-shell')).not.toBeNull();
    expect(host.querySelectorAll('input[required]')).toHaveLength(1);
    expect(host.textContent).toContain('Bezugsquelle erstellen');
    expect(host.textContent).toContain('Bezugsquelle speichern');
  });

  it('erfüllt die automatischen Barrierefreiheitsprüfungen', async () => {
    const { fixture } = renderSourceDialog();

    const result = await axe.run(fixture.nativeElement as HTMLElement);

    expect(result.violations).toEqual([]);
  }, 10_000);
});

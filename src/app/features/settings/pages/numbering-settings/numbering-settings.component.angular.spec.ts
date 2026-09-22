import axe from 'axe-core';
import { TestBed } from '@angular/core/testing';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { NumberingService } from '../../services/numbering.service';
import { defaultNumberSeries } from '../../models/numbering.models';
import { NumberingSettingsComponent } from './numbering-settings.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let customSelectMetadata: AngularInputMetadata | null = null;
let textFieldMetadata: AngularInputMetadata | null = null;

describe('NumberingSettingsComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const fileName = url.replace(/^\.\//u, '');
      const matches: string[] = [];
      for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
      if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
      return readFile(matches[0], 'utf8');
    });
    const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    customSelectMetadata = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
    metadata.inputs = {
      ...metadata.inputs,
      options: ['options', 1, null],
      ariaLabel: ['ariaLabel', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      options: 'options',
      ariaLabel: 'ariaLabel',
    };

    const textMetadata = (TextFieldComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    textFieldMetadata = {
      inputs: textMetadata.inputs,
      declaredInputs: textMetadata.declaredInputs,
    };
    textMetadata.inputs = {
      ...textMetadata.inputs,
      label: ['label', 1, null],
      placeholder: ['placeholder', 1, null],
      helpText: ['helpText', 1, null],
      required: ['required', 1, null],
      maxLength: ['maxLength', 1, null],
      ariaLabel: ['ariaLabel', 1, null],
    };
    textMetadata.declaredInputs = {
      ...textMetadata.declaredInputs,
      label: 'label',
      placeholder: 'placeholder',
      helpText: 'helpText',
      required: 'required',
      maxLength: 'maxLength',
      ariaLabel: 'ariaLabel',
    };
  });
  afterAll(() => {
    if (customSelectMetadata) {
      const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = customSelectMetadata.inputs;
      metadata.declaredInputs = customSelectMetadata.declaredInputs;
    }
    if (textFieldMetadata) {
      const metadata = (TextFieldComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = textFieldMetadata.inputs;
      metadata.declaredInputs = textFieldMetadata.declaredInputs;
    }
  });
  afterEach(() => TestBed.resetTestingModule());
  const load = vi.fn();
  const save = vi.fn();
  beforeEach(() => {
    load.mockReset().mockResolvedValue({ can_edit: true, timezone: 'Europe/Berlin', series: [] });
    save.mockReset().mockImplementation(async (_workspace, entity, configuration) => ({
      ...configuration,
      entity_type: entity,
      version: 2,
    }));
    TestBed.configureTestingModule({
      imports: [NumberingSettingsComponent],
      providers: [
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: 'workspace-a' }) },
        },
        { provide: NumberingService, useValue: { load, save } },
      ],
    });
  });

  it('lädt Einstellungen und zeigt drei Vorschauen ohne Schreibzugriff', async () => {
    const fixture = TestBed.createComponent(NumberingSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(load).toHaveBeenCalledWith('workspace-a');
    expect(fixture.componentInstance.previews()).toHaveLength(3);
    expect(save).not.toHaveBeenCalled();
  });

  it('speichert gültige Änderungen und setzt den Verlassensschutz zurück', async () => {
    const fixture = TestBed.createComponent(NumberingSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.markAsDirty();
    component.form.controls.prefix.setValue('BEST');
    expect(component.hasUnsavedChanges()).toBe(true);
    await component.save();
    expect(save).toHaveBeenCalledWith(
      'workspace-a',
      'purchase',
      expect.objectContaining({ prefix: 'BEST' }),
      'Europe/Berlin',
      0,
    );
    expect(component.hasUnsavedChanges()).toBe(false);
    expect(component.success()).toContain('gespeichert');
  });

  it('verhindert jährlichen Neustart ohne Jahr und das Speichern durch Mitglieder', async () => {
    load.mockResolvedValue({
      can_edit: false,
      timezone: 'Europe/Berlin',
      series: [defaultNumberSeries('purchase')],
    });
    const fixture = TestBed.createComponent(NumberingSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.patchValue({ reset_yearly: true, include_year: false });
    expect(component.invalidReset()).toBe(true);
    await component.save();
    expect(save).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
  });

  it('hat beschriftete, zugängliche Formularfelder', async () => {
    const fixture = TestBed.createComponent(NumberingSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });
  it('erhält ungespeicherte Eingaben bei Serverfehlern', async () => {
    const fixture = TestBed.createComponent(NumberingSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.markAsDirty();
    component.form.controls.prefix.setValue('BEST');
    save.mockRejectedValue({ message: 'Format kollidiert.' });
    await component.save();
    expect(component.error()).toBe('Format kollidiert.');
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(component.isSaving()).toBe(false);
  });
});

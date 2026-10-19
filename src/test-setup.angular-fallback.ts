import '@angular/compiler';
import { ButtonComponent } from './app/shared/components/button/button.component';
import { ɵresolveComponentResources } from '@angular/core';
import { readFile } from 'node:fs/promises';
import { FormFieldComponent } from './app/shared/components/form-field/form-field.component';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

await ɵresolveComponentResources((url) => {
  const name = url.split('/').at(-1) ?? '';
  const folder = name.startsWith('form-field.')
    ? 'form-field'
    : name.startsWith('button.')
      ? 'button'
      : null;
  if (!folder) throw new Error('Unerwartete gemeinsame Test-Ressource: ' + url);
  return readFile('src/app/shared/components/' + folder + '/' + name, 'utf8');
});

// Vitest verwendet hier Angular-JIT ohne Signal-Input-Transformation. Wie in den
// bestehenden Controltests die Metadaten für den gemeinsam importierten Rahmen setzen.
const fieldMetadata = (
  FormFieldComponent as unknown as {
    ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
  }
).ɵcmp;
fieldMetadata.inputs = { ...fieldMetadata.inputs };
fieldMetadata.declaredInputs = { ...fieldMetadata.declaredInputs };
for (const name of ['controlId', 'label', 'labelHidden', 'required', 'helpText', 'error']) {
  fieldMetadata.inputs[name] = [name, 1, null];
  fieldMetadata.declaredInputs[name] = name;
}

const buttonMetadata = (
  ButtonComponent as unknown as {
    ɵcmp: {
      inputs: Record<string, unknown>;
      declaredInputs: Record<string, string>;
      outputs: Record<string, string>;
    };
  }
).ɵcmp;
buttonMetadata.inputs = { ...buttonMetadata.inputs };
buttonMetadata.declaredInputs = { ...buttonMetadata.declaredInputs };
for (const name of [
  'variant',
  'tone',
  'size',
  'density',
  'shape',
  'loading',
  'disabled',
  'icon',
  'iconPosition',
  'iconOnly',
  'fullWidth',
  'wrapLabel',
  'contentAlign',
  'type',
  'formId',
  'link',
  'href',
  'target',
  'queryParams',
  'fragment',
  'ariaLabel',
  'title',
  'ariaExpanded',
  'ariaPressed',
  'ariaControls',
  'ariaHaspopup',
]) {
  buttonMetadata.inputs[name] = [name, 1, null];
  buttonMetadata.declaredInputs[name] = name;
}
buttonMetadata.outputs = { ...buttonMetadata.outputs, clicked: 'clicked' };

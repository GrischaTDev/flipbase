import axe from 'axe-core';
import { TestBed } from '@angular/core/testing';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { NumberingService } from '../../services/numbering.service';
import { defaultNumberSeries } from '../../models/numbering.models';
import { NumberingSettingsComponent } from './numbering-settings.component';

describe('NumberingSettingsComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
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

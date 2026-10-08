import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { BrandLabelAdminBrandsService } from '../../services/brand-label-admin-brands.service';
import { LabelBrandAdminError, type LabelAdminBrand, type LabelBrandEditResult } from '../../models/brand-label-admin-brands';
import { LabelBrandsComponent } from './label-brands.component';

const brand: LabelAdminBrand = { id: 1, name: 'Pilotmarke', slug: 'pilotmarke', aliases: ['PM'], version: 2, archived: false, lines: [{ id: 2, brandId: 1, name: 'Sport', version: 1, archived: false }] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
function setup(isOperator = true) {
  const user = signal<{ id: string } | null>({ id: 'operator-a' });
  const workspace = signal<{ id: string } | null>({ id: 'workspace-a' });
  const operator = signal(isOperator);
  const service = { list: vi.fn().mockResolvedValue([brand]), execute: vi.fn() };
  TestBed.configureTestingModule({
    imports: [LabelBrandsComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: PlatformOperatorService, useValue: { operator } },
      { provide: BrandLabelAdminBrandsService, useValue: service },
    ],
  });
  const fixture = TestBed.createComponent(LabelBrandsComponent);
  return { fixture, component: fixture.componentInstance, service, user, workspace, operator };
}
describe('Referenzmarken – Adminseite', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('rendert die gemeinsamen Seiten- und Tabellenbausteine mit Marken und Linien', async () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(component.view().phase).toBe('ready');
    expect(fixture.nativeElement.querySelector('app-data-table')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-page-header')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Pilotmarke');
    expect(fixture.nativeElement.textContent).toContain('Sport');
  });
  it('lädt für Workspace-Admins keine redaktionellen Daten', async () => {
    const { fixture, component, service } = setup(false);
    fixture.detectChanges();
    await settle();
    expect(component.view().phase).toBe('unavailable');
    expect(service.list).not.toHaveBeenCalled();
    component.beginBrand();
    expect(component.editor()).toBeNull();
  });
  it('blendet Daten und Formular beim Rollenentzug sofort aus', async () => {
    const { fixture, component, operator } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand(brand);
    expect(component.editor()).not.toBeNull();
    operator.set(false);
    expect(component.view().brands).toEqual([]);
    expect(component.editor()).toBeNull();
    await settle();
    expect(component.form.controls.name.value).toBe('');
  });
  it('verwirft eine verspätete Antwort nach Kontowechsel', async () => {
    const { fixture, component, service, user } = setup();
    const first = deferred<readonly LabelAdminBrand[]>();
    service.list.mockReturnValueOnce(first.promise).mockResolvedValueOnce([]);
    fixture.detectChanges();
    await settle();
    user.set({ id: 'operator-b' });
    await settle();
    first.resolve([brand]);
    await settle();
    expect(component.view().brands).toEqual([]);
  });
  it('legt eine neue Marke erst nach bestätigtem Speichern in die Liste', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand();
    component.form.setValue({ name: 'Neue Marke', slug: 'neue-marke', aliases: 'NM\nNeu' });
    const result = deferred<LabelBrandEditResult>();
    service.execute.mockReturnValueOnce(result.promise);
    const save = component.save();
    expect(component.saving()).toBe(true);
    expect(component.form.disabled).toBe(true);
    expect(component.view().brands).toHaveLength(1);
    result.resolve({ kind: 'brand', value: { id: 3, name: 'Neue Marke', slug: 'neue-marke', aliases: ['NM', 'Neu'], version: 1, archived: false } });
    await save;
    expect(component.view().brands.some((entry) => entry.id === 3)).toBe(true);
    expect(component.editor()).toBeNull();
    expect(component.message()).toContain('gespeichert');
  });
  it('verhindert Doppelklicks und wiederholt unklare Aufträge nur ausdrücklich', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand(brand);
    component.form.controls.name.setValue('Neuer Name');
    service.execute.mockRejectedValueOnce(new LabelBrandAdminError('network'));
    const first = component.save();
    await component.save();
    await first;
    expect(service.execute).toHaveBeenCalledTimes(1);
    expect(component.unresolved()).toBe(true);
    expect(component.form.disabled).toBe(true);
    component.close();
    expect(component.editor()).not.toBeNull();
    const command = service.execute.mock.calls[0][0];
    service.execute.mockResolvedValueOnce({ kind: 'brand', value: { ...brand, name: 'Neuer Name', version: 3 } });
    await component.retry();
    expect(service.execute.mock.calls[1][0]).toBe(command);
    expect(component.unresolved()).toBe(false);
  });
  it('behält Eingaben beim Versionskonflikt und zeigt keine falsche Erfolgsmeldung', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand(brand);
    component.form.controls.name.setValue('Meine Korrektur');
    service.execute.mockRejectedValueOnce(new LabelBrandAdminError('conflict'));
    await component.save();
    expect(component.form.controls.name.value).toBe('Meine Korrektur');
    expect(component.editor()).not.toBeNull();
    expect(component.message()).toBeNull();
    expect(component.view().brands[0].name).toBe('Pilotmarke');
  });
  it('ordnet die neue Linie der gewählten Marke zu', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    component.beginLine(brand);
    component.form.controls.name.setValue('Neue Linie');
    service.execute.mockResolvedValueOnce({ kind: 'line', value: { id: 4, brandId: 1, name: 'Neue Linie', version: 1, archived: false } });
    await component.save();
    expect(service.execute.mock.calls[0][0]).toMatchObject({ kind: 'line', id: null, input: { brandId: 1, name: 'Neue Linie' } });
    expect(component.view().brands[0].lines.some((entry) => entry.id === 4)).toBe(true);
  });
  it('sendet bei ungültigen Pflichtfeldern keinen Schreibauftrag', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand();
    component.form.setValue({ name: '  ', slug: '../fremd', aliases: '' });
    await component.save();
    expect(service.execute).not.toHaveBeenCalled();
    expect(component.editor()).not.toBeNull();
  });
  it('verwirft Speicherantworten aus einem verlassenen Workspace', async () => {
    const { fixture, component, service, workspace } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand(brand);
    component.form.controls.name.setValue('Später Stand');
    const result = deferred<LabelBrandEditResult>();
    service.execute.mockReturnValueOnce(result.promise);
    const saving = component.save();
    workspace.set({ id: 'workspace-b' });
    await settle();
    result.resolve({ kind: 'brand', value: { ...brand, name: 'Später Stand', version: 3 } });
    await saving;
    expect(component.view().brands[0].name).toBe('Pilotmarke');
    expect(component.message()).toBeNull();
    expect(component.editor()).toBeNull();
  });
  it('zeigt fehlende Backend-Freigabe als Fehler statt als leere fertige Sammlung', async () => {
    const { fixture, component, service } = setup();
    service.list.mockRejectedValueOnce(new LabelBrandAdminError('unavailable'));
    fixture.detectChanges();
    await settle();
    expect(component.view().phase).toBe('error');
    component.beginBrand();
    expect(component.editor()).toBeNull();
  });
});

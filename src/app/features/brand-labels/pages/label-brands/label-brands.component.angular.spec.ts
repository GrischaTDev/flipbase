import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { glob, readFile } from 'node:fs/promises';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { BrandLabelAdminBrandsService } from '../../services/brand-label-admin-brands.service';
import {
  LabelBrandAdminError,
  type LabelAdminBrand,
  type LabelBrandEditResult,
} from '../../models/brand-label-admin-brands';
import { LabelBrandsComponent } from './label-brands.component';

interface Bindings {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}
const snapshots = new Map<unknown, Bindings>();
function metadataOf(component: unknown): Bindings {
  const typed = component as { ɵcmp?: Bindings; ɵdir?: Bindings };
  const metadata = typed.ɵcmp ?? typed.ɵdir;
  if (!metadata) throw new Error('Angular-Metadaten fehlen');
  return metadata;
}
function bind(component: unknown, inputs: string[], outputs: string[] = []) {
  const metadata = metadataOf(component);
  snapshots.set(component, {
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
afterAll(() => {
  for (const [component, snapshot] of snapshots) Object.assign(metadataOf(component), snapshot);
  snapshots.clear();
});
beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const matches: string[] = [];
    for await (const path of glob(`src/app/**/${url.replace(/^\.\//, '')}`)) matches.push(path);
    if (matches.length !== 1) throw new Error(`Uneindeutige Testvorlage: ${url}`);
    return readFile(matches[0], 'utf8');
  });
  bind(PageHeaderComponent, ['title', 'subtitle']);
  bind(
    DataTableComponent,
    [
      'ariaLabel',
      'searchValue',
      'searchPlaceholder',
      'searchAriaLabel',
      'loading',
      'errorMessage',
      'hasRows',
      'emptyTitle',
      'emptyText',
    ],
    ['searchValueChange'],
  );
  bind(
    ButtonComponent,
    ['variant', 'icon', 'iconOnly', 'ariaLabel', 'disabled', 'loading', 'type', 'formId'],
    ['clicked'],
  );
  bind(BadgeComponent, ['tone']);
  bind(TextFieldComponent, ['label', 'required', 'maxLength', 'multiline', 'helpText']);
  bind(ModalShellComponent, ['title', 'subtitle', 'size'], ['closed']);
  bind(ModalDialogDirective, ['dialogTitel', 'schliesstBeiKlickAussen'], ['dialogClose']);
  bind(CustomSearchInputComponent, ['variant', 'size', 'value', 'placeholder', 'ariaLabel']);
  (CustomSearchInputComponent as unknown as { ɵcmp: Bindings }).ɵcmp.outputs = {
    valueChange: 'value',
  };
});

const brand: LabelAdminBrand = {
  id: 1,
  name: 'Pilotmarke',
  slug: 'pilotmarke',
  aliases: ['PM'],
  version: 2,
  archived: false,
  lines: [{ id: 2, brandId: 1, name: 'Sport', version: 1, archived: false }],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
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
  const service = { list: vi.fn().mockResolvedValue([brand]), execute: vi.fn(), archive: vi.fn() };
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
    result.resolve({
      kind: 'brand',
      value: {
        id: 3,
        name: 'Neue Marke',
        slug: 'neue-marke',
        aliases: ['NM', 'Neu'],
        version: 1,
        archived: false,
      },
    });
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
    service.execute.mockResolvedValueOnce({
      kind: 'brand',
      value: { ...brand, name: 'Neuer Name', version: 3 },
    });
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
    service.execute.mockResolvedValueOnce({
      kind: 'line',
      value: { id: 4, brandId: 1, name: 'Neue Linie', version: 1, archived: false },
    });
    await component.save();
    expect(service.execute.mock.calls[0][0]).toMatchObject({
      kind: 'line',
      id: null,
      input: { brandId: 1, name: 'Neue Linie' },
    });
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
  it('öffnet den Dialog über den echten Button und speichert Eingaben aus den Shared-Feldern', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const add = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Marke hinzufügen'),
    );
    add?.click();
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Marke hinzufügen',
    );
    const fields = [...host.querySelectorAll<HTMLInputElement>('form input')];
    expect(fields).toHaveLength(2);
    fields[0].value = 'Neue Marke';
    fields[0].dispatchEvent(new Event('input'));
    fields[1].value = 'neue-marke';
    fields[1].dispatchEvent(new Event('input'));
    service.execute.mockResolvedValueOnce({
      kind: 'brand',
      value: {
        id: 3,
        name: 'Neue Marke',
        slug: 'neue-marke',
        aliases: [],
        version: 1,
        archived: false,
      },
    });
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    fixture.detectChanges();
    expect(service.execute).toHaveBeenCalledTimes(1);
    expect(component.message()).toContain('gespeichert');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('filtert über das gerenderte Suchfeld nach Markenlinien', async () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>(
      'input[aria-label="Referenzmarken durchsuchen"]',
    )!;
    search.value = 'Sport';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.search()).toBe('Sport');
    expect(component.visibleBrands()).toHaveLength(1);
    search.value = 'Nicht vorhanden';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.textContent).toContain('Keine Referenzmarken gefunden');
    expect(host.querySelector('tbody')).toBeNull();
  });
  it('schließt einen laufenden oder unbestätigten Auftrag nicht über Escape', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand(brand);
    component.form.controls.name.setValue('Neu');
    service.execute.mockRejectedValueOnce(new LabelBrandAdminError('network'));
    await component.save();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(component.editor()).not.toBeNull();
    expect(component.unresolved()).toBe(true);
  });
  it('zeigt archivierte Marken, bietet dafür aber keine Bearbeitung an', async () => {
    const { fixture, component, service } = setup();
    service.list.mockResolvedValueOnce([{ ...brand, archived: true }]);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Archiviert');
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Pilotmarke bearbeiten"]')?.disabled,
    ).toBe(true);
    component.beginBrand(brand);
    component.beginLine(brand);
    expect(component.editor()).toBeNull();
  });
  it('verwirft lokale Korrekturen beim Nachladen nur nach Bestätigung', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand(brand);
    component.form.controls.name.setValue('Meine Korrektur');
    const confirm = vi
      .spyOn(globalThis, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await component.reload();
    expect(component.form.controls.name.value).toBe('Meine Korrektur');
    expect(service.list).toHaveBeenCalledTimes(1);
    await component.reload();
    expect(service.list).toHaveBeenCalledTimes(2);
    expect(component.editor()).toBeNull();
    confirm.mockRestore();
  });
  it('sperrt nach einem Versionskonflikt weitere Speicherungen bis zum Nachladen', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand(brand);
    component.form.controls.name.setValue('Meine Korrektur');
    service.execute.mockRejectedValueOnce(new LabelBrandAdminError('conflict'));
    await component.save();
    await component.save();
    expect(service.execute).toHaveBeenCalledTimes(1);
    expect(component.view().conflict).toBe(true);
    expect(component.form.controls.name.value).toBe('Meine Korrektur');
  });
  it('entfernt Admininhalt bei serverseitigem Rechteentzug auch ohne Signalaktualisierung', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand(brand);
    component.form.controls.name.setValue('Neu');
    service.execute.mockRejectedValueOnce(new LabelBrandAdminError('forbidden'));
    await component.save();
    expect(component.view().phase).toBe('unavailable');
    expect(component.view().brands).toEqual([]);
    expect(component.editor()).toBeNull();
    expect(component.form.controls.name.value).toBe('');
    expect(component.form.disabled).toBe(true);
  });
  it('gibt einen Hinweis vor dem Verlassen mit ungespeicherten Formularwerten', async () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    await settle();
    component.beginBrand(brand);
    component.form.controls.name.setValue('Neu');
    const event = new Event('beforeunload', { cancelable: true });
    component.warnUnsaved(event as BeforeUnloadEvent);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('Referenzmarken: Archivinteraktionen', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  it('archiviert Marke und Linie erst nach bestätigtem Auftrag', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const response = deferred<number>();
    service.archive.mockReturnValueOnce(response.promise);
    const saving = component.archiveBrand(brand);
    expect(component.view().brands[0].archived).toBe(false);
    response.resolve(2);
    await saving;
    expect(component.view().brands[0].archived).toBe(true);
    expect(component.view().brands[0].version).toBe(2);
    expect(component.view().brands[0].lines[0].archived).toBe(false);
  });
  it('erhält unbekannten Archivauftrag für denselben Retry und schützt Navigation', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    service.archive.mockRejectedValueOnce(new LabelBrandAdminError('network'));
    await component.archiveBrand(brand, brand.lines[0]);
    const command = service.archive.mock.calls[0][0];
    expect(component.hasUnsavedChanges()).toBe(true);
    expect(component.view().brands[0].lines[0].archived).toBe(false);
    service.archive.mockResolvedValueOnce(2);
    await component.retry();
    expect(service.archive.mock.calls[1][0]).toBe(command);
    expect(component.view().brands[0].lines[0].archived).toBe(true);
    expect(component.view().brands[0].archived).toBe(false);
  });
  it('behält bei Archiv-Versionskonflikt den bekannten Serverstand', async () => {
    const { fixture, component, service } = setup();
    fixture.detectChanges();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    service.archive.mockRejectedValueOnce(new LabelBrandAdminError('conflict'));
    await component.archiveBrand(brand);
    expect(component.view().brands[0].archived).toBe(false);
    expect(component.view().conflict).toBe(true);
    expect(component.view().pending).toBeNull();
  });
  it('verwirft die späte Archivantwort nach Workspacewechsel', async () => {
    const { fixture, component, service, workspace } = setup();
    fixture.detectChanges();
    await settle();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const response = deferred<number>();
    service.archive.mockReturnValueOnce(response.promise);
    const saving = component.archiveBrand(brand);
    workspace.set({ id: 'workspace-b' });
    expect(component.view().brands).toEqual([]);
    await settle();
    response.resolve(2);
    await saving;
    expect(component.view().brands[0].archived).toBe(false);
  });
});

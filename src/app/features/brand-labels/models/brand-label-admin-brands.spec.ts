import { describe, expect, it, vi } from 'vitest';
import {
  executeLabelBrandEdit,
  LabelBrandAdminError,
  loadLabelAdminBrands,
  prepareLabelBrandEdit,
  readLabelAdminBrands,
} from './brand-label-admin-brands';

const requestId = '00000000-0000-4000-8000-000000000001';
const brand = { id: 1, name: 'Pilotmarke', slug: 'pilotmarke', aliases: ['PM'], version: 1, archived: false };
const line = { id: 2, brandId: 1, name: 'Sport', version: 1, archived: false };
const create = () => ({ kind: 'brand', id: null, expectedVersion: null, requestId, input: { name: brand.name, slug: brand.slug, aliases: ['PM'] } });

describe('Referenzmarken – Antwort- und Schreibvertrag', () => {
  it('liest Marken und Linien als unabhängige geprüfte Kopien', () => {
    const original = [{ ...brand, lines: [line] }];
    const result = readLabelAdminBrands(original);
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
    expect(result[0]).not.toBe(original[0]);
    expect(result[0].lines[0]).not.toBe(line);
  });
  it('behält archivierte Marken und Linien sichtbar', () => {
    expect(readLabelAdminBrands([{ ...brand, archived: true, lines: [{ ...line, archived: true }] }])[0].archived).toBe(true);
  });
  it('weist fremde Linienzuordnung, doppelte Kennungen und Zusatzfelder ab', () => {
    expect(() => readLabelAdminBrands([{ ...brand, lines: [{ ...line, brandId: 99 }] }])).toThrow();
    expect(() => readLabelAdminBrands([{ ...brand, lines: [] }, { ...brand, lines: [] }])).toThrow();
    expect(() => readLabelAdminBrands([{ ...brand, lines: [line, line] }])).toThrow();
    expect(() => readLabelAdminBrands([{ ...brand, lines: [], role: 'admin' }])).toThrow();
  });
  it('weist unechte Archivwerte und leere Namen ab', () => {
    expect(() => readLabelAdminBrands([{ ...brand, archived: 'false', lines: [] }])).toThrow();
    expect(() => readLabelAdminBrands([{ ...brand, name: '\u00a0', lines: [] }])).toThrow();
  });
  it('hält einen vorbereiteten Auftrag einschließlich Alternativnamen unveränderlich fest', () => {
    const input = create();
    const command = prepareLabelBrandEdit(input);
    input.input.name = 'Spätere Eingabe';
    input.input.aliases.push('nachträglich');
    expect(command.input.name).toBe('Pilotmarke');
    expect(Object.isFrozen(command)).toBe(true);
    expect(Object.isFrozen(command.input)).toBe(true);
    expect(command.kind === 'brand' && command.input.aliases).toEqual(['PM']);
    expect(command.kind === 'brand' && Object.isFrozen(command.input.aliases)).toBe(true);
  });
  it.each([
    { ...create(), id: 0 },
    { ...create(), expectedVersion: 1 },
    { ...create(), id: 1, expectedVersion: null },
    { ...create(), requestId: 'kein-uuid' },
    { ...create(), input: { name: ' ', slug: 'marke', aliases: [] } },
    { ...create(), input: { name: 'Marke', slug: '../fremd', aliases: [] } },
    { ...create(), input: { name: 'Marke', slug: 'marke', aliases: Array(21).fill('Name') } },
    { ...create(), input: { name: 'Marke', slug: 'marke', aliases: [], role: 'admin' } },
    { kind: 'line', id: null, expectedVersion: null, requestId, input: { brandId: 1.5, name: 'Linie' } },
  ])('weist ungültige Aufträge vor dem Senden ab: %#', (value) => {
    expect(() => prepareLabelBrandEdit(value)).toThrow(LabelBrandAdminError);
  });
  it('verwendet nur den Betreiber-RPC für die Markenliste', async () => {
    const transport = vi.fn().mockResolvedValue({ data: [{ ...brand, lines: [] }], error: null });
    expect(await loadLabelAdminBrands(transport)).toEqual([{ ...brand, lines: [] }]);
    expect(transport).toHaveBeenCalledExactlyOnceWith('list_label_admin_brands', {});
  });
  it('sendet keine selbst gesetzte Rolle und bestätigt die neue Marke', async () => {
    const command = prepareLabelBrandEdit(create());
    const transport = vi.fn().mockResolvedValue({ data: brand, error: null });
    expect(await executeLabelBrandEdit(transport, command)).toEqual({ kind: 'brand', value: brand });
    expect(transport).toHaveBeenCalledExactlyOnceWith('save_label_brand', {
      p_id: null, p_expected_version: null, p_input: command.input, p_request_id: requestId,
    });
  });
  it('bestätigt eine Linienumbenennung nur mit passender Kennung und Folgeversion', async () => {
    const command = prepareLabelBrandEdit({ kind: 'line', id: 2, expectedVersion: 1, requestId, input: { brandId: 1, name: 'Neu' } });
    const transport = vi.fn().mockResolvedValue({ data: { ...line, name: 'Neu', version: 2 }, error: null });
    expect(await executeLabelBrandEdit(transport, command)).toEqual({ kind: 'line', value: { ...line, name: 'Neu', version: 2 } });
    expect(transport.mock.calls[0][0]).toBe('save_label_brand_line');
    transport.mockResolvedValueOnce({ data: { ...line, name: 'Neu', version: 2, brandId: 99 }, error: null });
    await expect(executeLabelBrandEdit(transport, command)).rejects.toMatchObject({ code: 'network' });
  });
  it.each([
    { ...brand, version: 2 },
    { ...brand, name: 'Fremde Antwort' },
    { ...brand, aliases: [] },
    { ...brand, archived: true },
    null,
  ])('wertet eine widersprüchliche Schreibantwort nicht als Erfolg: %#', async (data) => {
    await expect(executeLabelBrandEdit(vi.fn().mockResolvedValue({ data, error: null }), prepareLabelBrandEdit(create()))).rejects.toMatchObject({ code: 'network' });
  });
  it.each([
    [{ code: '42501', message: 'private SQL' }, 'forbidden'],
    [{ code: 'PGRST202', message: 'private SQL' }, 'unavailable'],
    [{ code: 'P0001', details: 'label_version_conflict' }, 'conflict'],
    [{ code: '23505', message: 'private SQL' }, 'validation'],
    [{ code: '22023', details: 'private SQL' }, 'validation'],
    [{ code: 'unexpected', message: 'private SQL' }, 'network'],
  ])('zeigt nur kontrollierte Fehlermeldungen: %j', async (error, code) => {
    const transport = vi.fn().mockResolvedValue({ data: null, error });
    await expect(loadLabelAdminBrands(transport)).rejects.toMatchObject({ code });
    await expect(loadLabelAdminBrands(transport)).rejects.not.toThrow('private SQL');
  });
  it('wiederholt einen Schreibauftrag niemals automatisch', async () => {
    const command = prepareLabelBrandEdit(create());
    const transport = vi.fn().mockRejectedValueOnce(new Error('Verbindung weg'));
    await expect(executeLabelBrandEdit(transport, command)).rejects.toMatchObject({ code: 'network' });
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockResolvedValueOnce({ data: brand, error: null });
    await executeLabelBrandEdit(transport, command);
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
  });
});

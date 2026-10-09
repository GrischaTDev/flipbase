import { describe, expect, it } from 'vitest';
import { CLOTHING_SIZE_TABLES } from '../../models/clothing-size-catalog';
import { ClothingSizeGuideComponent } from './clothing-size-guide.component';

describe('Allgemeine Größenübersicht', () => {
  it('zeigt ohne Suche alle gefüllten Tabellen und beide Kleidungsarten', () => {
    const component = new ClothingSizeGuideComponent();
    expect(component.visibleTables()).toHaveLength(CLOTHING_SIZE_TABLES.length);
    expect(component.rowCount()).toBeGreaterThan(50);
    expect(component.groups().map((group) => group.title)).toEqual([
      'Allgemeine Größenübersicht',
      'Hosenlängen: Innenbein und Außenbein',
      'Kinder & Jugendliche: Labels erkennen',
      'Oberteile: Brustweiten zur Orientierung',
      'Labelgrößen vergleichen',
      'Besondere Größen',
    ]);
    expect(new Set(component.visibleTables().map((entry) => entry.table.category))).toEqual(
      new Set(['trousers', 'tops', 'clothing']),
    );
    expect(component.groups()[0]?.tables).toHaveLength(2);
    expect(component.groups()[0]?.tables.every((entry) => entry.table.kind === 'orientation')).toBe(
      true,
    );
    expect(component.visibleTables().map((entry) => entry.table.kind)).not.toContain('garment');
  });

  it('entfernt beim Wechsel auf Oberteile die unsichtbaren Hosenmaße', () => {
    const component = new ClothingSizeGuideComponent();
    component.setMeasurement('waistFlat', 38);
    component.setMeasurement('inseam', 80);
    component.setMeasurement('chestFlat', 50);
    component.setCategory('tops');
    expect(component.measurements()).toEqual({ chestFlat: 50 });
    expect(component.visibleMeasurementFields().map((field) => field.key)).toEqual(['chestFlat']);
    expect(
      component
        .visibleTables()
        .every((entry) => ['tops', 'clothing'].includes(entry.table.category)),
    ).toBe(true);
  });

  it('grenzt Zielgruppen ein und lässt nach Rücksetzung die gesamte Übersicht stehen', () => {
    const component = new ClothingSizeGuideComponent();
    component.setAudience('women');
    component.setCategory('trousers');
    component.query.set('29');
    component.tolerance.set(2);
    expect(component.filtersActive()).toBe(true);
    component.resetFilters();
    expect(component.filtersActive()).toBe(false);
    expect(component.measurements()).toEqual({});
    expect(component.tolerance()).toBe(1);
    expect(component.visibleTables()).toHaveLength(CLOTHING_SIZE_TABLES.length);
  });

  it('bietet nur unterstützte Größenmaße und die zusätzliche Außenbeinlänge an', () => {
    const component = new ClothingSizeGuideComponent();
    expect(component.visibleMeasurementFields().map((field) => field.key)).toEqual([
      'waistFlat',
      'inseam',
      'outseam',
      'chestFlat',
    ]);
    component.setMeasurement('outseam', 104);
    expect(component.hasMeasurements()).toBe(true);
    expect(component.hasSizeMeasurements()).toBe(false);
    expect(component.hasLengthMeasurement()).toBe(false);
    expect(component.visibleTables()).toHaveLength(CLOTHING_SIZE_TABLES.length);
    expect(component.sizeEstimateCount()).toBe(0);
    expect(component.lengthMatchCount()).toBe(0);
  });

  it('ordnet 42 cm Bundweite als Herren-M ein und prüft die Innenbeinlänge getrennt', () => {
    const component = new ClothingSizeGuideComponent();
    component.setCategory('trousers');
    component.setAudience('men');
    component.tolerance.set(0);
    component.setMeasurement('waistFlat', 42);
    component.setMeasurement('inseam', 81.28);
    component.setMeasurement('outseam', 104);
    const sizeTable = component
      .visibleTables()
      .find((entry) => entry.table.id === 'general-men-trousers');
    expect(sizeTable?.rows.map((row) => row.cells[0])).toEqual(['M']);
    expect(sizeTable?.matchedRowIds).toHaveLength(1);
    const lengths = component.visibleTables().find((entry) => entry.table.id === 'nominal-length');
    expect(lengths?.rows.map((row) => row.cells[0])).toEqual(['L32']);
    expect(lengths?.matchedRowIds).toHaveLength(1);
    expect(component.sizeEstimateCount()).toBe(1);
    expect(component.lengthMatchCount()).toBe(1);
  });

  it('zählt bei alleiniger Innenbeinlänge keine geschätzte Weitengröße', () => {
    const component = new ClothingSizeGuideComponent();
    component.tolerance.set(0);
    component.setMeasurement('inseam', 81.28);
    expect(component.hasSizeMeasurements()).toBe(false);
    expect(component.hasLengthMeasurement()).toBe(true);
    expect(component.sizeEstimateCount()).toBe(0);
    expect(component.lengthMatchCount()).toBe(1);
  });

  it.each(['M', 'W29', 'EU40'])('behält die eingegebene Länge bei der Suche nach %s', (query) => {
    const component = new ClothingSizeGuideComponent();
    component.tolerance.set(0);
    component.setMeasurement('inseam', 88.9);
    component.query.set(query);
    const lengths = component.visibleTables().find((entry) => entry.table.id === 'nominal-length');
    expect(lengths?.rows.map((row) => row.cells[0])).toEqual(['L35']);
    expect(component.lengthMatchCount()).toBe(1);
    component.query.set('W29/L32');
    expect(component.visibleTables().some((entry) => entry.table.id === 'nominal-length')).toBe(
      false,
    );
    expect(component.lengthMatchCount()).toBe(0);
  });

  it('findet allgemeine XXL-Zeilen über das Label 2XL', () => {
    const component = new ClothingSizeGuideComponent();
    component.query.set('2XL');
    const tables = component.visibleTables().filter((entry) => entry.table.kind === 'orientation');
    expect(tables).toHaveLength(3);
    expect(
      tables.every((entry) => entry.rows.length === 1 && entry.rows[0]?.cells[0] === 'XXL'),
    ).toBe(true);
  });

  it('meldet ungültige Messwerte und den fehlenden Suchspielraum', () => {
    const component = new ClothingSizeGuideComponent();
    component.setMeasurement('waistFlat', -1);
    expect(component.measurementError()).toBeTruthy();
    component.setMeasurement('waistFlat', 36);
    component.tolerance.set(null);
    expect(component.measurementError()).toBeTruthy();
    component.tolerance.set(1);
    expect(component.measurementError()).toBeNull();
  });

  it('erklärt eine W/L-Angabe ohne eine universelle EU-Größe zu behaupten', () => {
    const component = new ClothingSizeGuideComponent();
    component.query.set('W29/L35');
    expect(component.decodedLabel()?.waistCm).toBeCloseTo(73.66, 2);
    expect(component.decodedLabel()?.inseamCm).toBeCloseTo(88.9, 2);
    expect(component.decodedLabel()?.description).toBeTruthy();
  });

  it('nimmt veröffentlichte Marken in den gemeinsamen Filter auf', () => {
    const component = new ClothingSizeGuideComponent();
    component.publishedBrands.set(['Eigene Referenzmarke', 'Eigene Referenzmarke']);
    expect(
      component.brandOptions().filter((option) => option.value === 'Eigene Referenzmarke'),
    ).toEqual([{ value: 'Eigene Referenzmarke', label: 'Eigene Referenzmarke' }]);
  });
  it('trennt Kinderlabels von Erwachsenen-Richtbereichen und hält nur vorhandene Sprungziele', () => {
    const component = new ClothingSizeGuideComponent();
    component.setAudience('children');
    component.setCategory('tops');
    component.query.set('YM');
    component.setMeasurement('chestFlat', 40);
    expect(component.visibleTables().every(({ table }) => table.audience === 'children')).toBe(
      true,
    );
    expect(component.sizeEstimateCount()).toBe(0);
    expect(component.hasSizeMeasurements()).toBe(false);
    expect(component.sectionLinks().map((link) => link.id)).toEqual(['size-guide-children']);
  });
  it('fasst Quellen zentral zusammen und übernimmt Zusatzquellen ohne Dopplung', () => {
    const component = new ClothingSizeGuideComponent();
    expect(component.showSources()).toBe(false);
    expect(new Set(component.sources().map((source) => source.url)).size).toBe(
      component.sources().length,
    );
    component.publishedSources.set([
      { title: 'Zusatzquelle', url: 'https://example.com/new', reviewedAt: null },
    ]);
    expect(component.sources().some((source) => source.url === 'https://example.com/new')).toBe(
      true,
    );
    component.publishedSources.set([]);
    expect(component.sources().some((source) => source.url === 'https://example.com/new')).toBe(
      false,
    );
  });
});

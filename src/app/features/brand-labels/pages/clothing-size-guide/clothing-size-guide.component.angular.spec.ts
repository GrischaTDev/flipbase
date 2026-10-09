import { describe, expect, it } from 'vitest';
import { CLOTHING_SIZE_TABLES } from '../../models/clothing-size-catalog';
import { ClothingSizeGuideComponent } from './clothing-size-guide.component';

describe('Recherchierte Größenübersicht', () => {
  it('zeigt ohne Suche alle gefüllten Tabellen und beide Kleidungsarten', () => {
    const component = new ClothingSizeGuideComponent();
    expect(component.visibleTables()).toHaveLength(CLOTHING_SIZE_TABLES.length);
    expect(component.rowCount()).toBeGreaterThan(50);
    expect(component.groups().map((group) => group.title)).toEqual([
      'Maße der fertigen Kleidung',
      'Labelgrößen vergleichen',
      'Jeanslängen und besondere Größen',
    ]);
    expect(new Set(component.visibleTables().map((entry) => entry.table.category))).toEqual(
      new Set(['trousers', 'tops']),
    );
  });

  it('entfernt beim Wechsel auf Oberteile die unsichtbaren Hosenmaße', () => {
    const component = new ClothingSizeGuideComponent();
    component.setMeasurement('waistFlat', 38);
    component.setMeasurement('inseam', 80);
    component.setMeasurement('chestFlat', 50);
    component.setCategory('tops');
    expect(component.measurements()).toEqual({ chestFlat: 50 });
    expect(component.visibleMeasurementFields().map((field) => field.key)).toEqual([
      'chestFlat',
      'backLength',
    ]);
    expect(component.visibleTables().every((entry) => entry.table.category === 'tops')).toBe(true);
  });

  it('grenzt Zielgruppen ein und lässt nach Rücksetzung die gesamte Übersicht stehen', () => {
    const component = new ClothingSizeGuideComponent();
    component.setAudience('women');
    component.setCategory('trousers');
    component.query.set('29');
    component.tolerance.set(2);
    component.extraMeasurements.set(true);
    expect(component.filtersActive()).toBe(true);
    component.resetFilters();
    expect(component.filtersActive()).toBe(false);
    expect(component.extraMeasurements()).toBe(false);
    expect(component.measurements()).toEqual({});
    expect(component.tolerance()).toBe(1);
    expect(component.visibleTables()).toHaveLength(CLOTHING_SIZE_TABLES.length);
  });

  it('entfernt ausgeblendete Zusatzmaße als Suchbedingungen', () => {
    const component = new ClothingSizeGuideComponent();
    component.toggleExtraMeasurements();
    component.setMeasurement('hipFlat', 46);
    component.setMeasurement('waistFlat', 35);
    component.toggleExtraMeasurements();
    expect(component.extraMeasurements()).toBe(false);
    expect(component.measurements()).toEqual({ waistFlat: 35 });
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
});

import { describe, it, expect } from 'vitest';
import { clampRatio, ratioFromKey, ratioFromPointer, readStoredRatio } from './split-pane-ratio';

describe('Verhaeltnis begrenzen', () => {
  it('laesst einen Wert innerhalb der Grenzen stehen', () => {
    expect(clampRatio(50, 25, 75)).toBe(50);
  });

  it('zieht einen zu kleinen Wert auf die Untergrenze', () => {
    expect(clampRatio(5, 25, 75)).toBe(25);
  });

  it('zieht einen zu grossen Wert auf die Obergrenze', () => {
    expect(clampRatio(120, 25, 75)).toBe(75);
  });

  it('faengt Unsinn mit der Mitte zwischen den Grenzen ab', () => {
    // NaN entsteht aus einer kaputten Zahl im Speicher. Ungefiltert wuerde
    // daraus eine Gitterbreite von "NaN%" und die Seite waere kaputt.
    expect(clampRatio(Number.NaN, 25, 75)).toBe(50);
  });
});

describe('Verhaeltnis aus der Zeigerposition', () => {
  it('rechnet die Mitte des Bereichs auf 50', () => {
    expect(ratioFromPointer(600, 100, 1000, 25, 75)).toBe(50);
  });

  it('haelt die Untergrenze ein, auch weit links daneben', () => {
    expect(ratioFromPointer(-500, 100, 1000, 25, 75)).toBe(25);
  });

  it('haelt die Obergrenze ein, auch weit rechts daneben', () => {
    expect(ratioFromPointer(5000, 100, 1000, 25, 75)).toBe(75);
  });

  it('liefert bei Breite null die Mitte statt einer Division durch null', () => {
    expect(ratioFromPointer(0, 0, 0, 25, 75)).toBe(50);
  });
});

describe('Verhaeltnis aus einem Tastendruck', () => {
  it('geht mit Pfeil links um zwei Prozentpunkte zurueck', () => {
    expect(ratioFromKey('ArrowLeft', 50, false, 25, 75)).toBe(48);
  });

  it('geht mit Pfeil rechts um zwei Prozentpunkte vor', () => {
    expect(ratioFromKey('ArrowRight', 50, false, 25, 75)).toBe(52);
  });

  it('geht mit Umschalttaste in Zehnerschritten', () => {
    expect(ratioFromKey('ArrowRight', 50, true, 25, 75)).toBe(60);
  });

  it('springt mit Pos1 auf die Untergrenze', () => {
    expect(ratioFromKey('Home', 50, false, 25, 75)).toBe(25);
  });

  it('springt mit Ende auf die Obergrenze', () => {
    expect(ratioFromKey('End', 50, false, 25, 75)).toBe(75);
  });

  it('bleibt an der Grenze stehen, statt darueber hinaus zu laufen', () => {
    expect(ratioFromKey('ArrowLeft', 25, false, 25, 75)).toBe(25);
  });

  it('meldet bei einer nicht zustaendigen Taste null', () => {
    // null heisst: nicht behandelt. Die Komponente laesst das Ereignis dann
    // in Ruhe, statt Tab oder Escape zu verschlucken.
    expect(ratioFromKey('Tab', 50, false, 25, 75)).toBeNull();
  });
});

describe('Gemerktes Verhaeltnis lesen', () => {
  it('liest eine gespeicherte Zahl', () => {
    expect(readStoredRatio('63', 25, 75)).toBe(63);
  });

  it('meldet ohne gespeicherten Wert null', () => {
    expect(readStoredRatio(null, 25, 75)).toBeNull();
  });

  it('meldet bei Unsinn null statt eines geratenen Werts', () => {
    // Aus fremdem Inhalt im Speicher darf keine kaputte Seite entstehen.
    expect(readStoredRatio('links', 25, 75)).toBeNull();
    expect(readStoredRatio('', 25, 75)).toBeNull();
  });

  it('holt einen Wert ausserhalb der Grenzen zurueck', () => {
    // Die Grenzen koennen sich geaendert haben, seit gespeichert wurde.
    expect(readStoredRatio('90', 25, 75)).toBe(75);
  });
});

import { describe, it, expect } from 'vitest';
import { archiveName, effectiveBaseName, exportFileName, sanitizeBaseName } from './file-name';

describe('Namen entschaerfen', () => {
  it('schreibt Umlaute und Eszett aus', () => {
    expect(sanitizeBaseName('Größe 42 Äpfel')).toBe('groesse-42-aepfel');
  });

  it('entfernt in Dateinamen verbotene Zeichen', () => {
    expect(sanitizeBaseName('Nike / Air: Max?')).toBe('nike-air-max');
  });

  it('fasst Trennzeichen zusammen und schneidet Raender ab', () => {
    expect(sanitizeBaseName('  --nike---air--  ')).toBe('nike-air');
  });

  it('behaelt Unterstriche', () => {
    expect(sanitizeBaseName('nike_air_max')).toBe('nike_air_max');
  });

  it('begrenzt auf 60 Zeichen ohne Bindestrich am Ende', () => {
    const long = sanitizeBaseName('a'.repeat(80));

    expect(long.length).toBe(60);
    expect(long.endsWith('-')).toBe(false);
  });

  it('laesst nach dem Schnitt keinen Bindestrich am Ende stehen', () => {
    expect(sanitizeBaseName('a'.repeat(59) + ' bbbb')).toBe('a'.repeat(59));
  });

  it('liefert eine leere Zeichenkette, wenn nichts Brauchbares uebrig bleibt', () => {
    expect(sanitizeBaseName('🎉🎉')).toBe('');
    expect(sanitizeBaseName('   ')).toBe('');
    expect(sanitizeBaseName('---')).toBe('');
  });
});

describe('Wirksamer Grundname', () => {
  const noon = new Date(2026, 8, 10, 14, 32, 5);

  it('nimmt den eingetippten Namen, wenn einer da ist', () => {
    expect(effectiveBaseName('macbook-air', noon)).toBe('macbook-air');
  });

  it('setzt ohne Eingabe Datum und Uhrzeit ein', () => {
    // Jahr zuerst, damit der Explorer von allein chronologisch sortiert.
    expect(effectiveBaseName('', noon)).toBe('2026-09-10-1432');
  });

  it('fuellt Monat, Tag, Stunde und Minute auf zwei Stellen', () => {
    expect(effectiveBaseName('', new Date(2026, 0, 3, 7, 4, 0))).toBe('2026-01-03-0704');
  });

  it('benutzt keinen Doppelpunkt', () => {
    // In Windows-Dateinamen verboten - eine Datei mit Doppelpunkt liesse
    // sich gar nicht erst schreiben.
    expect(effectiveBaseName('', noon)).not.toContain(':');
  });
});

describe('Name einer Exportdatei', () => {
  it('nummeriert durchgehend, auch das erste Bild', () => {
    // Das frueher angehaengte "-main" unterbrach die Zahlenkette am Ende des
    // Namens und brachte die Sortierung in Windows durcheinander.
    expect(exportFileName(0, 'macbook-air')).toBe('macbook-air-01.jpg');
    expect(exportFileName(1, 'macbook-air')).toBe('macbook-air-02.jpg');
  });

  it('haengt kein main mehr an', () => {
    expect(exportFileName(0, 'macbook-air')).not.toContain('main');
  });

  it('behaelt die fuehrende Null bis zur neunten Datei', () => {
    // Die Upload-Dialoge der Plattformen sortieren rein alphabetisch; ohne
    // Null stuende dort 10 vor 2.
    expect(exportFileName(8, 'x')).toBe('x-09.jpg');
    expect(exportFileName(9, 'x')).toBe('x-10.jpg');
  });

  it('setzt den Namen vor die Nummer', () => {
    // Andersherum mischten sich mehrere Artikel im selben Ordner
    // ineinander: erst alle Einsen, dann alle Zweien.
    expect(exportFileName(0, 'macbook-air').startsWith('macbook-air')).toBe(true);
  });
});

describe('Name des Archivs', () => {
  it('haengt nur die Endung an den wirksamen Namen', () => {
    expect(archiveName('macbook-air')).toBe('macbook-air.zip');
  });

  it('benennt den Zeitstempel genauso wie die Dateien darin', () => {
    // Der ZIP-Rueckfall darf nicht anders benennen als der Hauptweg.
    const stamp = effectiveBaseName('', new Date(2026, 8, 10, 14, 32, 5));

    expect(archiveName(stamp)).toBe('2026-09-10-1432.zip');
    expect(exportFileName(0, stamp)).toBe('2026-09-10-1432-01.jpg');
  });
});

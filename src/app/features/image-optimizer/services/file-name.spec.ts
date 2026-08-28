import { describe, it, expect } from 'vitest';
import { archiveName, exportFileName, sanitizeBaseName } from './file-name';

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

describe('Dateinamen bilden', () => {
  it('nummeriert ohne Grundnamen wie bisher', () => {
    expect(exportFileName(0, '')).toBe('01-main.jpg');
    expect(exportFileName(1, '')).toBe('02.jpg');
    expect(exportFileName(11, '')).toBe('12.jpg');
  });

  it('stellt den Grundnamen voran', () => {
    expect(exportFileName(0, 'nike-air-max-42')).toBe('nike-air-max-42-01-main.jpg');
    expect(exportFileName(2, 'nike-air-max-42')).toBe('nike-air-max-42-03.jpg');
  });

  it('benennt das Archiv nach dem Grundnamen', () => {
    expect(archiveName('')).toBe('flipbase-bilder.zip');
    expect(archiveName('nike-air-max-42')).toBe('nike-air-max-42.zip');
  });
});

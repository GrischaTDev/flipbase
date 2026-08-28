import { describe, it, expect } from 'vitest';
import { splitImageFiles } from './file-drop.directive';

function file(name: string, type: string): File {
  return new File([''], name, { type });
}

describe('Dateien sortieren', () => {
  it('trennt Bilder von allem anderen', () => {
    const result = splitImageFiles([
      file('a.jpg', 'image/jpeg'),
      file('b.pdf', 'application/pdf'),
      file('c.png', 'image/png'),
      file('d.txt', 'text/plain'),
    ]);

    expect(result.images.map((f) => f.name)).toEqual(['a.jpg', 'c.png']);
    expect(result.skipped).toBe(2);
  });

  it('meldet null uebersprungene, wenn alles Bilder sind', () => {
    expect(splitImageFiles([file('a.jpg', 'image/jpeg')]).skipped).toBe(0);
  });

  it('behandelt eine leere Liste', () => {
    const result = splitImageFiles([]);

    expect(result.images).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('erkennt HEIC am Dateinamen, obwohl der Browser keinen Typ meldet', () => {
    // HEIC wird bewusst durchgelassen: Der Nutzer soll die verstaendliche
    // Meldung am Bild sehen, nicht ein stilles Verschwinden erleben.
    const result = splitImageFiles([file('foto.heic', '')]);

    expect(result.images.map((f) => f.name)).toEqual(['foto.heic']);
    expect(result.skipped).toBe(0);
  });
});

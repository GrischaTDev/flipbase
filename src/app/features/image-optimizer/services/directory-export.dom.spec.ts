import { describe, it, expect, vi, afterEach } from 'vitest';
import { canWriteDirectory, DirectoryExportService } from './directory-export.service';

/** Ein Verzeichnis im Speicher, das mitschreibt, was hineingeschrieben wurde. */
function fakeDirectory(existing: readonly string[] = []) {
  const written = new Map<string, number>();
  const created: string[] = [];

  function makeHandle(path: string) {
    return {
      async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        const full = path ? `${path}/${name}` : name;
        if (!options?.create && !existing.includes(full) && !created.includes(full)) {
          const error = new Error('not found');
          error.name = 'NotFoundError';
          throw error;
        }
        if (options?.create) created.push(full);
        return makeHandle(full);
      },
      async getFileHandle(name: string) {
        const full = `${path}/${name}`;
        return {
          async createWritable() {
            return {
              async write(data: Blob) {
                written.set(full, data.size);
              },
              // eslint-disable-next-line @typescript-eslint/no-empty-function -- Fake-Stream, "close" muss nur existieren.
              async close() {},
            };
          },
        };
      },
    };
  }

  return { root: makeHandle(''), written, created };
}

function entry(folder: string, file: string): { folder: string; file: string; data: Blob } {
  return { folder, file, data: new Blob(['x'], { type: 'image/jpeg' }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Kann dieser Browser in einen Ordner schreiben', () => {
  it('erkennt einen Browser ohne die Funktion', () => {
    vi.stubGlobal('showDirectoryPicker', undefined);

    expect(canWriteDirectory()).toBe(false);
  });

  it('erkennt einen Browser mit der Funktion', () => {
    vi.stubGlobal('showDirectoryPicker', () => Promise.resolve({}));

    expect(canWriteDirectory()).toBe(true);
  });
});

describe('In einen Ordner schreiben', () => {
  it('legt je Plattform einen Unterordner an und schreibt hinein', async () => {
    const target = fakeDirectory();
    vi.stubGlobal('showDirectoryPicker', () => Promise.resolve(target.root));

    const result = await new DirectoryExportService().write(
      [entry('eBay', 'a-01.jpg'), entry('Vinted', 'a-01.jpg')],
      'a',
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Fortschritt ist hier nicht Gegenstand des Tests.
      () => {},
    );

    expect(result.outcome).toBe('written');
    expect([...target.written.keys()].sort()).toEqual(['a/Vinted/a-01.jpg', 'a/eBay/a-01.jpg']);
  });

  it('weicht auf einen freien Namen aus, statt zu ueberschreiben', async () => {
    const target = fakeDirectory(['a']);
    vi.stubGlobal('showDirectoryPicker', () => Promise.resolve(target.root));

    const result = await new DirectoryExportService().write(
      [entry('eBay', 'a-01.jpg')],
      'a',
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Fortschritt ist hier nicht Gegenstand des Tests.
      () => {},
    );

    expect([...target.written.keys()]).toEqual(['a (2)/eBay/a-01.jpg']);
    // Der gemeldete Name muss der benutzte sein - sonst schickt die
    // Erfolgsmeldung den Nutzer in den falschen Ordner.
    expect(result).toEqual({ outcome: 'written', folder: 'a (2)' });
  });

  it('meldet den Fortschritt je geschriebener Datei', async () => {
    const target = fakeDirectory();
    vi.stubGlobal('showDirectoryPicker', () => Promise.resolve(target.root));
    const steps: string[] = [];

    await new DirectoryExportService().write(
      [entry('eBay', 'a-01.jpg'), entry('eBay', 'a-02.jpg')],
      'a',
      (done, total) => steps.push(`${done}/${total}`),
    );

    expect(steps).toEqual(['1/2', '2/2']);
  });

  it('meldet einen Abbruch als abgebrochen, nicht als Fehler', async () => {
    // Wer den Dialog schliesst, hat nichts falsch gemacht - dafuer darf
    // keine Fehlermeldung erscheinen.
    const abort = new Error('abgebrochen');
    abort.name = 'AbortError';
    vi.stubGlobal('showDirectoryPicker', () => Promise.reject(abort));

    const result = await new DirectoryExportService().write(
      [entry('eBay', 'a.jpg')],
      'a',
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Fortschritt ist hier nicht Gegenstand des Tests.
      () => {},
    );

    expect(result.outcome).toBe('cancelled');
  });

  it('reicht einen echten Fehler nach aussen durch', async () => {
    vi.stubGlobal('showDirectoryPicker', () => Promise.reject(new Error('Platte voll')));

    await expect(
      new DirectoryExportService().write(
        [entry('eBay', 'a.jpg')],
        'a',
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Fortschritt ist hier nicht Gegenstand des Tests.
        () => {},
      ),
    ).rejects.toThrow('Platte voll');
  });
});

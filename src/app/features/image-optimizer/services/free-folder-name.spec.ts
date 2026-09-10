import { describe, it, expect } from 'vitest';
import { freeFolderName, DirectoryLookup } from './free-folder-name';

/**
 * Baut ein Verzeichnis nach, in dem die genannten Namen belegt sind. Die
 * echte Schnittstelle wirft `NotFoundError`, wenn es den Ordner nicht gibt.
 */
function directory(taken: readonly string[]): DirectoryLookup {
  return {
    getDirectoryHandle(name: string): Promise<unknown> {
      if (taken.includes(name)) return Promise.resolve({});
      const error = new Error('not found');
      error.name = 'NotFoundError';
      return Promise.reject(error);
    },
  };
}

describe('Ersten freien Ordnernamen finden', () => {
  it('nimmt den Wunschnamen, wenn er frei ist', async () => {
    expect(await freeFolderName(directory([]), 'macbook-air')).toBe('macbook-air');
  });

  it('zaehlt bei belegtem Namen ab zwei', async () => {
    // Wie der Browser beim Herunterladen. "(1)" waere verwirrend: Der erste
    // Ordner traegt ja auch keine Eins.
    expect(await freeFolderName(directory(['macbook-air']), 'macbook-air')).toBe('macbook-air (2)');
  });

  it('zaehlt weiter, solange belegt ist', async () => {
    const taken = ['macbook-air', 'macbook-air (2)', 'macbook-air (3)'];

    expect(await freeFolderName(directory(taken), 'macbook-air')).toBe('macbook-air (4)');
  });

  it('uebergeht eine Luecke nicht', async () => {
    // (2) ist frei, obwohl (3) belegt ist - dann wird (2) genommen.
    expect(await freeFolderName(directory(['macbook-air', 'macbook-air (3)']), 'macbook-air')).toBe(
      'macbook-air (2)',
    );
  });

  it('gibt auf, statt endlos zu zaehlen', async () => {
    const endless: DirectoryLookup = {
      getDirectoryHandle: () => Promise.resolve({}),
    };

    await expect(freeFolderName(endless, 'x')).rejects.toThrow(/freier Ordnername/);
  });
});

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createEmptyLabelContent } from './brand-label-content';
import { validateLabelDraftInput, reorderLabelImages } from './brand-label-draft';
import { LabelValidationError } from './brand-label-validation';

function image(assetId = 1, position = 0) {
  return { assetId, position, caption: '', alt: '', referenceItem: '' };
}
function input() {
  return { content: createEmptyLabelContent(), images: [image()] };
}
function rejects(value: unknown, code: string) {
  assert.throws(
    () => validateLabelDraftInput(value),
    (error: unknown) => error instanceof LabelValidationError && error.code === code,
  );
}

describe('Labelentwurf – Bilder ohne Schreibrechte auf Veröffentlichungen', () => {
  it('erlaubt einen leeren, noch nicht veröffentlichungsreifen Entwurf', () => {
    const value = { content: createEmptyLabelContent(), images: [] };
    assert.deepEqual(validateLabelDraftInput(value), value);
  });
  it('übernimmt ausschließlich die geplanten Bildzuordnungsfelder', () =>
    assert.deepEqual(validateLabelDraftInput(input()), input()));
  for (const field of ['storagePath', 'processed', 'approved', 'permissionStatus', 'expiresIn']) {
    it(`weist vom Client gesetztes ${field} zurück`, () =>
      rejects({ ...input(), images: [{ ...image(), [field]: true }] }, 'unknown-field'));
  }
  it('weist Nutzerkopien und Workspace-Overrides zurück', () =>
    rejects({ ...input(), workspaceId: '123' }, 'unknown-field'));
  it('validiert auch eingebettete Labelinhalte', () =>
    rejects(
      { ...input(), content: { ...createEmptyLabelContent(), title: 'x'.repeat(161) } },
      'text-too-long',
    ));
  it('verweigert doppelte Bildressourcen', () =>
    rejects({ ...input(), images: [image(1, 0), image(1, 1)] }, 'duplicate-image'));
  it('verlangt fortlaufende Bildpositionen entsprechend der Liste', () =>
    rejects({ ...input(), images: [image(1, 0), image(2, 3)] }, 'invalid-image-order'));
  it('verweigert eine falsche Assetkennung', () =>
    rejects({ ...input(), images: [image(-1)] }, 'invalid-id'));
  it('kopiert Zuordnungen und verschachtelte Labelinhalte', () => {
    const value = input();
    const output = validateLabelDraftInput(value);
    assert.notEqual(output.images, value.images);
    assert.notEqual(output.images[0], value.images[0]);
    assert.notEqual(output.content, value.content);
  });
  it('erlaubt 24 Bilder, aber keine 25', () => {
    const images = Array.from({ length: 24 }, (_, i) => image(i + 1, i));
    assert.equal(validateLabelDraftInput({ ...input(), images }).images.length, 24);
    rejects({ ...input(), images: [...images, image(25, 24)] }, 'too-many-items');
  });
  for (const field of ['caption', 'alt'] as const) {
    it(`${field} darf 4000 Zeichen nicht überschreiten`, () => {
      assert.equal(
        validateLabelDraftInput({ ...input(), images: [{ ...image(), [field]: 'x'.repeat(4000) }] })
          .images[0]?.[field].length,
        4000,
      );
      rejects({ ...input(), images: [{ ...image(), [field]: 'x'.repeat(4001) }] }, 'text-too-long');
    });
  }
  it('begrenzt die Referenzstückbezeichnung auf 160 Zeichen', () => {
    assert.equal(
      validateLabelDraftInput({
        ...input(),
        images: [{ ...image(), referenceItem: 'x'.repeat(160) }],
      }).images[0]?.referenceItem.length,
      160,
    );
    rejects(
      { ...input(), images: [{ ...image(), referenceItem: 'x'.repeat(161) }] },
      'text-too-long',
    );
  });
  it('prüft die Gesamtgröße von Inhalt und Bildern gemeinsam', () => {
    const images = Array.from({ length: 24 }, (_, i) => ({
      ...image(i + 1, i),
      caption: '🧵'.repeat(4000),
    }));
    rejects({ ...input(), images }, 'payload-too-large');
  });
});

describe('Labelbilder – Sortieren ohne Veränderung des Ausgangsstands', () => {
  it('wählt mit neuer Reihenfolge ein neues Titelbild, ohne Eingabedaten zu verändern', () => {
    const images = [image(10, 0), image(20, 1), image(30, 2)];
    const before = structuredClone(images);
    const result = reorderLabelImages(images, [30, 10, 20]);
    assert.deepEqual(
      result.map((entry) => entry.assetId),
      [30, 10, 20],
    );
    assert.deepEqual(
      result.map((entry) => entry.position),
      [0, 1, 2],
    );
    assert.deepEqual(images, before);
    assert.notEqual(result[0], images[2]);
  });
  it('bewahrt Beschreibung und Referenzstück beim Sortieren', () => {
    const images = [
      { ...image(10), caption: 'Rückseite', alt: 'Schrift', referenceItem: 'Stück A' },
      image(20, 1),
    ];
    assert.deepEqual(reorderLabelImages(images, [20, 10])[1], { ...images[0], position: 1 });
  });
  for (const order of [[1], [1, 1], [1, 3], [2, 1, 3], [2, 0]]) {
    it(`verweigert eine unvollständige oder fremde Reihenfolge ${order.join(',')}`, () => {
      assert.throws(
        () => reorderLabelImages([image(1, 0), image(2, 1)], order),
        LabelValidationError,
      );
    });
  }
  it('erlaubt eine leere Bildliste', () => assert.deepEqual(reorderLabelImages([], []), []));
  it('bewahrt den vorherigen Stand, wenn eine neue Reihenfolge ungültig ist', () => {
    const images = [image(1, 0), image(2, 1)];
    const before = structuredClone(images);
    assert.throws(() => reorderLabelImages(images, [99, 1]), LabelValidationError);
    assert.deepEqual(images, before);
  });
});

describe('Labelentwurf – exakte gemeinsame Nutzlastgrenze', () => {
  function sizedInput(bytes: number) {
    const value = {
      content: {
        ...createEmptyLabelContent(),
        features: Array.from({ length: 40 }, () => 'x'.repeat(4000)),
      },
      images: Array.from({ length: 13 }, (_, i) => ({
        ...image(i + 1, i),
        caption: 'x'.repeat(4000),
        alt: 'x'.repeat(4000),
      })),
    };
    const last = value.images[value.images.length - 1];
    assert.ok(last);
    last.alt = '';
    const length = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const missing = bytes - length;
    assert.ok(missing >= 0 && missing <= 4000, 'Testaufbau muss innerhalb der Feldgrenzen bleiben');
    last.alt = 'x'.repeat(missing);
    assert.equal(new TextEncoder().encode(JSON.stringify(value)).byteLength, bytes);
    return value;
  }
  it('akzeptiert genau 262144 gemeinsame UTF-8-Bytes', () =>
    assert.deepEqual(validateLabelDraftInput(sizedInput(262144)), sizedInput(262144)));
  it('verweigert genau 262145 gemeinsame UTF-8-Bytes', () =>
    rejects(sizedInput(262145), 'payload-too-large'));
});

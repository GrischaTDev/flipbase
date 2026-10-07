import { describe, expect, it } from 'vitest';
import { readerCard, readerDetail, readerPage } from '../test-support/label-reader.fixtures';
import { readLabelAvailability, readLabelDetail, readLabelPage } from './brand-label-reader';

describe('Antwortvertrag der Label-Leseransicht', () => {
  it('übernimmt Verfügbarkeit ohne redaktionelle Zusatzdaten', () => {
    expect(readLabelAvailability({ visible: false, operator: true })).toEqual({
      visible: false,
      operator: true,
    });
    expect(() => readLabelAvailability({ visible: 'false', operator: true })).toThrow();
    expect(() =>
      readLabelAvailability({ visible: true, operator: true, token: 'intern' }),
    ).toThrow();
  });
  it('rekonstruiert 24 Karten und behält die Katalogversion als Zeichenfolge', () => {
    const value = readerPage(24, '90071992547409930');
    const parsed = readLabelPage(value);
    expect(parsed).toEqual(value);
    expect(parsed.items).not.toBe(value.items);
    expect(parsed.items[0]).not.toBe(value.items[0]);
  });
  it('akzeptiert echte leere Ergebnisse ohne Beispieldaten', () => {
    expect(readLabelPage(readerPage(0))).toEqual({
      items: [],
      hasMore: false,
      catalogVersion: '7',
    });
  });
  it('weist übergroße Seiten, doppelte Kennungen und unplausible Folgeseiten ab', () => {
    expect(() => readLabelPage(readerPage(25))).toThrow();
    expect(() => readLabelPage({ ...readerPage(), items: [readerCard(), readerCard()] })).toThrow();
    expect(() => readLabelPage({ ...readerPage(), hasMore: true })).toThrow();
  });
  it('übernimmt keine unbestätigte Katalogversion oder fremde Zieladresse', () => {
    expect(() => readLabelPage({ ...readerPage(), catalogVersion: 7 })).toThrow();
    expect(() => readLabelPage({ ...readerPage(), catalogVersion: '-1' })).toThrow();
    expect(() =>
      readLabelPage({ ...readerPage(), items: [{ ...readerCard(), brandSlug: '../admin' }] }),
    ).toThrow();
  });
  it('weist interne Kartenfelder zurück', () => {
    expect(() =>
      readLabelPage({ ...readerPage(), items: [{ ...readerCard(), originalPath: 'private' }] }),
    ).toThrow();
  });
  it('liest veröffentlichte Detailangaben und öffentliche Bildzuordnung', () => {
    const value = readerDetail();
    const result = readLabelDetail(value);
    expect(result).toEqual(value);
    expect(result?.content).not.toBe(value.content);
    expect(result?.images).not.toBe(value.images);
  });
  it('behandelt nicht verfügbare Details neutral', () => {
    expect(readLabelDetail(null)).toBeNull();
  });
  it('weist widersprüchliche Titel, fehlendes Titelbild und vertauschte Bilder ab', () => {
    expect(() => readLabelDetail({ ...readerDetail(), title: 'Fremder Titel' })).toThrow();
    expect(() => readLabelDetail({ ...readerDetail(), images: [] })).toThrow();
    expect(() => readLabelDetail({ ...readerDetail(), coverAssetId: 5 })).toThrow();
  });
  it('übernimmt weder aktive Quellenlinks noch interne Bildfreigaben', () => {
    const value = readerDetail();
    expect(() =>
      readLabelDetail({ ...value, images: [{ ...value.images[0], permissionNote: 'intern' }] }),
    ).toThrow();
    expect(() =>
      readLabelDetail({
        ...value,
        content: {
          ...value.content,
          sources: [{ ...value.content.sources[0], url: 'javascript:alert(1)' }],
        },
      }),
    ).toThrow();
  });
});

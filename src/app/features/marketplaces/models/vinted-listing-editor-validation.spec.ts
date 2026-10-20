import { describe, expect, it } from 'vitest';
import { listingCategoryFixture } from '../../../../../e2e/support/vinted-listing-category-fixture';
import { emptyVintedListingContent } from './vinted-listing-content';
import {
  validateVintedListingEditor,
  vintedListingAccountIssue,
} from './vinted-listing-editor-validation';

const content = {
  ...emptyVintedListingContent(),
  title: 'Jacke',
  description: 'Gut erhalten.',
  priceCents: 1800,
  categoryId: 1223,
  sizeId: 208,
  sizeLabel: 'M',
  conditionId: 2,
  conditionLabel: 'Sehr gut',
  packageSizeId: 2,
};
const photo = { mimeType: 'image/jpeg', byteSize: 123 };
const account = {
  marketplace: 'vinted',
  workspaceId: 'workspace-a',
  executionMode: 'cloud',
  status: 'connected',
  externalAccountId: '123',
} as const;

describe('Frühe Vinted-Veröffentlichungsprüfung', () => {
  it('benennt fehlende Mindestangaben ohne einen Anbieterabruf zu benötigen', () => {
    expect(
      Object.keys(validateVintedListingEditor(emptyVintedListingContent(), [], null)).sort(),
    ).toEqual(['category', 'description', 'photos', 'price', 'title']);
    expect(validateVintedListingEditor(content, [photo], null)).toEqual({});
  });
  it.each([0, -1])('weist den Preis %s vor der Veröffentlichung zurück', (priceCents) => {
    expect(
      validateVintedListingEditor({ ...content, priceCents }, [photo], null)['price'],
    ).toContain('größer als 0');
  });
  it('erlaubt genau 20 Fotos und meldet größere bestehende Entwürfe', () => {
    expect(validateVintedListingEditor(content, Array(20).fill(photo), null)).toEqual({});
    expect(validateVintedListingEditor(content, Array(21).fill(photo), null)['photos']).toContain(
      '20',
    );
  });
  it('verwendet die tatsächlich gelesenen Textgrenzen einschließlich ihrer Randwerte', () => {
    const schema = { ...listingCategoryFixture(), titleMaxLength: 5, descriptionMaxLength: 13 };
    expect(validateVintedListingEditor(content, [photo], schema)).toEqual({});
    expect(
      validateVintedListingEditor(
        { ...content, title: 'Jacken', description: 'Gut erhalten!!' },
        [photo],
        schema,
      ),
    ).toMatchObject({ title: expect.any(String), description: expect.any(String) });
    expect(
      validateVintedListingEditor({ ...content, title: 'Jacken' }, [photo], schema)['title'],
    ).toContain('5 Zeichen');
    expect(validateVintedListingEditor({ ...content, title: 'Jacken' }, [photo], null)).toEqual({});
  });
  it('meldet unbekannte Zusatzfelder und nicht mehr verfügbare Auswahlwerte', () => {
    const schema = { ...listingCategoryFixture(), unknownFields: ['isbn'] };
    expect(validateVintedListingEditor({ ...content, sizeId: 999 }, [photo], schema)).toMatchObject(
      {
        isbn: expect.stringContaining('nicht unterstützt'),
        size: expect.stringContaining('erneut'),
      },
    );
  });
  it('weist eine geänderte Bilddatei mit nicht akzeptiertem Format zurück', () => {
    expect(
      validateVintedListingEditor(
        content,
        [{ mimeType: 'image/webp', byteSize: 99 }],
        listingCategoryFixture(),
      )['photos'],
    ).toBeTruthy();
  });
  it('überlässt die erneute Markensuche der Veröffentlichungsvorschau statt eine gültige Kennung durch eine kurze Auswahlliste zu sperren', () => {
    const schema = listingCategoryFixture();
    const fields = [
      ...schema.fields,
      {
        field: 'brand' as const,
        sizeGroupId: null,
        choices: [
          { id: 999, label: 'No Brand', disabled: false, selected: false, sizeGroupId: null },
        ],
      },
    ];
    expect(
      validateVintedListingEditor({ ...content, brandId: 254956, brandLabel: 'Jako' }, [photo], {
        ...schema,
        fields,
      }),
    ).toEqual({});
  });
  it('meldet nicht aufgelöste Platzhalter bereits ohne Kategorieantwort', () => {
    expect(
      validateVintedListingEditor({ ...content, title: '{brand} Jacke' }, [photo], null)['title'],
    ).toContain('Platzhalter');
  });
  it('erlaubt ein bestätigtes Konto und unterscheidet es von einer fehlenden Auswahl', () => {
    expect(vintedListingAccountIssue(account, 'workspace-a')).toBeNull();
    expect(vintedListingAccountIssue(undefined, 'workspace-a')).toContain('Zielkonto');
  });
  it.each([
    [{ executionMode: 'local' }, 'Cloudkonto'],
    [{ status: 'paused' }, 'pausiert'],
    [{ status: 'needs_login' }, 'erneut an'],
    [{ status: 'disconnected' }, 'erneut an'],
    [{ status: 'blocked' }, 'gesperrt'],
    [{ externalAccountId: null }, 'Kontoidentität'],
    [{ workspaceId: 'foreign' }, 'Arbeitsbereich'],
    [{ marketplace: 'ebay' }, 'Vinted-Konto'],
  ] as const)('erklärt die Kontovoraussetzung %j', (patch, message) => {
    expect(vintedListingAccountIssue({ ...account, ...patch }, 'workspace-a')).toContain(message);
  });
});

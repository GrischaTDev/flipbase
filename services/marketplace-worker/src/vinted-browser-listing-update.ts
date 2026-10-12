import { setTimeout as wait } from 'node:timers/promises';
import type { Page } from 'playwright';
import type {
  VintedListingChoiceField,
  VintedListingContent,
  VintedListingCurrentContent,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import type { VintedEditResult } from './vinted-browser-listing-edit.ts';
import { readOpenVintedListingContent } from './vinted-browser-listing-content.ts';
import { selectVintedListingField } from './vinted-browser-listing-fields.ts';
import { confirmVintedEdit } from './vinted-edit-confirmation.ts';
import {
  arrangeVintedListingPhotos,
  sameVintedListingPhotos,
  type VintedListingPhotoArrangement,
} from './vinted-browser-listing-photo-order.ts';
import { validateVintedListingSubmission } from './vinted-listing-contracts.ts';
import type { VintedListingReadStep } from './vinted-listing-read-error.ts';

function invalid(): Error {
  return new Error('Die Änderungen konnten nicht sicher in das Vinted-Inserat übernommen werden.');
}

/**
 * Abschnitte des Speicherns. Bei einem Abbruch steht nur diese feste Bezeichnung im Protokoll,
 * nie Inhalte, Kennungen oder Anbieterantworten. Bis einschließlich „gegenlesen“ wurde bei
 * Vinted nichts gespeichert.
 */
export const vintedListingUpdateSteps = {
  authorize: 'berechtigung',
  open: 'öffnen',
  read: 'lesen',
  check: 'prüfen',
  photoRemove: 'fotos entfernen',
  photoMove: 'fotos verschieben',
  text: 'texte eintragen',
  fields: 'merkmale wählen',
  verify: 'gegenlesen',
  save: 'speichern',
  confirm: 'bestätigen',
} as const;
export type VintedListingUpdateStep = keyof typeof vintedListingUpdateSteps;

/** Feste Meldung eines Abbruchs; besteht nur aus gewöhnlichen Wörtern und übersteht so den Transport. */
export function vintedListingUpdateFailure(
  step: VintedListingUpdateStep,
  /** Feste Zusatzangabe, etwa der Schritt des Lesens oder was beim Gegenlesen abwich. */
  detail?: VintedListingReadStep | 'inhalt' | 'fotos' | 'knopf',
): Error {
  return new Error(
    'Speichern abgebrochen bei ' + vintedListingUpdateSteps[step] + (detail ? ' ' + detail : ''),
  );
}

/** Gewünschte Auswahl je Merkmal; ein nie gewähltes Merkmal bleibt leer statt „Keine Marke“. */
function wanted(
  content: VintedListingContent,
  field: VintedListingChoiceField,
): readonly (number | null)[] {
  switch (field) {
    case 'brand':
      return content.brandId === null && !content.brandLabel ? [] : [content.brandId];
    case 'size':
      return content.sizeId === null ? [] : [content.sizeId];
    case 'condition':
      return content.conditionId === null ? [] : [content.conditionId];
    case 'package':
      return content.packageSizeId === null ? [] : [content.packageSizeId];
    case 'color':
      return content.colorIds;
    case 'material':
      return content.materialIds;
    default:
      throw invalid();
  }
}
const choiceFields = ['brand', 'size', 'condition', 'package', 'color', 'material'] as const;

function sameChoice(
  left: VintedListingContent,
  right: VintedListingContent,
  field: VintedListingChoiceField,
): boolean {
  const a = wanted(left, field),
    b = wanted(right, field);
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Vergleicht nur, was Vinted speichert; die Reihenfolge von Farben und Materialien ist unerheblich. */
function sameContent(left: VintedListingContent, right: VintedListingContent): boolean {
  return (
    left.title === right.title &&
    left.description === right.description &&
    left.priceCents === right.priceCents &&
    left.categoryId === right.categoryId &&
    choiceFields.every((field) => sameChoice(left, right, field))
  );
}

/**
 * Ändert ein bestehendes Inserat ausschließlich auf einer neu reservierten Seite. Kategorie
 * und unbekannte Zusatzfelder bleiben unberührt. Fotos können entfernt und umsortiert, aber
 * nicht hinzugefügt werden. Gespeichert wird genau einmal; als bestätigt gilt nur, was ein
 * erneuter Abruf der Maske zeigt.
 */
export async function updateVintedListingContent(
  page: Page,
  accountId: string,
  externalId: string,
  /** Stand, auf dem die Änderung beruht. Weicht Vinted davon ab, wird nichts geschrieben. */
  base: VintedListingContent,
  desired: VintedListingContent,
  authorizeChange: () => Promise<void>,
  confirmationTimeoutMs = 20_000,
  /** Fehlt die Angabe, bleiben die Fotos unverändert. */
  photos?: VintedListingPhotoArrangement,
): Promise<VintedEditResult> {
  if (
    typeof accountId !== 'string' ||
    typeof externalId !== 'string' ||
    !/^[1-9][0-9]{0,31}$/.test(accountId) ||
    !/^[1-9][0-9]{0,31}$/.test(externalId)
  )
    throw invalid();
  // Eine Seite mit Benutzerarbeit wird weder verwendet noch geschlossen.
  if (page.url() !== 'about:blank') throw new Error('Die Inseratseite ist nicht neu reserviert.');
  let authorizationFailed = false;
  const authorize = async () => {
    try {
      await authorizeChange();
    } catch (error) {
      authorizationFailed = true;
      throw error;
    }
  };
  const target = 'https://www.vinted.de/items/' + externalId + '/edit';
  const open = async () => {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page
      .locator('#content input[name="title"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
  };
  const identify = async () => {
    if (page.url() !== target || (await readVintedAccountIdentity(page))?.id !== accountId)
      throw invalid();
  };
  const check = async () => {
    await authorize();
    await identify();
    await authorize();
  };
  const samePhotos = (
    left: VintedListingCurrentContent,
    expected: readonly string[],
    aiPhoto: VintedListingCurrentContent['aiPhoto'],
  ) => sameVintedListingPhotos(left.photoUrls, expected) && left.aiPhoto === aiPhoto;
  let step: VintedListingUpdateStep = 'open';
  let detail: Parameters<typeof vintedListingUpdateFailure>[1];
  try {
    await authorize();
    await open();
    await check();
    step = 'read';
    const current = await readOpenVintedListingContent(page, accountId, externalId, check);
    step = 'check';
    if (!sameContent(current.content, base)) return 'conflict';
    // Fotos, die inzwischen bei Vinted geändert wurden, werden nicht überschrieben.
    if (photos && !sameVintedListingPhotos(current.photoUrls, photos.base)) return 'conflict';
    const desiredPhotos = photos?.desired ?? current.photoUrls;
    const photosChanged = !sameVintedListingPhotos(current.photoUrls, desiredPhotos);
    if (
      desired.categoryId !== current.content.categoryId ||
      desired.categoryLabel !== current.content.categoryLabel ||
      current.bump
    )
      throw invalid();
    const changed = new Set<string>(
      choiceFields.filter((field) => !sameChoice(current.content, desired, field)),
    );
    if (desired.title !== current.content.title) changed.add('title');
    if (desired.description !== current.content.description) changed.add('description');
    if (desired.priceCents !== current.content.priceCents) changed.add('price');
    // Die verbleibenden Fotos hat Vinted bereits angenommen; die Prüfung braucht nur ihre Anzahl.
    const acceptedPhotos = desiredPhotos.map(() => ({
      mimeType: current.schema.acceptedPhotoMimeTypes[0] ?? '',
      byteSize: 1,
    }));
    const fatal = ['form', 'bump', 'attributes', 'currency', 'category'];
    // Unveränderte Angaben und unbekannte Zusatzfelder hat Vinted schon akzeptiert; geprüft wird die Änderung.
    if (
      validateVintedListingSubmission(desired, acceptedPhotos, current.schema).some(
        (issue) => fatal.includes(issue.field) || changed.has(issue.field),
      )
    )
      throw invalid();
    if (changed.size === 0 && !photosChanged) return 'confirmed';
    if (photosChanged)
      await arrangeVintedListingPhotos(page, current.photoUrls, desiredPhotos, check, (next) => {
        step = next === 'remove' ? 'photoRemove' : 'photoMove';
      });
    step = 'text';
    for (const [name, selector, value] of [
      ['title', 'input[name="title"]', desired.title],
      ['description', 'textarea[name="description"]', desired.description],
      [
        'price',
        'input[name="price"]',
        Math.floor(desired.priceCents! / 100) +
          ',' +
          String(desired.priceCents! % 100).padStart(2, '0'),
      ],
    ] as const) {
      if (!changed.has(name)) continue;
      await check();
      const input = page.locator('#content ' + selector);
      await input.fill(value);
      // Das Feld verlassen, damit die Maske ihren Wert sofort in ihr eigenes Format bringt (etwa
      // den Preis). Sonst ändert er sich erst während des Gegenlesens und gilt dort als fremde
      // Änderung der Maske.
      await input.blur();
    }
    if (changed.has('title') || changed.has('description') || changed.has('price')) await wait(200);
    step = 'fields';
    for (const field of current.schema.fields)
      if (changed.has(field.field))
        await selectVintedListingField(page, field, wanted(desired, field.field), check);
    await check();
    step = 'verify';
    const prepared = await readOpenVintedListingContent(
      page,
      accountId,
      externalId,
      check,
      (next) => {
        detail = next;
      },
    );
    detail = 'inhalt';
    if (!sameContent(prepared.content, desired)) throw invalid();
    detail = 'fotos';
    if (!samePhotos(prepared, desiredPhotos, current.aiPhoto)) throw invalid();
    detail = 'knopf';
    const save = page.locator('#content').getByRole('button', { name: 'Speichern', exact: true });
    if ((await save.count()) !== 1 || !(await save.isVisible()) || !(await save.isEnabled()))
      throw invalid();
    detail = undefined;
    await check();
    step = 'save';
    try {
      await save.click({ timeout: 10_000 });
    } catch {
      // Der Klick kann bereits gespeichert haben; ein automatischer Wiederholungsversuch wäre unsicher.
      return 'unconfirmed';
    }
    step = 'confirm';
    // Der Beleg bleibt auch nach einem späteren Widerruf lesbar; er löst keine weitere Aktion aus.
    return await confirmVintedEdit(
      async () => {
        await open();
        return readOpenVintedListingContent(page, accountId, externalId, identify);
      },
      (saved) =>
        sameContent(saved.content, desired) && samePhotos(saved, desiredPhotos, current.aiPhoto),
      confirmationTimeoutMs,
    );
  } catch {
    throw authorizationFailed
      ? vintedListingUpdateFailure('authorize')
      : vintedListingUpdateFailure(step, step === 'verify' ? detail : undefined);
  } finally {
    await page.close();
  }
}

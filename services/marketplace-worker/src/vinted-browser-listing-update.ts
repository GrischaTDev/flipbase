import { setTimeout as wait } from 'node:timers/promises';
import type { Page } from 'playwright';
import type {
  VintedListingChoiceField,
  VintedListingContent,
  VintedListingCurrentContent,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import type { VintedEditResult } from './vinted-browser-listing-edit.ts';
import {
  parseVintedListingPriceCents,
  readLoadedVintedListingPhotos,
  readOpenVintedListingContent,
} from './vinted-browser-listing-content.ts';
import {
  mapVintedListingPhotoIds,
  readVintedListingItem,
  type VintedListingItem,
} from './vinted-browser-listing-item.ts';
import { selectVintedListingField } from './vinted-browser-listing-fields.ts';
import { confirmVintedEdit } from './vinted-edit-confirmation.ts';
import {
  arrangeVintedListingPhotos,
  sameVintedListingPhotos,
  type VintedListingPhotoArrangement,
} from './vinted-browser-listing-photo-order.ts';
import {
  collectVintedListingFormMetadata,
  collectVintedListingFormValues,
  validateVintedListingSubmission,
} from './vinted-listing-contracts.ts';
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

/**
 * Ob eine Abbruchmeldung einen Abschnitt vor dem Speichern nennt. Nur dann steht fest, dass bei
 * Vinted nichts geändert wurde; jede andere Meldung lässt das offen.
 */
export function vintedListingUpdateStoppedBeforeSaving(detail: string): boolean {
  const prefix = 'Error: Speichern abgebrochen bei ';
  if (!detail.startsWith(prefix)) return false;
  const section = detail.slice(prefix.length);
  return (Object.keys(vintedListingUpdateSteps) as VintedListingUpdateStep[]).some(
    (step) =>
      step !== 'save' &&
      step !== 'confirm' &&
      (section === vintedListingUpdateSteps[step] ||
        section.startsWith(vintedListingUpdateSteps[step] + ' ')),
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
 * nicht hinzugefügt werden. Gespeichert wird genau einmal; als bestätigt gilt nur, was Vinted
 * danach als gespeicherten Stand zeigt.
 *
 * Ändern sich nur Titel, Beschreibung, Preis oder Fotos, kommt die Aktion ohne das Aufklappen der
 * Auswahllisten aus: Ausgangsstand und Bestätigung stammen dann aus Vinteds eigener Abfrage des
 * Inserats. Passt dort etwas nicht eindeutig, entscheidet wie bisher das Lesen der Maske.
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
  const fatal = ['form', 'bump', 'attributes', 'currency', 'category'];
  const trackPhotoStep = (next: 'remove' | 'move') => {
    step = next === 'remove' ? 'photoRemove' : 'photoMove';
  };
  const fillTexts = async (changed: ReadonlySet<string>) => {
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
  };
  const enabledSaveButton = async () => {
    const save = page.locator('#content').getByRole('button', { name: 'Speichern', exact: true });
    if ((await save.count()) !== 1 || !(await save.isVisible()) || !(await save.isEnabled()))
      throw invalid();
    return save;
  };
  const confirmByForm = (desiredPhotos: readonly string[], aiPhoto: boolean) =>
    // Der Beleg bleibt auch nach einem späteren Widerruf lesbar; er löst keine weitere Aktion aus.
    confirmVintedEdit(
      async () => {
        await open();
        return readOpenVintedListingContent(page, accountId, externalId, identify);
      },
      (saved) => sameContent(saved.content, desired) && samePhotos(saved, desiredPhotos, aiPhoto),
      confirmationTimeoutMs,
    );
  /** Eingabefelder und Fotoraster, ohne eine Auswahlliste zu öffnen. */
  const readFormState = async () => {
    try {
      const values = await page.evaluate(collectVintedListingFormValues);
      const grid = await readLoadedVintedListingPhotos(page);
      if (!values || grid.items.some((entry) => entry.url === null)) return null;
      return {
        values,
        priceCents: parseVintedListingPriceCents(values.price),
        photoUrls: grid.items.map((entry) => entry.url as string),
      };
    } catch {
      return null;
    }
  };
  /** Der gespeicherte Stand in der Form des Ausgangsstands; verglichen werden Texte und Kennungen. */
  const itemContent = (item: VintedListingItem): VintedListingContent => ({
    ...base,
    title: item.title,
    description: item.description,
    priceCents: item.priceCents,
    categoryId: item.categoryId,
    brandId: item.brandId,
    // Die Abfrage nennt die Marke nur als Kennung; eine frei eingetragene bleibt die des Ausgangsstands.
    brandLabel: item.brandId === null && base.brandId !== null ? '' : base.brandLabel,
    sizeId: item.sizeId,
    conditionId: item.conditionId,
    colorIds: [...item.colorIds],
    materialIds: [...item.materialIds],
    packageSizeId: item.packageSizeId,
  });
  /**
   * Speichert Änderungen an Titel, Beschreibung, Preis und Fotos ohne geöffnete Auswahlliste.
   * `null` heißt: nicht anwendbar oder nicht eindeutig – dann wurde die Maske noch nicht verändert
   * und der vollständige Weg über die Maske übernimmt.
   */
  const saveWithoutChoiceLists = async (): Promise<VintedEditResult | null> => {
    if (
      desired.categoryId !== base.categoryId ||
      desired.categoryLabel !== base.categoryLabel ||
      !choiceFields.every((field) => sameChoice(base, desired, field))
    )
      return null;
    const form = await readFormState();
    const item = await readVintedListingItem(page, externalId);
    if (
      !form ||
      !item ||
      form.values.bump ||
      form.values.title !== base.title ||
      form.values.description !== base.description ||
      form.priceCents !== base.priceCents ||
      !sameContent(itemContent(item), base) ||
      (photos && !sameVintedListingPhotos(form.photoUrls, photos.base))
    )
      return null;
    const desiredPhotos = photos?.desired ?? form.photoUrls;
    const photosChanged = !sameVintedListingPhotos(form.photoUrls, desiredPhotos);
    const photoIds = mapVintedListingPhotoIds(form.photoUrls, item.photos);
    if (photosChanged && !photoIds) return null;
    const changed = new Set<string>();
    if (desired.title !== base.title) changed.add('title');
    if (desired.description !== base.description) changed.add('description');
    if (desired.priceCents !== base.priceCents) changed.add('price');
    let rules: Awaited<ReturnType<typeof collectVintedListingFormMetadata>>;
    try {
      rules = await page.evaluate(collectVintedListingFormMetadata);
    } catch {
      return null;
    }
    if (
      validateVintedListingSubmission(
        desired,
        desiredPhotos.map(() => ({ mimeType: rules.acceptedPhotoMimeTypes[0] ?? '', byteSize: 1 })),
        { ...rules, categoryId: item.categoryId, fields: [] },
      ).some((issue) => fatal.includes(issue.field) || changed.has(issue.field))
    )
      return null;
    if (changed.size === 0 && !photosChanged) return 'confirmed';
    // Ab hier wird die Maske verändert; ein Abbruch endet ohne Speichern.
    step = 'check';
    await check();
    if (photosChanged)
      await arrangeVintedListingPhotos(page, form.photoUrls, desiredPhotos, check, trackPhotoStep);
    step = 'text';
    await fillTexts(changed);
    await check();
    step = 'verify';
    for (const deadline = Date.now() + 3_000; ;) {
      const prepared = await readFormState();
      const contentMatches =
        prepared !== null &&
        prepared.values.title === desired.title &&
        prepared.values.description === desired.description &&
        prepared.priceCents === desired.priceCents &&
        prepared.values.ai_photo === form.values.ai_photo &&
        !prepared.values.bump;
      if (contentMatches && sameVintedListingPhotos(prepared.photoUrls, desiredPhotos)) break;
      if (Date.now() >= deadline) {
        detail = contentMatches ? 'fotos' : 'inhalt';
        throw invalid();
      }
      await wait(150);
    }
    detail = 'knopf';
    const save = await enabledSaveButton();
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
    const expectedPhotoIds = photoIds ? desiredPhotos.map((url) => photoIds.get(url)) : null;
    const deadline = Date.now() + Math.min(confirmationTimeoutMs, 12_000);
    do {
      try {
        const saved =
          (await readVintedAccountIdentity(page))?.id === accountId
            ? await readVintedListingItem(page, externalId)
            : null;
        if (
          saved &&
          sameContent(itemContent(saved), desired) &&
          saved.photos.length === desiredPhotos.length &&
          (!expectedPhotoIds ||
            saved.photos.every((photo, index) => photo.id === expectedPhotoIds[index]))
        )
          return 'confirmed';
      } catch {
        // Nach dem Speichern lädt die Seite noch; ein Lesefehler ist kein Beleg für eine Ablehnung.
      }
      await wait(700);
    } while (Date.now() < deadline);
    // Zeigt die Abfrage den neuen Stand nicht, entscheidet wie bisher die Maske.
    return await confirmByForm(desiredPhotos, form.values.ai_photo);
  };
  try {
    await authorize();
    await open();
    await check();
    step = 'read';
    const quick = await saveWithoutChoiceLists();
    if (quick) return quick;
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
    // Unveränderte Angaben und unbekannte Zusatzfelder hat Vinted schon akzeptiert; geprüft wird die Änderung.
    if (
      validateVintedListingSubmission(desired, acceptedPhotos, current.schema).some(
        (issue) => fatal.includes(issue.field) || changed.has(issue.field),
      )
    )
      throw invalid();
    if (changed.size === 0 && !photosChanged) return 'confirmed';
    if (photosChanged)
      await arrangeVintedListingPhotos(
        page,
        current.photoUrls,
        desiredPhotos,
        check,
        trackPhotoStep,
      );
    step = 'text';
    await fillTexts(changed);
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
    const save = await enabledSaveButton();
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
    return await confirmByForm(desiredPhotos, current.aiPhoto);
  } catch {
    throw authorizationFailed
      ? vintedListingUpdateFailure('authorize')
      : vintedListingUpdateFailure(step, step === 'verify' ? detail : undefined);
  } finally {
    await page.close();
  }
}

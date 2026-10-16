import {
  parseKleinanzeigenProviderSchema,
  type KleinanzeigenProviderSchema,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
import type { KleinanzeigenDraftInput } from './kleinanzeigen-transfer-mapping';
export { parseKleinanzeigenProviderSchema };
export interface KleinanzeigenPublicationIssue {
  readonly field: string;
  readonly message: string;
}
/** Zusätzliche Prüfungen für den automatischen Weg; Anbieterfelder bleiben unverändert beschrieben. */
export function validateKleinanzeigenPublication(
  content: KleinanzeigenDraftInput,
  schemaInput: unknown,
  photoCount: number,
): KleinanzeigenPublicationIssue[] {
  const issues: KleinanzeigenPublicationIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  const schema: KleinanzeigenProviderSchema | null = parseKleinanzeigenProviderSchema(schemaInput);
  if (!schema) {
    add('categoryId', 'Lade die aktuellen Kleinanzeigen-Felder erneut.');
    return issues;
  }
  if (
    content.categoryId !== schema.categoryPath ||
    !content.schemaRevision ||
    !/^[a-f0-9]{64}$/u.test(content.schemaRevision)
  )
    add('categoryId', 'Wähle die Kategorie erneut und prüfe ihre Felder.');
  if (!content.title.trim() || content.title.length > schema.titleMax)
    add('title', 'Der Titel muss 1 bis 65 Zeichen enthalten.');
  if (!content.description.trim() || content.description.length > schema.descriptionMax)
    add('description', 'Die Beschreibung muss 1 bis 4.000 Zeichen enthalten.');
  if (
    content.currency !== 'EUR' ||
    content.priceCents === null ||
    !Number.isSafeInteger(content.priceCents) ||
    content.priceCents < 0 ||
    content.priceCents % schema.priceStepCents !== 0 ||
    content.priceCents > 9999999900
  )
    add(
      'priceCents',
      'Kleinanzeigen erwartet hier einen Preis in ganzen Euro. Bitte prüfe Deinen Preis.',
    );
  if (!content.postalCode || !/^\d{5}$/u.test(content.postalCode))
    add('postalCode', 'Trage eine fünfstellige Postleitzahl ein.');
  if (!Number.isSafeInteger(photoCount) || photoCount < 1 || photoCount > schema.photoCountMax)
    add('images', 'Für die Übertragung brauchst Du 1 bis 20 vollständig gesicherte Bilder.');
  const allowed = new Set(schema.fields.map((field) => field.key));
  for (const field of schema.fields) {
    const value = content.categoryFields[field.key] ?? '';
    // Der automatische Weg verlangt eine bewusste Zustandswahl, auch wenn das Anbieterfeld optional ist.
    if (!value.trim() && (field.required || field.key.endsWith('.condition')))
      add(field.key, 'Bitte prüfe und wähle ' + field.label + '.');
    else if (
      value &&
      ((field.kind === 'select' && !field.choices.some((choice) => choice.value === value)) ||
        value.length > 200)
    )
      add(field.key, 'Wähle einen aktuell angebotenen Wert für ' + field.label + '.');
  }
  allowed.add('ad-shipping-package-size');
  allowed.add('ad-shipping-options');
  if (Object.keys(content.categoryFields).some((key) => !allowed.has(key)))
    add('categoryFields', 'Die Kategorie enthält nicht mehr passende Eigenschaften.');
  if (content.shippingPriceCents !== null)
    add(
      'shippingPriceCents',
      'Wähle die angebotenen Versandmethoden. Zusätzliche Versandkosten werden hier nicht geschätzt.',
    );
  if (content.shippingType === 'shipping')
    add('shippingType', 'Wähle Abholung oder Versand mit Abholung.');
  if (content.shippingType === 'both') {
    const group = schema.shipping.groups.find(
      (candidate) => candidate.value === content.categoryFields['ad-shipping-package-size'],
    );
    let methods: unknown;
    try {
      methods = JSON.parse(content.categoryFields['ad-shipping-options'] ?? 'null');
    } catch {
      methods = null;
    }
    if (
      !group ||
      !Array.isArray(methods) ||
      !methods.length ||
      methods.length > 20 ||
      new Set(methods).size !== methods.length ||
      !methods.every(
        (method) =>
          typeof method === 'string' && group.choices.some((choice) => choice.value === method),
      )
    )
      add('shippingType', 'Wähle mindestens eine aktuell angebotene Versandmethode.');
  }
  return issues;
}

/** Gleiche Zielfassung unabhängig von JSON-Schlüsselreihenfolge und den gespeicherten Randabständen. */
export function kleinanzeigenContentKey(content: KleinanzeigenDraftInput): string {
  return JSON.stringify([
    content.title.trim(),
    content.description,
    content.priceCents,
    content.currency,
    content.priceType,
    content.shippingType,
    content.shippingPriceCents,
    content.postalCode?.trim() || null,
    content.categoryId,
    Object.entries(content.categoryFields).sort(([a], [b]) => a.localeCompare(b)),
    content.schemaRevision,
  ]);
}

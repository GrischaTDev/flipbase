import { z } from 'zod';

const MoneySchema = z.object({
  amount: z.union([z.string(), z.number()]),
  currency_code: z.string(),
});

/**
 * Bewusst nur die Felder, die wir wirklich verwenden. Unbekannte Felder laesst
 * Zod fallen; ein neues Vinted-Feld darf den Dienst nicht anhalten.
 *
 * Der `user`-Block war frueher absichtlich nicht beschrieben. Am 02.09.2026
 * wurde entschieden, Name und Profilbild aufzunehmen - die Herkunft eines
 * Angebots entscheidet mit, ob es taugt. Beschrieben sind deshalb genau diese
 * zwei Felder: `id` und `profile_url` bleiben draussen, damit sie gar nicht
 * erst weiterverarbeitet werden koennen.
 *
 * Bewertung und Bewertungszahl liefert der Katalog nicht - die stehen nur auf
 * der Detailseite eines Artikels. Sie zu holen lohnt erst fuer Treffer, die
 * einen Filter ueberstanden haben, und gehoert damit in Etappe 2.
 */
export const VintedItemSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  url: z.string().url(),
  total_item_price: MoneySchema,
  price: MoneySchema.optional(),
  brand_title: z.string().nullish(),
  size_title: z.string().nullish(),
  status: z.string().nullish(),
  /** Vinted zeigt Artikel im Katalog, bevor sie kaufbar sind. */
  is_visible: z.boolean().nullish(),
  user: z
    .object({
      login: z.string().nullish(),
      photo: z.object({ url: z.string().nullish() }).nullish(),
    })
    .nullish(),
  photos: z
    .array(
      z.object({
        url: z.string().nullish(),
        is_main: z.boolean().nullish(),
      }),
    )
    .nullish(),
  photo: z
    .object({
      url: z.string().nullish(),
      high_resolution: z.object({ timestamp: z.number().nullish() }).nullish(),
    })
    .nullish(),
});

export const VintedCatalogSchema = z.object({
  items: z.array(VintedItemSchema),
});

export type VintedItem = z.infer<typeof VintedItemSchema>;

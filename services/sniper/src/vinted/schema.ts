import { z } from 'zod';

const MoneySchema = z.object({
  amount: z.union([z.string(), z.number()]),
  currency_code: z.string(),
});

/**
 * Bewusst nur die Felder, die wir wirklich verwenden. Unbekannte Felder laesst
 * Zod fallen; ein neues Vinted-Feld darf den Dienst nicht anhalten. Der
 * `user`-Block wird absichtlich nicht beschrieben - was nicht im Schema steht,
 * kann auch nicht versehentlich weiterverarbeitet werden.
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

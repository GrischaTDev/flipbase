import type { Locator } from 'playwright';

/** Vinted rendert beim Fokussieren zuerst den bisherigen Preis im Eingabeformat neu. */
export async function fillVintedListingPrice(input: Locator, price: string): Promise<void> {
  // Erst den Fokuswechsel abschließen, damit dessen Darstellung die neue Eingabe nicht ersetzt.
  await input.click();
  await input.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await input.fill(price);
  await input.blur();
}

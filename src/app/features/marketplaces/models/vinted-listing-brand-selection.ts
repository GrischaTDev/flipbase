import type { VintedListingContent } from './vinted-listing-content';

export type VintedListingBrandSelection = Pick<VintedListingContent, 'brandId' | 'brandLabel'>;

export function validVintedListingBrand(selection: VintedListingBrandSelection): boolean {
  return (
    typeof selection.brandLabel === 'string' &&
    selection.brandLabel.length > 0 &&
    selection.brandLabel.length <= 2000 &&
    selection.brandLabel === selection.brandLabel.trim() &&
    ![...selection.brandLabel].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    }) &&
    (selection.brandId === null
      ? selection.brandLabel === 'Keine Marke'
      : Number.isSafeInteger(selection.brandId) && selection.brandId > 0)
  );
}

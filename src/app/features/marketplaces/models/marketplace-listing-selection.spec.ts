import { describe, expect, it } from 'vitest';
import { selectVisibleListings, toggleListingSelection } from './marketplace-listing-selection';
import type { MarketplaceListingReference } from './marketplace-overview.models';
const first: MarketplaceListingReference = {
  platform: 'vinted',
  workspaceId: 'a',
  connectionId: '1',
  externalId: '7',
};
const second = { ...first, connectionId: '2' };
describe('Sichtbare Inseratauswahl', () => {
  it('trennt dieselbe externe ID auf zwei Accounts', () => {
    const selected = toggleListingSelection([first], second, true, [first, second]);
    expect(selected).toEqual([first, second]);
  });
  it('nimmt keine versteckten oder fremden Inserate auf', () => {
    expect(toggleListingSelection([], second, true, [first])).toEqual([]);
    expect(selectVisibleListings([first], true)).toEqual([first]);
    expect(selectVisibleListings([first], false)).toEqual([]);
  });
  it('entfernt nicht mehr sichtbare Einträge und vermeidet doppelte Auswahl', () => {
    expect(toggleListingSelection([first, second], first, true, [first])).toEqual([first]);
    expect(toggleListingSelection([first], first, false, [first])).toEqual([]);
  });
});

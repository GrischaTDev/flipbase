import { expect, it } from 'vitest';
import { isVisibleVintedAccountAction, vintedAccountActionKinds } from './vinted-account-action';

it('zeigt nur Hauptaktionen und keine zugehörigen Lese- oder Nachprüfschritte', () => {
  expect(vintedAccountActionKinds.filter(isVisibleVintedAccountAction)).toEqual([
    'price_save',
    'listing_delete',
    'shipping_label_request',
    'profile_details_save',
    'profile_edit_save',
    'listing_edit_save',
    'listing_content_save',
    'listing_edit_intent',
    'cloud_setup_open',
    'cloud_session_open',
  ]);
});

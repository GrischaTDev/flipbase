import type { Page } from 'playwright';
import type { BrowserInfo, BrowserConnection } from './gologin-cloud-browser.ts';
import { readVintedAccountImport } from './vinted-account-import.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import { submitVintedLogin } from './vinted-browser-login.ts';
import { submitVintedVerificationCode } from './vinted-browser-verification.ts';
import { readVintedListingEdit, updateVintedListing } from './vinted-browser-listing-edit.ts';
import { readVintedProfileAbout, updateVintedProfileAbout } from './vinted-browser-profile-edit.ts';

export function currentVintedPage(connection: BrowserConnection): Page {
  const page = connection
    .contexts?.()
    .flatMap((context) => context.pages())
    .at(-1);
  if (!page) throw new Error('Browserseite fehlt');
  return page;
}

export function vintedBrowserActions(connection: BrowserConnection): BrowserInfo {
  const currentPage = () => currentVintedPage(connection);
  return {
    version: () => connection.version(),
    capture: () =>
      currentPage().screenshot({
        type: 'jpeg',
        quality: 65,
        scale: 'css',
        animations: 'disabled',
        timeout: 5_000,
      }),
    click: async (xRatio, yRatio) => {
      const page = currentPage();
      const size =
        page.viewportSize() ??
        (await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })));
      if (size.width <= 0 || size.height <= 0) throw new Error('Browserfenster fehlt');
      await page.mouse.click(Math.floor(xRatio * size.width), Math.floor(yRatio * size.height));
    },
    type: async (value) => currentPage().keyboard.insertText(value),
    press: async (key) => currentPage().keyboard.press(key),
    identify: () => readVintedAccountIdentity(currentPage()),
    importAccount: (authorize, onStage, previousConversations) =>
      readVintedAccountImport(currentPage(), authorize, onStage, previousConversations),
    login: (credentials, authorize) => submitVintedLogin(currentPage(), credentials, authorize),
    verify: (code, authorize) => submitVintedVerificationCode(currentPage(), code, authorize),
    readListingEdit: (itemId, accountId) => readVintedListingEdit(currentPage(), itemId, accountId),
    updateListing: (itemId, accountId, fields, authorize) =>
      updateVintedListing(currentPage(), itemId, accountId, fields, authorize),
    readProfileAbout: (accountId) => readVintedProfileAbout(currentPage(), accountId),
    updateProfileAbout: (accountId, about, authorize, expectedAbout) =>
      updateVintedProfileAbout(currentPage(), accountId, about, authorize, expectedAbout),
  };
}

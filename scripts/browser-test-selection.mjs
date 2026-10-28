// Nur diese zentralen Abläufe bilden den festen Kern. Historische Markierungen
// erweitern ihn nicht automatisch; weitere Fachfälle bleiben gezielt/manuell verfügbar.
export const coreBrowserTests = [
  ['core-smoke.spec.ts', 'speichert einen Artikel mit Bild und lädt ihn erneut @core-smoke'],
  [
    'inventory-sale.spec.ts',
    'verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke',
  ],
  [
    'article-stock-removal.spec.ts',
    'entfernt beschädigte Ware und behält den ursprünglichen Einkauf @core-smoke',
  ],
  ['purchase-tax-costs.spec.ts', 'keeps per-item tax visible in the tax journal @pr-smoke'],
  [
    'purchase-tax-costs.spec.ts',
    'preserves additional purchase costs after reopening at 1440px @pr-smoke',
  ],
  [
    'purchase-editable-draft.spec.ts',
    'keeps a saved draft editable through discard, save and reopening @pr-smoke',
  ],
  [
    'purchase-profitability.spec.ts',
    'Einkaufsansichten wechseln bei 1440px im light-Theme @core-smoke',
  ],
  [
    'company-documents.spec.ts',
    'Unternehmensdaten blockieren neue Rechnungen und bewahren alte Absender @core-smoke',
  ],
  ['ebay-order-import.spec.ts', 'imports an eBay order exactly once @core-smoke'],
  ['login.spec.ts', 'meldet sich mit einem echten Konto an'],
  [
    'local-supabase.spec.ts',
    'sperrt freie Registrierung und erlaubt Betreiber-Einladungen @pr-smoke',
  ],
  [
    'beta-access-lifecycle.spec.ts',
    'beendet und verlängert eine Beta bei offenem Browser und erhält die Anmeldung @core-smoke',
  ],
  [
    'listing-studio.spec.ts',
    'creates, publishes and completes the listing lifecycle on mobile @pr-smoke',
  ],
  [
    'vinted-kleinanzeigen-transfer.spec.ts',
    'Ein gewechseltes Browserkonto stoppt vor der Auftragsannahme @core-smoke',
  ],
  [
    'vinted-kleinanzeigen-transfer.spec.ts',
    'Ohne passende Erweiterung bleibt die automatische Veröffentlichung gesperrt @core-smoke',
  ],
  [
    'vinted-kleinanzeigen-transfer.spec.ts',
    'Unklarer Ausgang wird nur abgeglichen und nicht erneut inseriert @core-smoke',
  ],
  [
    'vinted-kleinanzeigen-transfer.spec.ts',
    'Noch nicht unterstützte Plattformen bieten keine Veröffentlichung an @core-smoke',
  ],
  ['company-settings.spec.ts', 'company settings have no automated WCAG AA violations @core-smoke'],
  [
    'pwa-mobile-layout.spec.ts',
    'stops unavailable access checks without a redirect loop or protected content @pwa-layout',
  ],
  [
    'pwa-mobile-layout.spec.ts',
    'installation follows the device, including manual fallback @pwa-layout',
  ],
];

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
export const coreBrowserFiles = [...new Set(coreBrowserTests.map(([file]) => `e2e/${file}`))];
export const coreBrowserGrep = coreBrowserTests.map(
  ([file, title]) =>
    // Der Installationsablauf läuft im Kern auf Android; Tablet/Desktop bleiben
    // in der breiten Layoutprüfung enthalten.
    new RegExp(
      `${escape(file)} .*${title.startsWith('installation ') ? 'Android ' : ''}${escape(title)}$`,
      'u',
    ),
);
export const layoutBrowserFiles = [
  'e2e/admin-layout.spec.ts',
  'e2e/responsive-admin-layout.spec.ts',
  'e2e/settings-layout.spec.ts',
  'e2e/pwa-mobile-layout.spec.ts',
];
export const layoutBrowserGrep = /@core-smoke\b|@pwa-layout\b|@pr-smoke\b/u;

// Nur bekannte, gleichartig parametrisierte Seitenfamilien reduzieren. Desktop
// (1440px) und Telefon (390px) behalten jeweils beide Farbschemata. Einzelfälle
// an besonderen Breiten, Fehlerpfade und Bedienungs-/Zugänglichkeitsfälle bleiben.
export const representativeBrowserGrepInvert = [
  /purchase-profitability\.spec\.ts .*Einkaufsansichten wechseln bei (?:320|834)px /u,
  /vinted-listing-edge-cases\.spec\.ts .*Vinted-Mosaik und Zeit-Badges bei (?:320|834)px /u,
  /vinted-workspace-ui\.spec\.ts .*kompakte Vinted-Ansicht, Kennzahlen und Favoritenglocke 320px /u,
  /kleinanzeigen-accounts\.spec\.ts .*Kleinanzeigen-Konten bleiben bei (?:320|834)px /u,
  /marketplace-overview\.spec\.ts .*(?:Marktplatzübersicht bleibt|Workspacewechsel trennt Sichtbarkeit und Auswahl) bei (?:320|834)px /u,
];

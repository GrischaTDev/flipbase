// Nur diese zentralen Abläufe bilden den festen Kern. Historische Markierungen
// erweitern ihn nicht automatisch; weitere Fachfälle bleiben gezielt/manuell verfügbar.
export const coreBrowserTests = [
  ['core-smoke.spec.ts', 'speichert einen Artikel mit Bild und lädt ihn erneut @core-smoke'],
  [
    'inventory-sale.spec.ts',
    'verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke',
  ],
  ['purchase-tax-costs.spec.ts', 'keeps per-item tax visible in the tax journal @pr-smoke'],
  [
    'purchase-editable-draft.spec.ts',
    'keeps a saved draft editable through discard, save and reopening @pr-smoke',
  ],
  [
    'company-documents.spec.ts',
    'Unternehmensdaten blockieren neue Rechnungen und bewahren alte Absender @core-smoke',
  ],
  ['login.spec.ts', 'meldet sich mit einem echten Konto an'],
  [
    'local-supabase.spec.ts',
    'sperrt freie Registrierung und erlaubt Betreiber-Einladungen @pr-smoke',
  ],
  [
    'vinted-kleinanzeigen-transfer.spec.ts',
    'Unklarer Ausgang wird nur abgeglichen und nicht erneut inseriert @core-smoke',
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
  'e2e/responsive-admin-layout.spec.ts',
  'e2e/settings-layout.spec.ts',
];
export const layoutBrowserGrep = /@core-smoke\b|@pwa-layout\b|@pr-smoke\b/u;

// Diese Dateien besitzen einen eigenen API-/Sitzungsmock. Neue Dateien werden
// ausdrücklich geprüft und registriert, niemals aus ihrem Namen abgeleitet.
export const uiBrowserFiles = [
  'responsive-admin-layout',
  'marketplace-accounts',
  'marketplace-overview',
  'kleinanzeigen-accounts',
  'vinted-kleinanzeigen-transfer',
  'settings-layout',
  'vinted-workspace-ui',
  'vinted-profile',
  'vinted-account-grid',
  'vinted-inbox-experience',
  'vinted-favorite-messages',
  'vinted-negotiation',
  'vinted-listing-drafts',
  'vinted-listing-edge-cases',
].map((name) => `e2e/${name}.spec.ts`);

// Gemeinsame Controls: gezielte Verbraucher mit Maus/Touch und Hell/Dunkel.
// Die vollständigen Seiten-/Breitenkombinationen bleiben manuell ausführbar.
export const sharedUiBrowserGrep = [
  /settings-layout\.spec\.ts .*Apple-Controlrollen Desktop (?:light|dark) Shell bleibt beim Seitenwechsel gleich und Controls behalten ihre Rollen$/u,
  /responsive-admin-layout\.spec\.ts .*Vinted-Konten nutzen die verfügbare Breite bei (?:390|1440)px @core-smoke$/u,
  /responsive-admin-layout\.spec\.ts .*Lokale Konten mit Touch Kartenaktionen bleiben bei (?:390|834)px innerhalb der Karte @core-smoke$/u,
];

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

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
  'vinted-action-overview',
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

function browserFamily(file, title, sizes, kept, themes = ['light', 'dark']) {
  const render = (size, theme) =>
    title.replaceAll('{size}', String(size)).replaceAll('{theme}', theme);
  return {
    file,
    variants: sizes.flatMap((size) => themes.map((theme) => render(size, theme))),
    representatives: kept.map(([size, theme]) => render(size, theme)),
  };
}

// Ausschließlich diese vollständigen bekannten Titel dürfen entfallen. Neue
// Titel und ausdrücklich benannte Breakpointregressionen bleiben ausgewählt.
// Sondervarianten bewahren zusätzliche Assertions im jeweiligen Testkörper.
export const representativeBrowserFamilies = [
  browserFamily(
    'vinted-listing-edge-cases.spec.ts',
    'Unvollständigen Vinted-Entwurf direkt im Formular ergänzen bei {size}px {theme} @marketplace-preview',
    [390, 1440],
    [[390, 'light']],
  ),
  browserFamily(
    'vinted-listing-edge-cases.spec.ts',
    'Vinted-Mosaik und Zeit-Badges bei {size}px {theme} @marketplace-preview @core-smoke',
    [320, 390, 834, 1440],
    // 1440/light enthält zusätzlich die Gegenprobe für null bis fünf Fotos;
    // beide Varianten erhalten die bedingten Anbieterstatusfälle.
    [
      [390, 'dark'],
      [1440, 'light'],
    ],
  ),
  browserFamily(
    'vinted-listing-edge-cases.spec.ts',
    'Preisdialog {size} {theme} Preis direkt ändern und nach einem Fehler erneut speichern bei {size}px {theme} @marketplace-preview @core-smoke',
    [390, 1440],
    [[390, 'light']],
  ),
  browserFamily(
    'vinted-listing-edge-cases.spec.ts',
    'Bestehendes Inserat vollständig bearbeiten und nur nach Vinted-Bestätigung übernehmen bei {size}px @marketplace-preview',
    [390, 1440],
    [[1440, '']],
    [''],
  ),
  browserFamily(
    'vinted-listing-edge-cases.spec.ts',
    'Relist-Editor {size} {theme} Relisten und Vorlage bewahren Originale und übernehmen vollständige Daten bei {size}px {theme} @marketplace-preview',
    [390, 1440],
    [[1440, 'dark']],
  ),
  browserFamily(
    'vinted-listing-edge-cases.spec.ts',
    'Inserat löschen wahrt Bestätigung und zeigt den Fortschritt bei {size}px {theme} @marketplace-preview',
    [390, 1440],
    [[390, 'light']],
  ),
  browserFamily(
    'vinted-workspace-ui.spec.ts',
    'kompakte Vinted-Ansicht, Kennzahlen und Favoritenglocke {size}px {theme} @marketplace-preview @core-smoke',
    [320, 390, 1440],
    // Nur Desktop/light prüft die Synchronisierung zwischen zwei geöffneten Tabs.
    [
      [390, 'dark'],
      [1440, 'light'],
    ],
  ),
  ...[
    [
      'direkte Bearbeitung {size}px trennt Vinted-Entwürfe und speichert direkte Änderungen bei {size}px {theme} @marketplace-preview',
      ['light', 'dark'],
      'light',
    ],
    [
      'Veröffentlichung ohne zweite Prüfseite planen bei {size}px {theme} @marketplace-preview',
      ['hell', 'dunkel'],
      'hell',
    ],
    [
      'Vinted-Artikelangaben auswählen bei {size}px {theme} @marketplace-preview',
      ['hell', 'dunkel'],
      'hell',
    ],
    [
      'Vinted-Marke auswählen bei {size}px {theme} @marketplace-preview',
      ['hell', 'dunkel'],
      'hell',
    ],
    [
      'Planung zentral ändern bei {size}px {theme} @marketplace-preview',
      ['hell', 'dunkel'],
      'hell',
    ],
    [
      'Entwurf mit Fotos und Vorlagen bei {size}px {theme} @marketplace-preview @core-smoke',
      ['hell', 'dunkel'],
      'hell',
    ],
    [
      'Eigenes Schuhformular {size}px erstellt Damenschuhe trotz ausgefallenem Vinted-Formularabruf {size}px {theme} @marketplace-preview',
      ['light', 'dark'],
      'light',
    ],
  ].map(([title, themes, theme]) =>
    browserFamily('vinted-listing-drafts.spec.ts', title, [390, 1440], [[390, theme]], themes),
  ),
  browserFamily(
    'vinted-listing-drafts.spec.ts',
    'Entwurfsübersicht bei {size}px zeigt und löscht Entwürfe in Raster und Liste {theme} @marketplace-preview',
    [390, 1440],
    [
      [390, 'hell'],
      [1440, 'dunkel'],
    ],
    ['hell', 'dunkel'],
  ),
  browserFamily(
    'purchase-profitability.spec.ts',
    'Einkaufsansichten wechseln bei {size}px im {theme}-Theme @core-smoke',
    [320, 390, 834, 1440],
    [
      [390, 'light'],
      [1440, 'dark'],
    ],
  ),
  browserFamily(
    'kleinanzeigen-accounts.spec.ts',
    '{size}px {theme} Eigener Kleinanzeigen-Bereich mit Navigation und Inserierfortschritt bei {size}px {theme}',
    [390, 1440],
    // Telefon/dunkel prüft zusätzlich die ausgeschaltete Aktionsübersicht;
    // Desktop erhält die echte Hover- und kompakte Menügegenprobe.
    [
      [390, 'dark'],
      [1440, 'light'],
    ],
  ),
  browserFamily(
    'kleinanzeigen-accounts.spec.ts',
    'Kleinanzeigen-Konten bleiben bei {size}px im {theme}-Theme bedienbar @core-smoke',
    [320, 390, 834, 1440],
    [
      [390, 'light'],
      [1440, 'dark'],
    ],
  ),
  browserFamily(
    'marketplace-overview.spec.ts',
    'Marktplatzübersicht bleibt bei {size}px im {theme}-Theme bedienbar @core-smoke',
    [320, 390, 834, 1440],
    [
      [390, 'light'],
      [1440, 'dark'],
    ],
  ),
  browserFamily(
    'marketplace-overview.spec.ts',
    'Workspacewechsel trennt Sichtbarkeit und Auswahl bei {size}px im {theme}-Theme @core-smoke',
    [320, 390, 834, 1440],
    [[390, 'light']],
  ),
  browserFamily(
    'settings-layout.spec.ts',
    'Apple-Controlrollen {size} {theme} Shell bleibt beim Seitenwechsel gleich und Controls behalten ihre Rollen',
    ['Desktop', 'Touch'],
    [
      ['Touch', 'light'],
      ['Desktop', 'dark'],
    ],
  ),
  ...[
    'account',
    'company',
    'workspace',
    'numbering',
    'team',
    'marketplaces',
    'notifications',
    'store',
    'shipping',
    'app',
  ].map((page) =>
    browserFamily(
      'settings-layout.spec.ts',
      `settings/${page} uses clear sections and accessible controls at {size}px @pwa-layout`,
      [390, 1024, 1280],
      [
        [390, ''],
        [1280, ''],
      ],
      [''],
    ),
  ),
  browserFamily(
    'responsive-admin-layout.spec.ts',
    'Vinted-Konten nutzen die verfügbare Breite bei {size}px @core-smoke',
    [320, 390, 768, 834, 1024, 1194, 1440],
    [
      [390, ''],
      [1440, ''],
    ],
    [''],
  ),
  browserFamily(
    'responsive-admin-layout.spec.ts',
    'Touch-Dashboard Zeitraum und Plattform bleiben gleich hoch bei {size}px im {theme}-Theme @core-smoke',
    [320, 390, 834, 1194],
    [
      [390, 'light'],
      [1194, 'dark'],
    ],
  ),
  browserFamily(
    'responsive-admin-layout.spec.ts',
    'Lokale Konten mit Touch Kartenaktionen bleiben bei {size}px innerhalb der Karte @core-smoke',
    [320, 390, 834, 1194],
    [
      [390, ''],
      [834, ''],
    ],
    [''],
  ),
  ...[
    '/catalog',
    '/purchases',
    '/sales',
    '/expenses',
    '/listings',
    '/vinted-bot',
    '/deal-calculator',
    '/deal-calculator/ebay',
    '/image-optimizer',
    '/purchases/new',
    '/catalog/new',
    '/sellers',
    '/analytics',
    '/marketplaces/ebay/connection',
    '/marketplaces/kleinanzeigen',
    '/settings/account',
    '/settings/company',
    '/settings/marketplaces',
  ].map((route) =>
    browserFamily(
      'responsive-admin-layout.spec.ts',
      `${route} bleibt bei {size}px innerhalb des Inhalts @core-smoke`,
      [320, 390, 834, 1024, 1194, 1440],
      [
        [390, ''],
        [1440, ''],
      ],
      [''],
    ),
  ),
  browserFamily(
    'responsive-admin-layout.spec.ts',
    'Finanzen behalten ihre Abläufe mit gemeinsamen Controls {size}px {theme} Ausgaben, Steuer und Auswertung bleiben bedienbar',
    [390, 834, 1440],
    // Die Auswertungsnavigation hat unterschiedliche Auswahl- und Buttonwege.
    [
      [390, 'light'],
      [1440, 'dark'],
    ],
  ),
  browserFamily(
    'responsive-admin-layout.spec.ts',
    'Manuelle Bankzuordnung mit Auswahlfenster {size}px {theme} ordnet Einnahmen und Ausgänge zu, erlaubt Änderungen und bucht erst getrennt',
    [390, 834, 1440],
    [[1440, 'dark']],
  ),
  browserFamily(
    'responsive-admin-layout.spec.ts',
    'Manuelle Bankzuordnung bei Fehlern behält die Auswahl bei Speicherfehlern und bietet Laden erneut an in {theme}',
    [''],
    [['', 'light']],
  ),
  browserFamily(
    'vinted-action-overview.spec.ts',
    'Aktionsübersicht {size}px öffnet nur laufende Aktionen am Header-Icon in {theme} @marketplace-preview',
    [1920, 1280, 390, 320],
    // 1280 enthält zusätzlich den Wechsel vom Tablet zum Telefondialog.
    [
      [390, 'dark'],
      [1280, 'light'],
    ],
  ),
  browserFamily(
    'vinted-action-overview.spec.ts',
    'Workspace-Auswahl {size}px speichert das Ausblenden erst ausdrücklich und stellt die Auswahl wieder her @marketplace-preview',
    [1440, 390, 320],
    // Desktop erhält den nur dort geprüften Speicherfehler samt Wiederholung.
    [
      [1440, ''],
      [320, ''],
    ],
    [''],
  ),
];

export const representativeBrowserGrepInvert = representativeBrowserFamilies.flatMap(
  ({ file, variants, representatives }) =>
    variants
      .filter((title) => !representatives.includes(title))
      .map((title) => new RegExp(`(?:^|[\\\\/ ])${escape(file)} ${escape(title)}$`, 'u')),
);

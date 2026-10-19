import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readSelectionFiles, selectAffectedTests } from './affected-tests.mjs';

const executeFile = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));

// Nur die tatsächliche Testauswahl prüfen, nicht Playwrights Parser nachtesten.
const coreTests = [
  ...[
    ...['light', 'dark'].map(
      (theme) =>
        `Einheitliche Seitenbreite > wendet Layoutwahl, Seitenwechsel und gespeicherte Breite an ${theme} @core-smoke`,
    ),
    'Einheitliche Seitenbreite > hält alle Verwaltungsseiten im gemeinsamen Rahmen @core-smoke',
    ...[320, 390, 768].map(
      (width) =>
        `Einheitliche Seitenbreite > bleibt bei ${width}px per Touch bedienbar und ohne Überlauf @core-smoke`,
    ),
  ].map((title) => ['admin-layout.spec.ts', title]),

  ...[
    'Die freigegebene Kategorieauswahl bleibt ohne Erweiterung lokal durchsuchbar @core-smoke',
    'Eine verlorene Annahmeantwort wird ohne zweiten Auftrag fortgesetzt @core-smoke',
    'Ein gewechseltes Browserkonto stoppt vor der Auftragsannahme @core-smoke',
    'Ohne passende Erweiterung bleibt die automatische Veröffentlichung gesperrt @core-smoke',
  ].map((title) => ['vinted-kleinanzeigen-transfer.spec.ts', title]),

  [
    'vinted-kleinanzeigen-transfer.spec.ts',
    'Zentrale Übersicht zeigt echte Kleinanzeigen-Konten und den bestätigten Zielbestand @core-smoke',
  ],
  ...['light', 'dark'].flatMap((theme) =>
    [320, 390, 834, 1440].map((width) => [
      'vinted-kleinanzeigen-transfer.spec.ts',
      'Vinted-Übertragung bleibt bei ' +
        width +
        'px im ' +
        theme +
        '-Theme sicher bedienbar @core-smoke',
    ]),
  ),
  ...[
    ...['100', '101'].map(
      (value) => 'Offizielles Kontingent ' + value + ' stoppt vor Auftragsannahme @core-smoke',
    ),
    'Gebühren stoppen den Auftrag ohne Erfolgsmeldung @core-smoke',
    'Unbekanntes Kontingent stoppt vor Auftragsannahme @core-smoke',
    'Ein Zielwechsel verwirft die verspätete Quellantwort @core-smoke',
    'Fehlende gespeicherte Angaben bleiben zur Korrektur sichtbar @core-smoke',
    'Noch nicht unterstützte Plattformen bieten keine Veröffentlichung an @core-smoke',
    'Unklarer Ausgang wird nur abgeglichen und nicht erneut inseriert @core-smoke',
    'Verarbeitung bleibt von einer bestätigten Veröffentlichung unterscheidbar @core-smoke',
    'Lange Quelltexte bleiben ungekürzt zur Korrektur erhalten @core-smoke',
    'Unvollständige Bilder blockieren die Veröffentlichung @core-smoke',
  ].map((title) => ['vinted-kleinanzeigen-transfer.spec.ts', title]),

  ...['light', 'dark'].flatMap((theme) =>
    [320, 390, 834, 1440].map((width) => [
      'kleinanzeigen-accounts.spec.ts',
      'Kleinanzeigen-Konten bleiben bei ' +
        width +
        'px im ' +
        theme +
        '-Theme bedienbar @core-smoke',
    ]),
  ),
  ...[
    'Ein unterbrochener Kleinanzeigen-Abgleich erhält den bestätigten Bestand @core-smoke',
    'Kleinanzeigen-Konto entfernen gibt das Profil frei und bleibt nach Neuladen entfernt @core-smoke',
    'Kleinanzeigen ohne passende Erweiterung bietet keinen Abgleich an @core-smoke',
    'Desktop- und Touch-Buttons bleiben bei gleicher Breite getrennt @core-smoke',
  ].map((title) => ['kleinanzeigen-accounts.spec.ts', title]),
  [
    'marketplace-overview.spec.ts',
    'Marktplatzeinstellungen können einen fehlgeschlagenen Abruf erneut laden @core-smoke',
  ],
  ...[
    'Kontextnavigation führt aus Vinted und eBay zur Übersicht zurück @core-smoke',
    'Fehlende Vinted-Freigabe bietet keinen Erstellungseinstieg an @core-smoke',
  ].map((title) => ['marketplace-overview.spec.ts', title]),
  ...['light', 'dark'].flatMap((theme) =>
    [320, 390, 834, 1440].map((width) => [
      'marketplace-overview.spec.ts',
      'Workspacewechsel trennt Sichtbarkeit und Auswahl bei ' +
        width +
        'px im ' +
        theme +
        '-Theme @core-smoke',
    ]),
  ),
  ...['light', 'dark'].flatMap((theme) =>
    [320, 390, 834, 1440].map((width) => [
      'marketplace-overview.spec.ts',
      'Marktplatzübersicht bleibt bei ' + width + 'px im ' + theme + '-Theme bedienbar @core-smoke',
    ]),
  ),
  ...[
    'Sichtbarkeit bleibt nach Neuladen erhalten und alle Accountlisten bleiben getrennt @core-smoke',
    'Ein Vinted-Ausfall erhält die eBay-Inserate und bietet keine fremden Filter an @core-smoke',
  ].map((title) => ['marketplace-overview.spec.ts', title]),
  ...['light', 'dark'].flatMap((theme) =>
    [320, 390, 834, 1440].map((width) => [
      'purchase-profitability.spec.ts',
      `Einkaufsansichten wechseln bei ${width}px im ${theme}-Theme @core-smoke`,
    ]),
  ),
  ...[320, 390, 768, 834, 1024, 1194, 1440].map((width) => [
    'responsive-admin-layout.spec.ts',
    `Vinted-Konten nutzen die verfügbare Breite bei ${width}px @core-smoke`,
  ]),
  ...['light', 'dark'].flatMap((theme) =>
    [320, 390, 834, 1194].map((width) => [
      'responsive-admin-layout.spec.ts',
      `Touch-Dashboard > Zeitraum und Plattform bleiben gleich hoch bei ${width}px im ${theme}-Theme @core-smoke`,
    ]),
  ),
  ...[320, 390, 834, 1024, 1194, 1440].map((width) => [
    'responsive-admin-layout.spec.ts',
    `Verwaltungsseiten bleiben bei ${width}px innerhalb des Inhalts @core-smoke`,
  ]),
  ...[320, 390, 834, 1194].map((width) => [
    'responsive-admin-layout.spec.ts',
    `Lokale Konten mit Touch > Kartenaktionen bleiben bei ${width}px innerhalb der Karte @core-smoke`,
  ]),
  [
    'responsive-admin-layout.spec.ts',
    'Auswertungen behalten lesbare Zeiträume und erreichbare Bereiche bei 320px @core-smoke',
  ],
  [
    'responsive-admin-layout.spec.ts',
    'große Bestandswerte bleiben im Dashboard vollständig lesbar @core-smoke',
  ],
  ...[1280, 390, 1024].map((width) => [
    'settings-layout.spec.ts',
    `settings use clear sections and accessible controls at ${width}px @pwa-layout`,
  ]),
  [
    'settings-layout.spec.ts',
    'eBay uses compact account cards and opens connection management in a dialog @pwa-layout',
  ],
  [
    'pwa-install-device.spec.ts',
    'preserves the original mark geometry on white install icons and safe masks @pwa-layout',
  ],
  [
    'pwa-install-device.spec.ts',
    'Android install dialog > keeps manual help on the current page, handles late native offers and confirmed installation @pwa-layout',
  ],
  [
    'pwa-install-device.spec.ts',
    'places device settings before webhooks and exposes the bell settings link on Windows @pwa-layout',
  ],
  ...[
    'stops unavailable access checks without a redirect loop or protected content @pwa-layout',
    'legacy offline links lead to normal purchases without local parameters @pwa-layout',
    'an unauthenticated legacy link keeps normal sign-in without a local entry or access error @pwa-layout',
  ].map((title) => ['pwa-mobile-layout.spec.ts', title]),
  ...['Android', 'iPad desktop mode', 'Desktop'].map((device) => [
    'pwa-mobile-layout.spec.ts',
    `${device} > installation follows the device, including manual fallback @pwa-layout`,
  ]),
  [
    'pwa-mobile-layout.spec.ts',
    'iPad desktop mode > keeps the tablet header in place while scrolling and resizing @pwa-layout',
  ],
  [
    'article-stock-removal.spec.ts',
    'entfernt beschädigte Ware und behält den ursprünglichen Einkauf @core-smoke',
  ],
  [
    'article-stock-removal.spec.ts',
    'archiviert Varianten einzeln und löscht einen unbenutzten Stammartikel ohne seine Geschwister @core-smoke',
  ],
  [
    'article-stock-removal.spec.ts',
    'zeigt wenige Verkaufsspalten und konkrete fehlende Rechnungsfelder @core-smoke',
  ],
  ...['390x844', '844x390', '768x1024', '512x768'].map((viewport) => [
    'pwa-mobile-layout.spec.ts',
    `safe areas and navigation ${viewport} @pwa-layout`,
  ]),
  [
    'brand-label-library.spec.ts',
    'pflegt und veröffentlicht echte Label- und Größenreferenzen mit freigegebenen Bildern @core-smoke',
  ],
  [
    'clothing-size-guide.spec.ts',
    'zeigt allgemeine Richtbereiche und grenzt Größen und Längen getrennt ein @core-smoke',
  ],
  [
    'clothing-size-guide.spec.ts',
    'erhält die Größenübersicht bei einem Ausfall der zusätzlichen Referenzen @core-smoke',
  ],
  [
    'sniper-administration.spec.ts',
    'prüft den Vinted-Bot manuell und behält bei Ablehnung die Pause @core-smoke',
  ],
  [
    'deal-monitor.spec.ts',
    'Account-Favoriten bleiben auf Tablet und Desktop nach Feed-Bereinigung erhalten @core-smoke',
  ],
  ...['light', 'dark'].map((theme) => [
    'sniper-administration.spec.ts',
    `verwaltet zentrale Kategorie-, Marken- und Titel-Suchfilter ${theme} @core-smoke`,
  ]),
  ...['Extension', 'Cloud'].flatMap((mode) =>
    [1440, 1024, 390, 320].map((width) => [
      'vinted-favorite-messages.spec.ts',
      `Favoritennachrichten (${mode}) bleiben vor Freigabe aus und speichern Regeln bei ${width}px @marketplace-preview @core-smoke`,
    ]),
  ),
  ...[1440, 390].map((width) => [
    'vinted-inbox-experience.spec.ts',
    `Cloud-Glocke öffnet das richtige Gespräch und sendet ohne Extension bei ${width}px @core-smoke`,
  ]),
  ...['Extension', 'Cloud'].map((mode) => [
    'vinted-inbox-experience.spec.ts',
    `Geöffnetes ${mode}-Gespräch wird nach erfolgreichem Laden gelesen @core-smoke`,
  ]),
  ...['Extension', 'Cloud'].flatMap((mode) =>
    [1440, 390].map((width) => [
      'vinted-inbox-experience.spec.ts',
      `Bot-Icon für automatische Antwort ${mode} ${width}px @core-smoke`,
    ]),
  ),
  [
    'beta-access-lifecycle.spec.ts',
    'beendet und verlängert eine Beta bei offenem Browser und erhält die Anmeldung @core-smoke',
  ],
  [
    'beta-access-lifecycle.spec.ts',
    'zieht eine offene Registrierung zurück und gibt die E-Mail frei @core-smoke',
  ],
  [
    'beta-access-lifecycle.spec.ts',
    'zieht eine abgelaufene Registrierung zurück und gibt die E-Mail frei @core-smoke',
  ],
  ['ebay-order-import.spec.ts', 'imports an eBay order exactly once @core-smoke'],
  [
    'ebay-order-import.spec.ts',
    'marks a manually recorded eBay order without changing stock @core-smoke',
  ],
  [
    'sales-variant-picker.spec.ts',
    'wählt verkaufbare Varianten im gemeinsamen Modal und zeigt kompakte Verkaufsspalten @core-smoke',
  ],
  [
    'marketplace-accounts.spec.ts',
    'aktiviert und pausiert automatische Vinted-Abrufe je Konto zugänglich @marketplace-preview @core-smoke',
  ],
  [
    'marketplace-accounts.spec.ts',
    'öffnet eine Mensch-Prüfung bei login automatisch @marketplace-preview @core-smoke',
  ],
  [
    'marketplace-accounts.spec.ts',
    'öffnet eine Mensch-Prüfung bei identify automatisch @marketplace-preview @core-smoke',
  ],
  [
    'marketplace-accounts.spec.ts',
    'öffnet eine Mensch-Prüfung bei verify automatisch @marketplace-preview @core-smoke',
  ],
  [
    'marketplace-accounts.spec.ts',
    'überträgt manuelles Ziehen im Browserbild mit Maus und Touch genau einmal @marketplace-preview @core-smoke',
  ],
  [
    'marketplace-accounts.spec.ts',
    'zeigt unbekannte Bewertungen und gespeicherte Teilfehler zugänglich @marketplace-preview @core-smoke',
  ],
  ...[1440, 390].map((width) => [
    'marketplace-accounts.spec.ts',
    `Vinted-Bereich führt lokal durch die Einrichtung bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  ...[1440, 390].map((width) => [
    'marketplace-accounts.spec.ts',
    `Cloud-Einrichtung ohne freie IP bleibt lokal nutzbar bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  ...[1440, 390].map((width) => [
    'marketplace-accounts.spec.ts',
    `Konto hinzufügen reserviert eine IP und aktiviert Cloud automatisch bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  [
    'marketplace-accounts.spec.ts',
    'new Cloud account returns from a human check to SMS and completes automatically @marketplace-preview @core-smoke',
  ],
  ...[1440, 390].map((width) => [
    'marketplace-accounts.spec.ts',
    `Kontenkacheln sortieren und lokale Einstellungen öffnen bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  ...[1440, 390].map((width) => [
    'marketplace-accounts.spec.ts',
    `Aktualisiert ein lokal verbundenes Konto direkt bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  ...[1440, 390].map((width) => [
    'marketplace-accounts.spec.ts',
    `Gibt das lokale Postfach frei und erhält das Gespräch bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  [
    'vinted-inbox-experience.spec.ts',
    'zeigt einen bekannten Chat sofort auch während Datenbank und Vinted noch aktualisieren @core-smoke',
  ],
  [
    'vinted-inbox-experience.spec.ts',
    'prüft unklaren Versand vor der Wiederholung und versetzt den Mausfokus nicht @core-smoke',
  ],
  ...[1440, 390].flatMap((width) =>
    ['light', 'dark'].map((theme) => [
      'vinted-inbox-experience.spec.ts',
      `lokales Postfach mit Artikel, Suche, Filter und Versandwarteschlange ${width}px ${theme} @marketplace-preview @core-smoke`,
    ]),
  ),
  [
    'company-shop-shipping.spec.ts',
    'Shop und Versand verwenden Unternehmensdaten und bewahren individuelle Absender @core-smoke',
  ],
  [
    'company-documents.spec.ts',
    'Unternehmensdaten blockieren neue Rechnungen und bewahren alte Absender @core-smoke',
  ],
  [
    'beta-registration.spec.ts',
    'genehmigt eine Bewerbung und startet nach der Passwortvergabe 60 Beta-Tage @pr-smoke',
  ],
  ['company-settings.spec.ts', 'company settings stay usable on desktop and mobile @core-smoke'],
  [
    'company-settings.spec.ts',
    'company settings block workspace switching only while dirty @core-smoke',
  ],
  [
    'company-settings.spec.ts',
    'company settings remain visible in light and dark themes @core-smoke',
  ],
  ['company-settings.spec.ts', 'company settings have no automated WCAG AA violations @core-smoke'],
  ['core-smoke.spec.ts', 'speichert einen Artikel mit Bild und lädt ihn erneut @core-smoke'],
  ['core-smoke.spec.ts', 'öffnet die App und zentrale Arbeitsbereiche @core-smoke'],
  [
    'inventory-sale.spec.ts',
    'verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke',
  ],
  [
    'listing-studio.spec.ts',
    'creates, publishes and completes the listing lifecycle on mobile @pr-smoke',
  ],
  [
    'local-supabase.spec.ts',
    'sperrt freie Registrierung und erlaubt Betreiber-Einladungen @pr-smoke',
  ],
  [
    'purchase-editable-draft.spec.ts',
    'keeps a saved draft editable through discard, save and reopening @pr-smoke',
  ],
  [
    'purchase-detail-layout.spec.ts',
    'keeps purchase details in the right card after completion @pr-smoke',
  ],
  ['purchase-tax-costs.spec.ts', 'keeps per-item tax visible in the tax journal @pr-smoke'],
  [
    'purchase-tax-costs.spec.ts',
    'preserves additional purchase costs after reopening at 1440px @pr-smoke',
  ],
  [
    'sidebar-navigation.spec.ts',
    'hält die Sidebar kompakt und hebt den aktiven Bereich in Logo-Gelb hervor @pr-smoke',
  ],
  ...[1440, 1024, 768, 390, 320].map((width) => [
    'vinted-account-grid.spec.ts',
    `öffnet Vinted-Kontokacheln und behält die Auswahl nach Neuladen bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  ...[1440, 390, 320].map((width) => [
    'vinted-account-grid.spec.ts',
    `wechselt dasselbe lokale Konto über die Kachel zur Cloud bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  ...[1440, 320].map((width) => [
    'vinted-account-grid.spec.ts',
    `zehn Konten bleiben kompakt und erreichbar bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  ...[390, 320].map((width) => [
    'vinted-account-grid.spec.ts',
    `langer lokaler Profilstatus bleibt im Kontenbadge bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  ...[1440, 390, 320].flatMap((width) =>
    ['light', 'dark'].map((theme) => [
      'vinted-workspace-ui.spec.ts',
      `kompakte Vinted-Ansicht, Kennzahlen und Favoritenglocke ${width}px ${theme} @marketplace-preview @core-smoke`,
    ]),
  ),
  ...[1440, 390].map((width) => [
    'vinted-listing-edge-cases.spec.ts',
    `Inseratgalerie erhält Hoch-/Querformat, Bildfehlerrahmen und langen Titel bei ${width}px @marketplace-preview @core-smoke`,
  ]),
  [
    'vinted-listing-edge-cases.spec.ts',
    'Großansicht behält den Tastaturfokus an beiden Galeriegrenzen @marketplace-preview @core-smoke',
  ],
  ...[320, 390, 834, 1440].flatMap((width) =>
    ['light', 'dark'].map((theme) => [
      'vinted-listing-edge-cases.spec.ts',
      `Vinted-Mosaik und Zeit-Badges bei ${width}px ${theme} @marketplace-preview @core-smoke`,
    ]),
  ),
  [
    'vinted-listing-edge-cases.spec.ts',
    'Bekannte leere Beschreibung startet auch beim Wiederöffnen keinen Browserabruf @marketplace-preview @core-smoke',
  ],
  [
    'vinted-listing-edge-cases.spec.ts',
    'Fehlende Beschreibung lädt nur das gewählte Inserat und bleibt beim Wiederöffnen im Sitzungscache @marketplace-preview @core-smoke',
  ],
  ...[1440, 390].flatMap((width) =>
    ['hell', 'dunkel'].map((theme) => [
      'vinted-listing-drafts.spec.ts',
      `Entwurf mit Fotos und Vorlagen bei ${width}px ${theme} @marketplace-preview @core-smoke`,
    ]),
  ),
];

const regressionTests = [
  [
    'dashboard-interactions.spec.ts',
    'erkundet die Diagrammdaten vollstaendig mit der Tastatur @pr-smoke',
  ],
  ['date-picker-layer.spec.ts', 'can select a purchase date outside its card @pr-smoke'],
  ['deal-monitor.spec.ts', 'Vinted Bot Feed und Suchfilter verwalten dark @pr-smoke'],
  ['deal-monitor.spec.ts', 'Vinted Bot Feed und Suchfilter verwalten light @pr-smoke'],
  [
    'entry-pages.spec.ts',
    'keeps the new entry pages free of automated WCAG AA violations @pr-smoke',
  ],
  [
    'inventory-sale.spec.ts',
    'verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke',
  ],
  [
    'product-editor-storefront.spec.ts',
    'Artikel mit Galerie, Zuschnitt und Suchvorschau erstellen 1440 @pr-smoke',
  ],
  [
    'product-integration.spec.ts',
    'Produktbild bleibt nach erneutem Laden sichtbar und unbekannter Scan erlaubt manuelle Auswahl @pr-smoke',
  ],
  [
    'purchase-dropdown-layer.spec.ts',
    'keeps cost options above the modal footer and preserves keyboard dismissal @pr-smoke',
  ],
  [
    'purchase-editable-draft.spec.ts',
    'keeps a saved draft editable through discard, save and reopening @pr-smoke',
  ],
  ['purchase-tax-costs.spec.ts', 'keeps per-item tax visible in the tax journal @pr-smoke'],
  [
    'purchase-tax-costs.spec.ts',
    'preserves additional purchase costs after reopening at 1440px @pr-smoke',
  ],
  [
    'sniper-administration.spec.ts',
    'prüft den Vinted-Bot manuell und behält bei Ablehnung die Pause @core-smoke',
  ],
  [
    'sniper-administration.spec.ts',
    'verwaltet zentrale Kategorie-, Marken- und Titel-Suchfilter dark @core-smoke',
  ],
  [
    'sniper-administration.spec.ts',
    'verwaltet zentrale Kategorie-, Marken- und Titel-Suchfilter light @core-smoke',
  ],
];

function collectSpecs(suites, parentTitles = []) {
  return suites.flatMap((suite) => {
    const titles = [...parentTitles, suite.title];
    return [
      ...(suite.specs ?? []).map((spec) => ({
        ...spec,
        // Der Dateiname bildet einen eigenen Schlüssel; describe-Gruppen unterscheiden Gerätefälle.
        titlePath: [...titles.slice(1), spec.title],
      })),
      ...collectSpecs(suite.suites ?? [], titles),
    ];
  });
}

async function listTests(config, selectionArguments = [], environment = {}) {
  const env = { ...process.env, CI: 'true', ...environment };
  delete env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  delete env.PLAYWRIGHT_JSON_OUTPUT_DIR;
  const { stdout } = await executeFile(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      `--config=${config}`,
      ...(config === 'playwright.affected.config.ts' ? [] : ['--project=chromium']),
      '--list',
      '--reporter=json',
      ...selectionArguments,
    ],
    { cwd: root, env, timeout: 45_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const report = JSON.parse(stdout);
  assert.deepEqual(report.errors ?? [], []);
  const selected = collectSpecs(report.suites).map((spec) => [
    spec.file.split(/[\\/]/).at(-1),
    spec.titlePath.join(' > '),
  ]);
  return { report, selected };
}

const keys = (entries) => entries.map((entry) => JSON.stringify(entry)).sort();

test('Galerieänderung wählt echte Artikel-Browserfälle ohne Verkauf, Einkauf und PWA', async () => {
  const plan = selectAffectedTests(
    ['src/app/shared/components/product-gallery/product-gallery.component.html'],
    await readSelectionFiles(root),
  );
  const { selected } = await listTests('playwright.affected.config.ts', [], {
    AFFECTED_TEST_PLAN: JSON.stringify(plan),
  });
  assert.equal(plan.full, false);
  assert.equal(plan.pwa, false);
  assert.equal(selected.length, 21);
  assert.deepEqual([...new Set(selected.map(([file]) => file))].sort(), [
    'vinted-listing-edge-cases.spec.ts',
    'vinted-workspace-ui.spec.ts',
  ]);
});

test('direkt geänderter Browserfall läuft vollständig und ohne fachfremde Fälle', async () => {
  const plan = selectAffectedTests(
    ['e2e/vinted-listing-edge-cases.spec.ts'],
    await readSelectionFiles(root),
  );
  const { selected } = await listTests('playwright.affected.config.ts', [], {
    AFFECTED_TEST_PLAN: JSON.stringify(plan),
  });
  assert.equal(selected.length, 15);
  assert.ok(selected.every(([file]) => file === 'vinted-listing-edge-cases.spec.ts'));
});

test('Einkaufsübersicht wählt nur die acht zugehörigen Ansichtsvarianten', async () => {
  const plan = selectAffectedTests(
    ['src/app/features/purchases/purchases.component.html'],
    await readSelectionFiles(root),
  );
  const { selected } = await listTests('playwright.affected.config.ts', [], {
    AFFECTED_TEST_PLAN: JSON.stringify(plan),
  });
  assert.equal(selected.length, 8);
  assert.ok(selected.every(([file]) => file === 'purchase-profitability.spec.ts'));
  assert.equal(plan.pwa, false);
});

test('breite Änderung erhält die bisherige vollständige PR-Auswahl', async () => {
  const plan = selectAffectedTests(['package-lock.json'], await readSelectionFiles(root));
  const { selected } = await listTests('playwright.affected.config.ts', [], {
    AFFECTED_TEST_PLAN: JSON.stringify(plan),
  });
  assert.deepEqual(keys(selected), keys(coreTests));
  assert.equal(plan.pwa, true);
});

test('drei frische Browsergruppen enthalten jeden vollständigen PR-Fall genau einmal', async () => {
  const plan = selectAffectedTests(
    ['scripts/run-affected-tests.mjs'],
    await readSelectionFiles(root),
  );
  assert.equal(plan.full, true);
  const groups = [];
  for (let group = 1; group <= 3; group += 1) {
    const { report, selected } = await listTests(
      'playwright.affected.config.ts',
      ['--project=chromium', `--shard=${group}/3`],
      { AFFECTED_TEST_PLAN: JSON.stringify(plan) },
    );
    assert.equal(report.config.fullyParallel, true);
    assert.ok(selected.length > 0 && selected.length <= Math.ceil(coreTests.length / 3));
    groups.push(...selected);
  }
  assert.equal(new Set(keys(groups)).size, groups.length);
  assert.deepEqual(keys(groups), keys(coreTests));
});

test('PR-Auswahl: alle Kernfälle, keine Wiederholungen, kein test.only', async () => {
  const { report, selected } = await listTests('playwright.pr.config.ts');
  assert.deepEqual(keys(selected), keys(coreTests));
  assert.equal(report.config.forbidOnly, true);
  assert.equal(report.config.maxFailures, 1);
  assert.equal(report.config.workers, 1);
  assert.deepEqual(
    report.config.projects.map((project) => [project.name, project.retries]),
    [['chromium', 0]],
  );
});

test('manuelle Regression enthält alle bisherigen Fälle und die neuen Kernabläufe', async () => {
  const { selected } = await listTests('playwright.nightly.config.ts');
  const actual = new Set(keys(selected));
  assert.equal(actual.size, selected.length, 'Keine doppelten Fälle');
  for (const required of new Set(keys([...regressionTests, ...coreTests]))) {
    assert.ok(actual.has(required), `Fehlende Absicherung: ${required}`);
  }
});

test('normale Browserkonfigurationen schließen die gesonderten Produktions-PWA-Fälle aus', async () => {
  const productionSpecs = new Set([
    'pwa-production.spec.ts',
    'pwa-purchase-drafts.spec.ts',
    'pwa-purchase-buffer-documents.spec.ts',
    'pwa-push-navigation.spec.ts',
  ]);
  for (const config of ['playwright.pr.config.ts', 'playwright.nightly.config.ts']) {
    // Alle Titel einschließen, damit nur testIgnore den Produktionsausschluss beweisen kann.
    const { selected } = await listTests(config, ['--grep=.*']);
    assert.ok(selected.length > 0, `${config} muss normale Browserfälle auswählen`);
    assert.deepEqual(
      selected.filter(([file]) => productionSpecs.has(file)),
      [],
      `${config} darf keine separat ausgeführten Produktions-PWA-Fälle auswählen`,
    );
  }
});

test('gezielte Marktplatzübersicht wählt ihre registrierten Browserfälle', async () => {
  const plan = selectAffectedTests(
    [
      'src/app/features/marketplaces/components/marketplace-overview/marketplace-overview.component.html',
    ],
    await readSelectionFiles(root),
  );
  const { selected } = await listTests('playwright.affected.config.ts', [], {
    AFFECTED_TEST_PLAN: JSON.stringify(plan),
  });
  assert.equal(plan.full, false);
  assert.deepEqual(
    keys(selected),
    keys(
      coreTests.filter(([file]) =>
        ['marketplace-overview.spec.ts', 'kleinanzeigen-accounts.spec.ts'].includes(file),
      ),
    ),
  );
  assert.equal(plan.pwa, false);
});

test('CI installiert den vollständigen Chromium und prüft die echte MV3-Wiederaufnahme', async () => {
  const { readFile } = await import('node:fs/promises');
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  const browserJob = ci.split('  browser-smoke:')[1]?.split('  pwa:')[0] ?? '';
  const install = browserJob.indexOf('name: Install Chromium for browser and extension tests');
  const extension = browserJob.indexOf('name: Run isolated Kleinanzeigen MV3 restart test');
  assert.ok(
    install >= 0 && extension > install,
    'MV3 muss im Browser-Job nach der Chromium-Installation laufen.',
  );
  assert.match(
    ci,
    /name: Run isolated Kleinanzeigen MV3 restart test[\s\S]*?run:\s+\|\s+node scripts\/kleinanzeigen-extension-browser.mjs\s+node scripts\/kleinanzeigen-publication-browser.mjs/u,
  );
  assert.match(
    ci,
    /name: Install Chromium for browser and extension tests\s+run: npx playwright install --with-deps chromium/u,
  );
});

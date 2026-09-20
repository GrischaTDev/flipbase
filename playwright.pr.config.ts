import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  // Vier bewährte Daten-/Geldpfade, Inserats- und Beta-Lebenszyklus sowie drei kleine Grenzprüfungen.
  // Das historische @pr-smoke allein macht einen Test nicht mehr zur Pflicht.
  grep: [
    /@core-smoke\b/,
    /keeps a saved draft editable through discard, save and reopening @pr-smoke\b/,
    /preserves purchase cost origin after reopening at 1440px @pr-smoke\b/,
    /keeps per-item tax visible in the tax journal @pr-smoke\b/,
    /verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke\b/,
    /creates, publishes and completes the listing lifecycle on mobile @pr-smoke\b/,
    /sperrt freie Registrierung und erlaubt Betreiber-Einladungen @pr-smoke\b/,
    /genehmigt eine Bewerbung und startet nach der Passwortvergabe 60 Beta-Tage @pr-smoke\b/,
  ],
  forbidOnly: true,
  retries: 0,
  maxFailures: 1,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    ...baseConfig.use,
    // Fehler-Screenshots bleiben aktiv. Traces nur bei gezielter Fehlersuche.
    trace: process.env['E2E_TRACE'] === '1' ? 'retain-on-failure' : 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

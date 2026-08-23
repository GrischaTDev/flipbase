export const environment = {
  production: true,
  supabaseUrl: 'http://127.0.0.1:54351',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  /**
   * Demo-Modus ohne Anmeldung. Zeigt ausschliesslich lokale Browser-Daten,
   * nie Serverdaten. Fuer den Web-Betrieb auf false setzen.
   */
  allowDemoMode: false,
  /**
   * Domain des Merk-Cookies, an dem die Landingpage erkennt, dass jemand
   * angemeldet ist. Der fuehrende Punkt gilt fuer flipbase.de und alle
   * Unterdomains. Leer bedeutet: kein Cookie, kein Hinweis.
   */
  landingHintCookieDomain: '.flipbase.de',
};

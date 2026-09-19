export const environment = {
  production: false,
  supabaseUrl: 'http://127.0.0.1:54351',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  /**
   * Lokal gibt es keine gemeinsame Domain zwischen App und Landingpage,
   * deshalb bleibt das Feld leer und der Dienst tut nichts.
   */
  landingHintCookieDomain: '',
  /**
   * Adresse der oeffentlichen Landingpage (Startseite).
   */
  landingUrl: 'https://flipbase.de',
};

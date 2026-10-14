(() => {
  const preferenceKey = 'flipbase_landing_theme';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let savedTheme = null;
  try {
    savedTheme = window.localStorage.getItem(preferenceKey);
  } catch {
    // Die Farbauswahl funktioniert auch mit gesperrtem Browserspeicher.
  }
  if (savedTheme !== 'light' && savedTheme !== 'dark') savedTheme = null;

  function applyTheme() {
    const theme = savedTheme ?? (systemTheme.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content =
      theme === 'dark' ? '#16181d' : '#f4f5f7';
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren',
    );
    button.title = button.getAttribute('aria-label');
    button.querySelector('use').setAttribute('href', theme === 'dark' ? '#icon-sun' : '#icon-moon');
  }

  // Vor dem ersten Zeichnen setzen, damit eine gespeicherte Auswahl nicht aufblitzt.
  applyTheme();
  systemTheme.addEventListener('change', applyTheme);
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      const button = document.getElementById('theme-toggle');
      button.hidden = false;
      button.addEventListener('click', () => {
        savedTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        try {
          window.localStorage.setItem(preferenceKey, savedTheme);
        } catch {
          // Die Auswahl gilt ohne Speicherzugriff für die geöffnete Seite.
        }
        applyTheme();
      });
      applyTheme();
    },
    { once: true },
  );
})();

(function () {
  var THEME_KEY = 'flipbase_landing_theme';
  var LANGUAGE_KEY = 'flipbase_landing_language';
  var themeToggle = document.getElementById('theme-toggle');
  var languageToggle = document.getElementById('lang-toggle');
  var systemLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
  var pageMetadata = {
    de: {
      title: 'Flipbase: Reselling-Software für Vinted, eBay & Kleinanzeigen',
      description:
        'Reselling ohne Excel: Flipbase verbindet Einkauf, Bestand, Verkäufe, Ausgaben und Steuerdaten mit Vinted Bot, Bildern und Kleinanzeigen-Inseraten.',
    },
    en: {
      title: 'Flipbase: Reselling software for Vinted, eBay & Kleinanzeigen',
      description:
        'Reselling beyond spreadsheets: Flipbase connects purchases, inventory, sales, expenses, and accounting data with Vinted finds, photos, and listings.',
    },
  };

  function updatePageLanguage(language) {
    document.documentElement.lang = language;
    document.title = pageMetadata[language].title;
    document.querySelector('meta[name="description"]').content = pageMetadata[language].description;
  }

  function readPreference(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function savePreference(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Die Schalter funktionieren auch, wenn der Browser Speicher blockiert.
    }
  }

  function systemUsesLight() {
    return systemLight ? systemLight.matches : false;
  }

  function visibleTheme() {
    return themeToggle.checked !== systemUsesLight() ? 'light' : 'dark';
  }

  function updateThemeColor() {
    document.querySelector('meta[name="theme-color"]').content =
      visibleTheme() === 'light' ? '#f4f5f7' : '#16181d';
  }

  var savedTheme = readPreference(THEME_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    themeToggle.checked = (savedTheme === 'light') !== systemUsesLight();
  } else {
    savedTheme = null;
  }
  updateThemeColor();

  themeToggle.addEventListener('change', function () {
    savedTheme = visibleTheme();
    savePreference(THEME_KEY, savedTheme);
    updateThemeColor();
  });

  if (systemLight && systemLight.addEventListener) {
    systemLight.addEventListener('change', function () {
      if (savedTheme) themeToggle.checked = (savedTheme === 'light') !== systemUsesLight();
      updateThemeColor();
    });
  }

  languageToggle.checked = readPreference(LANGUAGE_KEY) === 'en';
  updatePageLanguage(languageToggle.checked ? 'en' : 'de');
  languageToggle.addEventListener('change', function () {
    var language = languageToggle.checked ? 'en' : 'de';
    updatePageLanguage(language);
    savePreference(LANGUAGE_KEY, language);
  });

  var siteHeader = document.querySelector('.site-header');
  var navMenuButton = document.getElementById('nav-menu-button');
  var landingNavigation = document.getElementById('landing-navigation');

  function setNavigationOpen(open, returnFocus) {
    siteHeader.classList.toggle('nav-open', open);
    navMenuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open && returnFocus) navMenuButton.focus();
  }

  navMenuButton.addEventListener('click', function () {
    setNavigationOpen(navMenuButton.getAttribute('aria-expanded') !== 'true', false);
  });

  landingNavigation.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      setNavigationOpen(false, false);
    });
  });

  document.addEventListener('click', function (event) {
    if (
      navMenuButton.getAttribute('aria-expanded') === 'true' &&
      !siteHeader.contains(event.target)
    ) {
      setNavigationOpen(false, false);
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || navMenuButton.getAttribute('aria-expanded') !== 'true') return;
    event.preventDefault();
    setNavigationOpen(false, true);
  });
})();

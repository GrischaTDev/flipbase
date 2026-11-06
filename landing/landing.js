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
        'Einkäufe erfassen, Belege zuordnen, Verkäufe nachvollziehen: Flipbase verbindet deine Unterlagen, Kosten und Marktplätze für dein Reselling.',
    },
    en: {
      title: 'Flipbase: Reselling software for Vinted, eBay & Kleinanzeigen',
      description:
        'Record purchases, organize receipts, and track sales: Flipbase connects your documents, costs, and marketplaces for your reselling.',
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

// Vorschauen bleiben ruhig. Der Ablauf und der Zuschnitt reagieren ausschließlich
// auf die bewusste Auswahl per Maus, Touch oder Tastatur.
(function () {
  var tabList = document.querySelector('.workflow-tabs');
  if (!tabList || !window.matchMedia) return;
  var stepButtons = Array.prototype.slice.call(tabList.querySelectorAll('[data-step]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.workflow-panel'));
  var mobileLayout = window.matchMedia('(max-width: 760px)');

  function selectStep(index) {
    stepButtons.forEach(function (button, buttonIndex) {
      var selected = buttonIndex === index;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      panels[buttonIndex].hidden = !selected;
    });
  }
  stepButtons.forEach(function (button, index) {
    button.addEventListener('click', function () {
      selectStep(index);
    });
    button.addEventListener('keydown', function (event) {
      var nextIndex = index;
      var nextKey = mobileLayout.matches ? 'ArrowRight' : 'ArrowDown';
      var previousKey = mobileLayout.matches ? 'ArrowLeft' : 'ArrowUp';
      if (event.key === nextKey) nextIndex = (index + 1) % stepButtons.length;
      else if (event.key === previousKey)
        nextIndex = (index + stepButtons.length - 1) % stepButtons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = stepButtons.length - 1;
      else return;
      event.preventDefault();
      selectStep(nextIndex);
      stepButtons[nextIndex].focus();
    });
  });
  function syncOrientation() {
    tabList.setAttribute('aria-orientation', mobileLayout.matches ? 'horizontal' : 'vertical');
  }
  mobileLayout.addEventListener('change', syncOrientation);

  var cropControls = document.querySelector('.crop-controls');
  if (cropControls) {
    var cropButtons = Array.prototype.slice.call(cropControls.querySelectorAll('[data-crop]'));
    cropButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        document.getElementById('crop-photo').dataset.ratio = button.dataset.crop;
        document.getElementById('crop-dimensions').textContent =
          button.dataset.crop === 'square' ? '1 : 1' : '4 : 5';
        cropButtons.forEach(function (candidate) {
          candidate.setAttribute('aria-pressed', String(candidate === button));
        });
      });
    });
    cropControls.hidden = false;
  }
  selectStep(0);
  syncOrientation();
  tabList.hidden = false;
})();

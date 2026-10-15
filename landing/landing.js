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

// Beispielbilder: Animationen laufen nur sichtbar, bei sichtbarem Tab und ohne reduzierte
// Bewegung. Pausiert oder reduziert zeigen alle Szenen ihren vollständigen Endzustand.
(function () {
  var motionButton = document.getElementById('motion-toggle');
  var profitScene = document.getElementById('profit-scene');
  var workflowScene = document.getElementById('workflow-scene');
  var tabList = document.querySelector('.workflow-tabs');
  if (!motionButton || !profitScene || !workflowScene || !tabList || !window.matchMedia) return;
  var stepButtons = Array.prototype.slice.call(tabList.querySelectorAll('[data-step]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.workflow-panel'));
  var replayButton = document.getElementById('workflow-replay');
  var toolScenes = Array.prototype.slice.call(document.querySelectorAll('[data-animated-scene]'));
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileLayout = window.matchMedia('(max-width: 760px)');
  var isPaused = false;
  var hasSelectedStep = false;
  var activeStep = 0;
  var profitPhase = 3;

  function selectStep(index) {
    activeStep = index;
    stepButtons.forEach(function (button, buttonIndex) {
      var isSelected = buttonIndex === index;
      button.setAttribute('aria-selected', String(isSelected));
      button.tabIndex = isSelected ? 0 : -1;
      panels[buttonIndex].hidden = !isSelected;
    });
  }

  function createCycle(element, advance, delay, canAdvance) {
    return {
      element: element,
      advance: advance,
      delay: delay,
      canAdvance:
        canAdvance ||
        function () {
          return true;
        },
      isVisible: false,
      timer: null,
    };
  }

  var cycles = [
    createCycle(
      profitScene,
      function () {
        profitPhase = (profitPhase + 1) % 4;
        profitScene.dataset.phase = String(profitPhase);
      },
      1800,
    ),
    createCycle(
      workflowScene,
      function () {
        selectStep((activeStep + 1) % panels.length);
      },
      6500,
      function () {
        return !hasSelectedStep;
      },
    ),
  ].concat(
    toolScenes.map(function (scene) {
      return createCycle(
        scene,
        function () {
          scene.dataset.frame = String((Number(scene.dataset.frame) + 1) % 4);
        },
        2000,
      );
    }),
  );

  function syncMotion() {
    var canAnimate = !isPaused && !reducedMotion.matches && !document.hidden;
    document.documentElement.dataset.motion = canAnimate ? 'on' : 'off';
    motionButton.disabled = reducedMotion.matches;
    motionButton.setAttribute('aria-pressed', String(isPaused || reducedMotion.matches));
    motionButton
      .querySelector('use')
      .setAttribute('href', isPaused || reducedMotion.matches ? '#icon-play' : '#icon-pause');

    if (reducedMotion.matches || isPaused) {
      profitPhase = 3;
      profitScene.dataset.phase = '3';
      toolScenes.forEach(function (scene) {
        scene.dataset.frame = '3';
      });
    }

    cycles.forEach(function (cycle) {
      var shouldRun = canAnimate && cycle.isVisible && cycle.canAdvance();
      if (!shouldRun && cycle.timer !== null) {
        window.clearInterval(cycle.timer);
        cycle.timer = null;
      } else if (shouldRun && cycle.timer === null) {
        cycle.timer = window.setInterval(cycle.advance, cycle.delay);
      }
    });
  }

  function selectManually(index) {
    hasSelectedStep = true;
    selectStep(index);
    syncMotion();
  }

  stepButtons.forEach(function (button, index) {
    button.addEventListener('click', function () {
      selectManually(index);
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
      selectManually(nextIndex);
      stepButtons[nextIndex].focus();
    });
  });

  // Kein automatischer Panelwechsel, während jemand mit dessen Inhalt arbeitet.
  workflowScene.addEventListener('focusin', function () {
    hasSelectedStep = true;
    syncMotion();
  });
  replayButton.addEventListener('click', function () {
    hasSelectedStep = false;
    selectStep(0);
    syncMotion();
  });
  motionButton.addEventListener('click', function () {
    isPaused = !isPaused;
    syncMotion();
  });
  document.addEventListener('visibilitychange', syncMotion);
  reducedMotion.addEventListener('change', syncMotion);
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
  motionButton.hidden = false;
  tabList.hidden = false;
  replayButton.hidden = false;
  syncMotion();

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          cycles.forEach(function (cycle) {
            if (cycle.element === entry.target) cycle.isVisible = entry.isIntersecting;
          });
        });
        syncMotion();
      },
      { threshold: 0.25 },
    );
    cycles.forEach(function (cycle) {
      observer.observe(cycle.element);
    });
  }
})();

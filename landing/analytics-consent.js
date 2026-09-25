(function () {
  var measurementId = 'G-8ZMSVBRJPK';
  var storageKey = 'flipbase_analytics_consent';
  var choiceLifetimeMs = 180 * 24 * 60 * 60 * 1000;
  var banner = document.getElementById('analytics-consent');
  var settingsButton = document.getElementById('analytics-settings');
  var acceptButton = document.getElementById('analytics-accept');
  var rejectButton = document.getElementById('analytics-reject');
  var saveButton = document.getElementById('analytics-save');
  var languageButton = document.getElementById('analytics-language');
  var languageToggle = document.getElementById('lang-toggle');
  var analyticsOptional = document.getElementById('analytics-optional');
  var overviewTab = document.getElementById('analytics-tab-overview');
  var detailsTab = document.getElementById('analytics-tab-details');
  var overviewPanel = document.getElementById('analytics-panel-overview');
  var detailsPanel = document.getElementById('analytics-panel-details');
  var pageRegions = Array.from(
    document.querySelectorAll('body > header, body > main, body > footer'),
  );
  var analyticsEnabled = false;
  var returnFocusTo = null;

  // Ohne gültigen Web-Datenstream gibt es weder Tracking noch eine Scheinwahl.
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;

  function readChoice() {
    try {
      var stored = JSON.parse(localStorage.getItem(storageKey));
      if (stored && stored.expires > Date.now()) return stored.value;
      localStorage.removeItem(storageKey);
      return null;
    } catch {
      return null;
    }
  }

  function saveChoice(value) {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ value: value, expires: Date.now() + choiceLifetimeMs }),
      );
    } catch {
      // Eine gesperrte Speicherung verhindert die Entscheidung für diese Seite nicht.
    }
  }

  function removeAnalyticsCookies() {
    document.cookie.split(';').forEach(function (part) {
      var name = part.trim().split('=')[0];
      if (name !== '_ga' && !name.startsWith('_ga_')) return;
      ['', '; Domain=flipbase.de', '; Domain=.flipbase.de'].forEach(function (domain) {
        document.cookie = name + '=; Path=/' + domain + '; Max-Age=0; Secure; SameSite=Lax';
      });
    });
  }

  function loadAnalytics() {
    if (document.getElementById('google-analytics-script')) return;

    window['ga-disable-' + measurementId] = false;
    window.dataLayer = window.dataLayer || [];
    analyticsEnabled = true;
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: 'none',
      cookie_expires: 13 * 30 * 24 * 60 * 60,
      cookie_update: false,
      page_location: location.origin + location.pathname,
      page_referrer: '',
    });

    var script = document.createElement('script');
    script.id = 'google-analytics-script';
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.append(script);
  }

  function gtag() {
    window.dataLayer.push(arguments);
  }

  function trackEvent(name) {
    if (!analyticsEnabled || window['ga-disable-' + measurementId]) return;
    gtag('event', name, {
      send_to: measurementId,
      page_location: location.origin + location.pathname,
      page_referrer: '',
    });
  }

  document.querySelectorAll('a[href="https://app.flipbase.de"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('app_link_click');
    });
  });

  document.addEventListener('flipbase:beta-application-created', function () {
    trackEvent('generate_lead');
  });

  function selectTab(details) {
    overviewTab.setAttribute('aria-selected', String(!details));
    detailsTab.setAttribute('aria-selected', String(details));
    overviewTab.tabIndex = details ? -1 : 0;
    detailsTab.tabIndex = details ? 0 : -1;
    overviewPanel.hidden = details;
    detailsPanel.hidden = !details;
    acceptButton.hidden = details;
    rejectButton.hidden = details;
    saveButton.hidden = !details;
  }

  function openConsent(details) {
    returnFocusTo = document.activeElement;
    analyticsOptional.checked = readChoice() === 'accepted';
    selectTab(details);
    banner.hidden = false;
    document.body.classList.add('analytics-dialog-open');
    pageRegions.forEach(function (region) {
      region.inert = true;
    });
    (details ? detailsTab : rejectButton).focus();
  }

  function closeConsent() {
    banner.hidden = true;
    document.body.classList.remove('analytics-dialog-open');
    pageRegions.forEach(function (region) {
      region.inert = false;
    });
    if (returnFocusTo && returnFocusTo !== document.body) returnFocusTo.focus();
    else settingsButton.focus();
  }

  function choose(value) {
    var previouslyAccepted = readChoice() === 'accepted';
    saveChoice(value);
    closeConsent();
    if (value === 'accepted') {
      loadAnalytics();
      return;
    }
    analyticsEnabled = false;
    window['ga-disable-' + measurementId] = true;
    removeAnalyticsCookies();
    if (previouslyAccepted) window.location.reload();
  }

  settingsButton.hidden = false;
  var choice = readChoice();
  if (choice === 'accepted') loadAnalytics();
  if (choice !== 'accepted' && choice !== 'rejected') openConsent(false);
  else if (location.hash === '#analyse-einstellungen') openConsent(true);

  settingsButton.addEventListener('click', function () {
    openConsent(true);
  });

  languageButton.addEventListener('click', function () {
    languageToggle.checked = !languageToggle.checked;
  });

  overviewTab.addEventListener('click', function () {
    selectTab(false);
  });
  detailsTab.addEventListener('click', function () {
    selectTab(true);
  });
  [overviewTab, detailsTab].forEach(function (tab) {
    tab.addEventListener('keydown', function (event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      var details = event.key === 'End' || (event.key === 'ArrowRight' && tab === overviewTab);
      selectTab(details);
      (details ? detailsTab : overviewTab).focus();
    });
  });

  acceptButton.addEventListener('click', function () {
    choose('accepted');
  });
  rejectButton.addEventListener('click', function () {
    choose('rejected');
  });
  saveButton.addEventListener('click', function () {
    choose(analyticsOptional.checked ? 'accepted' : 'rejected');
  });

  document.addEventListener('keydown', function (event) {
    if (banner.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (readChoice() === null) choose('rejected');
      else closeConsent();
      return;
    }
    if (event.key !== 'Tab') return;
    var focusable = Array.from(banner.querySelectorAll('button, input, a[href]')).filter(
      function (element) {
        return element.tabIndex >= 0 && !element.closest('[hidden]');
      },
    );
    var currentIndex = focusable.indexOf(document.activeElement);
    var nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= focusable.length) {
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
    }
  });
})();

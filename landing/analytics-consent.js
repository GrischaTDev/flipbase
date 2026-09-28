(function () {
  var measurementId = 'G-8ZMSVBRJPK';
  var storageKey = 'flipbase_analytics_consent';
  var choiceLifetimeMs = 180 * 24 * 60 * 60 * 1000;
  var banner = document.getElementById('analytics-consent');
  var consentPanel = document.getElementById('analytics-consent-panel');
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
  var journeyTrackingStarted = false;
  var returnFocusTo = null;

  // Ohne gültigen Web-Datenstream gibt es weder Tracking noch eine Scheinwahl.
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;
  // Lokale Vorschauen und die angemeldete App dürfen keine Live-Daten erzeugen.
  if (location.hostname !== 'flipbase.de' && location.hostname !== 'www.flipbase.de') return;

  function analyticsPageLocation() {
    var url = new URL(location.origin + location.pathname);
    var query = new URLSearchParams(location.search);
    var source = query.getAll('utm_source');
    var medium = query.getAll('utm_medium');
    var safeValue = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

    // Nur vollständige Kampagnenangaben mit unkritischen Werten übernehmen.
    if (source.length !== 1 || medium.length !== 1) return url.href;
    if (!safeValue.test(source[0]) || !safeValue.test(medium[0])) return url.href;
    url.searchParams.set('utm_source', source[0]);
    url.searchParams.set('utm_medium', medium[0]);
    ['utm_campaign', 'utm_id'].forEach(function (name) {
      var values = query.getAll(name);
      if (values.length === 1 && safeValue.test(values[0])) url.searchParams.set(name, values[0]);
    });
    return url.href;
  }

  function analyticsPageReferrer() {
    if (!document.referrer) return '';
    try {
      var referrer = new URL(document.referrer);
      var hostname = referrer.hostname.toLowerCase();
      if (referrer.protocol !== 'https:' && referrer.protocol !== 'http:') return '';
      if (hostname === 'flipbase.de' || hostname.endsWith('.flipbase.de')) return '';
      if (hostname === 'localhost' || hostname.endsWith('.local')) return '';
      if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) return '';
      // Pfad, Suchparameter und Fragment der vorherigen Website bleiben privat.
      return referrer.origin + '/';
    } catch {
      return '';
    }
  }

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
      page_location: analyticsPageLocation(),
      page_referrer: analyticsPageReferrer(),
    });

    startJourneyTracking();

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
      page_location: analyticsPageLocation(),
      page_referrer: analyticsPageReferrer(),
      page_title: document.title,
    });
  }

  function startJourneyTracking() {
    if (journeyTrackingStarted) return;
    journeyTrackingStarted = true;
    if (!('IntersectionObserver' in window)) return;

    var sectionEvents = {
      features: 'features_view',
      roadmap: 'roadmap_view',
      faq: 'faq_view',
      'beta-anmeldung': 'beta_form_view',
    };
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var eventName = sectionEvents[entry.target.id];
          if (!eventName) return;
          trackEvent(eventName);
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -35% 0px' },
    );
    Object.keys(sectionEvents).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }

  var betaCta = document.querySelector('.hero-beta-cta');
  if (betaCta) {
    betaCta.addEventListener('click', function () {
      trackEvent('beta_cta_click');
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
    consentPanel.focus({ preventScroll: true });
  }

  function closeConsent() {
    banner.hidden = true;
    document.body.classList.remove('analytics-dialog-open');
    pageRegions.forEach(function (region) {
      region.inert = false;
    });
    var focusTarget =
      returnFocusTo && returnFocusTo !== document.body
        ? returnFocusTo
        : document.querySelector('main h1');
    focusTarget.focus({ preventScroll: true });
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

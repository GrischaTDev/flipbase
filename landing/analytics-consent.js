(function () {
  // Die GA4-Mess-ID wird erst nach Einrichtung des Web-Datenstreams gesetzt.
  var measurementId = '';
  var storageKey = 'flipbase_analytics_consent';
  var choiceLifetimeMs = 180 * 24 * 60 * 60 * 1000;
  var banner = document.getElementById('analytics-consent');
  var settingsButton = document.getElementById('analytics-settings');
  var acceptButton = document.getElementById('analytics-accept');
  var rejectButton = document.getElementById('analytics-reject');

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
    function gtag() {
      window.dataLayer.push(arguments);
    }
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

  settingsButton.hidden = false;
  var choice = readChoice();
  if (choice === 'accepted') loadAnalytics();
  else if (choice !== 'rejected') banner.hidden = false;
  if (location.hash === '#analyse-einstellungen') banner.hidden = false;

  settingsButton.addEventListener('click', function () {
    banner.hidden = false;
    rejectButton.focus();
  });

  acceptButton.addEventListener('click', function () {
    saveChoice('accepted');
    banner.hidden = true;
    loadAnalytics();
    settingsButton.focus();
  });

  rejectButton.addEventListener('click', function () {
    var previouslyAccepted = readChoice() === 'accepted';
    saveChoice('rejected');
    banner.hidden = true;
    window['ga-disable-' + measurementId] = true;
    removeAnalyticsCookies();
    if (previouslyAccepted) window.location.reload();
    else settingsButton.focus();
  });
})();

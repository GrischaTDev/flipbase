// Die Navigation wechselt zwischen lokalen Originalaufnahmen.
// Es gibt keine Anwendungs- oder Anbieteraufrufe.
(function () {
  function initializeProductDemo(preview) {
    function find(id) {
      return preview.querySelector('[id="' + id + '"], [id$="-' + id + '"]');
    }
    var navigation = preview.querySelector('[role="tablist"]');
    var tabs = Array.prototype.slice.call(preview.querySelectorAll('[data-demo-page]'));
    var panels = Array.prototype.slice.call(preview.querySelectorAll('.demo-panel'));
    var pageViewport = preview.querySelector('.demo-pages');
    var languageToggle = document.getElementById('lang-toggle');
    var orientation = window.matchMedia && window.matchMedia('(max-width: 760px)');
    var locale = function () {
      return languageToggle && languageToggle.checked ? 'en-GB' : 'de-DE';
    };
    function isEnglish() {
      return locale() === 'en-GB';
    }
    var notifications = preview.querySelector('[data-demo-notifications]');
    var notificationToggle = preview.querySelector('[data-demo-notification-toggle]');
    var notificationMenu = preview.querySelector('[data-demo-notification-menu]');
    function setNotificationsOpen(open, returnFocus) {
      if (!notificationMenu) return;
      notificationMenu.hidden = !open;
      notificationToggle.setAttribute('aria-expanded', String(open));
      if (!open && returnFocus) notificationToggle.focus({ preventScroll: true });
    }
    function updateNotifications() {
      if (!notifications) return;
      var items = Array.prototype.slice.call(
        notifications.querySelectorAll('[data-demo-notification-item]'),
      );
      var unread = items.filter(function (item) {
        return item.dataset.unread === 'true';
      }).length;
      notifications.querySelectorAll('[data-demo-notification-count]').forEach(function (count) {
        count.textContent = String(unread);
      });
      notifications.querySelectorAll('[data-demo-notification-badge]').forEach(function (badge) {
        badge.hidden = unread === 0;
      });
      notifications.querySelector('[data-demo-notification-list]').hidden = items.length === 0;
      notifications.querySelector('[data-demo-notification-empty]').hidden = items.length > 0;
    }
    function notificationEntries() {
      return Array.prototype.slice.call(
        notifications.querySelectorAll('[data-demo-notification-target]'),
      );
    }
    if (notifications) {
      notificationToggle.disabled = false;
      notificationToggle.addEventListener('click', function () {
        setNotificationsOpen(notificationMenu.hidden, false);
      });
      notificationToggle.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        setNotificationsOpen(true, false);
        var entries = notificationEntries();
        var entry = event.key === 'ArrowUp' ? entries[entries.length - 1] : entries[0];
        if (entry) entry.focus();
        else notificationMenu.focus();
      });
      notificationEntries().forEach(function (entry) {
        entry.addEventListener('click', function () {
          entry.closest('[data-demo-notification-item]').dataset.unread = 'false';
          updateNotifications();
          activatePage(entry.dataset.demoNotificationTarget, true);
          find('demo-panel-' + entry.dataset.demoNotificationTarget).focus({ preventScroll: true });
        });
        entry.addEventListener('keydown', function (event) {
          var entries = notificationEntries();
          var index = entries.indexOf(entry);
          var target;
          if (event.key === 'ArrowDown') target = (index + 1) % entries.length;
          else if (event.key === 'ArrowUp') target = (index + entries.length - 1) % entries.length;
          else if (event.key === 'Home') target = 0;
          else if (event.key === 'End') target = entries.length - 1;
          else return;
          event.preventDefault();
          entries[target].focus();
        });
      });
      notifications
        .querySelector('[data-demo-notification-read]')
        .addEventListener('click', function () {
          notifications.querySelectorAll('[data-demo-notification-item]').forEach(function (item) {
            item.dataset.unread = 'false';
          });
          updateNotifications();
          find('demo-page-announcement').textContent = isEnglish()
            ? 'All notifications marked as read.'
            : 'Alle Benachrichtigungen als gelesen markiert.';
        });
      notifications
        .querySelector('[data-demo-notification-clear]')
        .addEventListener('click', function () {
          notifications.querySelectorAll('[data-demo-notification-item]').forEach(function (item) {
            item.remove();
          });
          updateNotifications();
          find('demo-page-announcement').textContent = isEnglish()
            ? 'Notifications cleared.'
            : 'Benachrichtigungsverlauf geleert.';
        });
      document.addEventListener('click', function (event) {
        if (!notificationMenu.hidden && !notifications.contains(event.target))
          setNotificationsOpen(false, false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !notificationMenu.hidden) {
          event.preventDefault();
          setNotificationsOpen(false, true);
        }
      });
      notifications.addEventListener('focusout', function (event) {
        if (!notificationMenu.hidden && !notifications.contains(event.relatedTarget))
          setNotificationsOpen(false, false);
      });
      updateNotifications();
    }

    function pageName(tab) {
      return Array.prototype.slice
        .call(tab.querySelectorAll(isEnglish() ? '.lang-en' : '.lang-de'))
        .map(function (label) {
          return label.textContent.trim();
        })
        .join(' ');
    }
    function activatePage(key, announce) {
      var selected = tabs.find(function (tab) {
        return tab.dataset.demoPage === key;
      });
      if (!selected) return;
      setNotificationsOpen(false, false);
      tabs.forEach(function (tab) {
        var current = tab === selected;
        tab.setAttribute('aria-selected', String(current));
        tab.tabIndex = current ? 0 : -1;
        tab.classList.toggle('replica-nav-active', current);
        if (current) tab.setAttribute('data-nav-active', '');
        else tab.removeAttribute('data-nav-active');
      });
      panels.forEach(function (panel) {
        panel.hidden = panel !== find('demo-panel-' + key);
      });
      pageViewport.scrollTop = 0;
      if (announce) find('demo-page-announcement').textContent = pageName(selected) + ' · Demo';
    }
    function syncOrientation() {
      navigation.setAttribute(
        'aria-orientation',
        orientation && orientation.matches ? 'horizontal' : 'vertical',
      );
    }
    tabs.forEach(function (tab, index) {
      tab.disabled = false;
      tab.addEventListener('click', function () {
        activatePage(tab.dataset.demoPage, true);
      });
      tab.addEventListener('keydown', function (event) {
        var horizontal = orientation && orientation.matches;
        var next = horizontal ? 'ArrowRight' : 'ArrowDown';
        var previous = horizontal ? 'ArrowLeft' : 'ArrowUp';
        var target = index;
        if (event.key === next) target = (index + 1) % tabs.length;
        else if (event.key === previous) target = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[target].focus();
        activatePage(tabs[target].dataset.demoPage, true);
        if (typeof tabs[target].scrollIntoView === 'function')
          tabs[target].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    });
    if (orientation && orientation.addEventListener)
      orientation.addEventListener('change', syncOrientation);

    function syncLanguage() {
      if (notificationToggle)
        notificationToggle.title = isEnglish() ? 'Notifications' : 'Benachrichtigungen';
      preview.querySelectorAll('[data-demo-image]').forEach(function (image) {
        image.alt = isEnglish() ? image.dataset.altEn : image.dataset.altDe;
      });
    }
    if (languageToggle) languageToggle.addEventListener('change', syncLanguage);
    syncLanguage();
    syncOrientation();
    activatePage('overview', false);
  }
  var compact = document.getElementById('dashboard-replica');
  var expandedSection = document.getElementById('demo');
  var expandedHost = document.querySelector('[data-demo-expanded-host]');
  if (compact && expandedHost && expandedSection) {
    compact.setAttribute('data-product-demo', 'compact');
    var expanded = compact.cloneNode(true);
    expanded.id = 'expanded-product-demo';
    expanded.classList.add('demo-expanded');
    expanded.setAttribute('data-product-demo', 'expanded');
    expanded.setAttribute('aria-labelledby', 'expanded-demo-label');
    var ids = {};
    expanded.querySelectorAll('[id]').forEach(function (element) {
      ids[element.id] = 'large-' + element.id;
      element.id = ids[element.id];
    });
    expanded
      .querySelectorAll('[aria-controls], [aria-labelledby], [aria-describedby], [for]')
      .forEach(function (element) {
        ['aria-controls', 'aria-labelledby', 'aria-describedby', 'for'].forEach(
          function (attribute) {
            var value = element.getAttribute(attribute);
            if (value)
              element.setAttribute(
                attribute,
                value
                  .split(/\s+/)
                  .map(function (id) {
                    return ids[id] || id;
                  })
                  .join(' '),
              );
          },
        );
      });
    expandedHost.appendChild(expanded);
    expandedSection.hidden = false;
    document.querySelectorAll('[data-demo-link]').forEach(function (link) {
      link.hidden = false;
    });
  }
  document.querySelectorAll('[data-product-demo]').forEach(initializeProductDemo);
})();

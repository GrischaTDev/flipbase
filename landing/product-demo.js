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

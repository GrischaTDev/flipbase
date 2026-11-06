// Die Produktdemo bleibt vollständig lokal. Navigation und Beispielaktionen
// verändern ausschließlich die folgenden Demodaten und ihre Darstellung.
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
    var activePage = 'overview';
    var period = preview.querySelector('[data-demo-period]');
    var platform = preview.querySelector('[data-demo-platform]');
    var feedFilter = 'all';
    var locale = function () {
      return languageToggle && languageToggle.checked ? 'en-GB' : 'de-DE';
    };
    function isEnglish() {
      return locale() === 'en-GB';
    }
    function currency(value) {
      return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(value);
    }
    function percent(value) {
      return new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(value) + ' %';
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
      activePage = key;
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
    preview.querySelectorAll('[data-demo-go]').forEach(function (button) {
      button.addEventListener('click', function () {
        activatePage(button.dataset.demoGo, true);
        find('demo-panel-' + activePage).focus({ preventScroll: true });
      });
    });
    if (orientation && orientation.addEventListener)
      orientation.addEventListener('change', syncOrientation);

    var yearly = {
      all: { revenue: 7824, profit: 2632, expenses: 5860, sales: 214 },
      vinted: { revenue: 4300, profit: 1498, expenses: 3100, sales: 122 },
      ebay: { revenue: 2400, profit: 720, expenses: 1900, sales: 60 },
      kleinanzeigen: { revenue: 1124, profit: 414, expenses: 860, sales: 32 },
    };
    var monthly = {
      all: { revenue: 1284, profit: 412, expenses: 900, sales: 36 },
      vinted: { revenue: 706, profit: 234, expenses: 476, sales: 20 },
      ebay: { revenue: 394, profit: 113, expenses: 291, sales: 10 },
      kleinanzeigen: { revenue: 184, profit: 65, expenses: 133, sales: 6 },
    };
    var overview = find('demo-panel-overview');
    var initialRows = Array.prototype.slice.call(overview.querySelectorAll('.replica-sale'));
    var rowTemplates = initialRows.map(function (row) {
      return row.cloneNode(true);
    });
    var chartMonths = Array.prototype.slice.call(overview.querySelectorAll('.replica-month'));
    var baseSeries = {};
    ['revenue', 'expenses', 'profit'].forEach(function (series) {
      baseSeries[series] = chartMonths.map(function (month) {
        return Number(
          month.querySelector('[data-series="' + series + '"]').style.getPropertyValue('--value'),
        );
      });
    });
    function distribute(total, weights) {
      var weightSum = weights.reduce(function (sum, value) {
        return sum + value;
      }, 0);
      var remaining = Math.round(total * 100);
      return weights.map(function (weight, index) {
        var lastNonzero = weights.slice(index + 1).every(function (value) {
          return value === 0;
        });
        var cents = lastNonzero ? remaining : Math.round((total * 100 * weight) / weightSum);
        remaining -= cents;
        return cents / 100;
      });
    }
    function updateOverview() {
      var key = Object.prototype.hasOwnProperty.call(yearly, platform.value)
        ? platform.value
        : 'all';
      var monthOnly = period.value === 'month';
      var summary = (monthOnly ? monthly : yearly)[key];
      var values = {
        revenue: currency(summary.revenue),
        'gross-profit': currency(summary.profit),
        margin: percent((summary.profit / summary.revenue) * 100),
        sales: String(summary.sales),
      };
      Object.keys(values).forEach(function (name) {
        overview.querySelector('[data-kpi="' + name + '"] [data-kpi-value]').textContent =
          values[name];
      });
      ['revenue', 'expenses', 'profit'].forEach(function (series) {
        var data = monthOnly
          ? chartMonths.map(function (_, index) {
              return index === 9 ? summary[series] : 0;
            })
          : distribute(summary[series], baseSeries[series]);
        chartMonths.forEach(function (month, index) {
          month
            .querySelector('[data-series="' + series + '"]')
            .style.setProperty('--value', String(data[index]));
        });
      });
      overview.querySelectorAll('.replica-sale').forEach(function (row) {
        row.remove();
      });
      var table = overview.querySelector('.replica-sales-heading').parentElement;
      rowTemplates
        .filter(function (row) {
          return (
            key === 'all' ||
            row.querySelector('.replica-platform').textContent.toLowerCase() === key
          );
        })
        .forEach(function (template) {
          table.appendChild(template.cloneNode(true));
        });
    }
    period.addEventListener('change', updateOverview);
    platform.addEventListener('change', updateOverview);

    function updateFeed() {
      var count = 0;
      preview.querySelectorAll('[data-demo-feed-item]').forEach(function (item) {
        var favorite = item.dataset.demoFavorited === 'true';
        if (favorite) count++;
        item.hidden = feedFilter === 'favorites' && !favorite;
      });
      preview.querySelector('[data-demo-favorite-count]').textContent = String(count);
      preview.querySelector('[data-demo-feed-empty]').hidden =
        feedFilter !== 'favorites' || count > 0;
    }
    preview.querySelectorAll('[data-demo-feed-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        feedFilter = button.dataset.demoFeedFilter;
        preview.querySelectorAll('[data-demo-feed-filter]').forEach(function (candidate) {
          candidate.setAttribute('aria-pressed', String(candidate === button));
        });
        updateFeed();
      });
    });
    preview.querySelectorAll('[data-demo-favorite]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = button.closest('[data-demo-feed-item]');
        var favorite = item.dataset.demoFavorited !== 'true';
        item.dataset.demoFavorited = String(favorite);
        button.setAttribute('aria-pressed', String(favorite));
        updateFeed();
      });
    });
    var brandSearch = find('demo-brand-search');
    brandSearch.addEventListener('input', function () {
      var search = brandSearch.value.trim().toLowerCase();
      var count = 0;
      preview.querySelectorAll('[data-demo-brand]').forEach(function (item) {
        item.hidden = !item.dataset.demoBrand.includes(search);
        if (!item.hidden) count++;
      });
      preview.querySelector('[data-demo-brand-empty]').hidden = count > 0;
    });
    var chart = find('demo-accounting-chart');
    var exportButton = preview.querySelector('[data-demo-export]');
    var exportPreview = find('demo-export-preview');
    function updateExport() {
      var framework = chart.value === 'SKR04' ? 'SKR04' : 'SKR03';
      exportPreview.textContent =
        (isEnglish() ? 'Chart of accounts;' : 'Kontenrahmen;') +
        framework +
        '\n' +
        (isEnglish() ? 'Date;Receipt;Amount' : 'Datum;Beleg;Betrag') +
        '\n12.10.2026;Kaufbeleg.pdf;12,00\n28.10.2026;Verpackung.pdf;31,00\n31.10.2026;VK-0025;39,00';
    }
    exportButton.addEventListener('click', function () {
      exportPreview.hidden = !exportPreview.hidden;
      exportButton.setAttribute('aria-expanded', String(!exportPreview.hidden));
      updateExport();
    });
    chart.addEventListener('change', updateExport);
    var brightness = find('demo-photo-brightness');
    var photo = preview.querySelector('[data-demo-photo]');
    var output = preview.querySelector('[data-demo-photo-ratio]');
    function updatePhoto() {
      var value = Number(brightness.value);
      value = Number.isFinite(value) ? Math.max(80, Math.min(120, value)) : 100;
      photo.style.filter = 'brightness(' + value / 100 + ')';
      preview.querySelector('[data-demo-brightness-value]').textContent = value + ' %';
    }
    function setPhotoFormat(format) {
      output.dataset.demoPhotoRatio = format;
      preview.querySelectorAll('[data-demo-photo-format]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.demoPhotoFormat === format));
      });
    }
    preview.querySelectorAll('[data-demo-photo-format]').forEach(function (button) {
      button.addEventListener('click', function () {
        setPhotoFormat(button.dataset.demoPhotoFormat);
      });
    });
    brightness.addEventListener('input', updatePhoto);
    preview.querySelector('[data-demo-photo-reset]').addEventListener('click', function () {
      brightness.value = '100';
      setPhotoFormat('portrait');
      updatePhoto();
    });
    function syncLanguage() {
      preview.querySelectorAll('option[data-de]').forEach(function (option) {
        option.textContent = isEnglish() ? option.dataset.en : option.dataset.de;
      });
      updateOverview();
      updateExport();
    }
    if (languageToggle) languageToggle.addEventListener('change', syncLanguage);
    syncLanguage();
    updateFeed();
    updatePhoto();
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

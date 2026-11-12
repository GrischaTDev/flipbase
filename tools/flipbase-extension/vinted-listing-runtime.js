// Gemeinsamer Formularvertrag für lokale Erweiterung und Cloud-Ausführung.
(function exposeListingRuntime(root) {
  'use strict';
  const patterns = {
    category: /^catalog-(?:(?:suggestion-)?([1-9][0-9]*)|search-([1-9][0-9]*)-result)$/,
    accessory_department: /^accessory_department-([1-9][0-9]*)$/,
    brand: /^(?:suggested-)?brand-([1-9][0-9]*)$/,
    size: /^size-group-([1-9][0-9]*)-grid-option-([1-9][0-9]*)$/,
    condition: /^condition-([1-9][0-9]*)$/,
    color: /^color-([1-9][0-9]*)$/,
    // Am 12.10.2026 an der echten Maske gemessen: Vorschläge heißen material-suggestion-<id>.
    material: /^material-(?:suggestion-)?([1-9][0-9]*)$/,
    package: /^package_type_selector_([1-9][0-9]*)$/,
  };
  // Zusatzmerkmale einer Kategorie: Auswahlfelder als `<code>` mit Vinted-Kennungen (mehrere
  // kommagetrennt, z. B. `skirt_length: "392"`), freie Felder als `text_<name>` (z. B.
  // `text_shoulder_width: "45"`). Die Zielgruppe trägt zusätzlich ihre Bezeichnung.
  function validAttributes(attributes) {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return false;
    const keys = Object.keys(attributes);
    if (keys.length > 40) return false;
    const safe = (value, limit) =>
      typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= limit &&
      !/[\x00-\x1f\x7f]/.test(value);
    for (const key of keys) {
      const value = attributes[key];
      if (key === 'accessory_department_label') {
        if (!keys.includes('accessory_department') || !safe(value, 2000)) return false;
      } else if (/^text_[a-z][a-z0-9_]{0,39}$/.test(key)) {
        if (!safe(value, 200)) return false;
      } else if (/^[a-z][a-z0-9_]{0,39}$/.test(key) && !key.endsWith('_label')) {
        if (
          typeof value !== 'string' ||
          !/^[1-9][0-9]{0,9}(?:,[1-9][0-9]{0,9}){0,9}$/.test(value) ||
          value.split(',').some((id) => !Number.isSafeInteger(Number(id))) ||
          new Set(value.split(',')).size !== value.split(',').length ||
          (key === 'accessory_department' &&
            (value.includes(',') || !keys.includes('accessory_department_label')))
        )
          return false;
      } else return false;
    }
    return true;
  }
  function invalid() {
    throw new Error('Die Vinted-Auswahl konnte nicht eindeutig gelesen werden.');
  }
  function numeric(value) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) invalid();
    return number;
  }
  // Größen können aus mehreren Gruppen stammen: Am 06.11.2026 zeigte die echte Maske bei
  // Herrenjeans zwei Gruppen zugleich, bei Damenjeans sechs Gruppen zum Umschalten. Jede
  // Größe trägt ihre Gruppe; die Feldgruppe ist die erste gelesene.
  function parseChoices(field, input) {
    if (
      !Object.hasOwn(patterns, field) ||
      !Array.isArray(input) ||
      input.length === 0 ||
      input.length > 10000
    )
      invalid();
    const choices = new Map();
    const groups = new Set();
    for (const value of input) {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).length !== 4 ||
        typeof value.id !== 'string' ||
        typeof value.label !== 'string' ||
        !value.label.trim() ||
        value.label.length > 2000 ||
        /[\x00-\x1f\x7f]/.test(value.label) ||
        typeof value.selected !== 'boolean' ||
        typeof value.disabled !== 'boolean'
      )
        invalid();
      const emptyBrand = field === 'brand' && value.id === 'empty-brand';
      const match = patterns[field].exec(value.id);
      if (!emptyBrand && !match) invalid();
      const sizeGroupId = field === 'size' ? numeric(match[1]) : null;
      if (sizeGroupId !== null) groups.add(sizeGroupId);
      const id = emptyBrand
        ? null
        : numeric(field === 'category' ? (match[1] ?? match[2]) : match[field === 'size' ? 2 : 1]);
      const label = value.label.trim();
      const existing = choices.get(id);
      if (existing && (existing.label !== label || existing.sizeGroupId !== sizeGroupId)) invalid();
      choices.set(id, {
        id,
        label,
        sizeGroupId,
        selected: value.selected || Boolean(existing?.selected),
        disabled: value.disabled && (existing?.disabled ?? true),
      });
    }
    const result = [...choices.values()];
    const max = field === 'color' ? 2 : field === 'material' ? 3 : 1;
    if (result.filter((choice) => choice.selected).length > max) invalid();
    return { field, sizeGroupId: [...groups][0] ?? null, choices: result };
  }

  /** Prüft übertragene Formularwerte; keine Texte, Fotos, URLs oder Sitzungsdaten im Ergebnis. */
  function parseCategoryFields(input, expectedCategoryId) {
    const exact = (value, keys) =>
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key));
    const safeText = (value, limit) =>
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= limit &&
      value === value.trim() &&
      ![...value].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      );
    const stringList = (value, limit, predicate) =>
      Array.isArray(value) &&
      value.length <= limit &&
      new Set(value).size === value.length &&
      value.every(predicate);
    if (
      !Number.isSafeInteger(expectedCategoryId) ||
      expectedCategoryId <= 0 ||
      !exact(input, [
        'categoryId',
        'fields',
        'unknownFields',
        'acceptedPhotoMimeTypes',
        'titleMaxLength',
        'descriptionMaxLength',
        'aiPhoto',
        'bump',
      ]) ||
      input.categoryId !== expectedCategoryId ||
      !Array.isArray(input.fields) ||
      input.fields.length > 7 ||
      !stringList(input.unknownFields, 50, (value) => safeText(value, 2000)) ||
      !stringList(
        input.acceptedPhotoMimeTypes,
        20,
        (value) =>
          typeof value === 'string' &&
          value.length <= 100 &&
          /^(?:image\/(?:[a-z0-9.+-]+|\*)|\.[a-z0-9]+)$/.test(value),
      ) ||
      ![input.titleMaxLength, input.descriptionMaxLength].every(
        (value) => value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 20000),
      ) ||
      ![input.aiPhoto, input.bump].every((value) => value === null || typeof value === 'boolean')
    )
      invalid();
    const fields = [],
      seen = new Set();
    for (const field of input.fields) {
      if (
        !exact(field, ['field', 'choices', 'sizeGroupId']) ||
        ![
          'brand',
          'size',
          'condition',
          'color',
          'material',
          'package',
          'accessory_department',
        ].includes(field.field) ||
        seen.has(field.field) ||
        !Array.isArray(field.choices) ||
        field.choices.length > 10000 ||
        (field.field === 'size'
          ? !Number.isSafeInteger(field.sizeGroupId) || field.sizeGroupId <= 0
          : field.sizeGroupId !== null)
      )
        invalid();
      seen.add(field.field);
      const ids = new Set();
      const choices = field.choices.map((choice) => {
        if (
          !exact(choice, ['id', 'label', 'selected', 'disabled', 'sizeGroupId']) ||
          (choice.id === null
            ? field.field !== 'brand' || choice.label !== 'Keine Marke'
            : !Number.isSafeInteger(choice.id) || choice.id <= 0) ||
          ids.has(choice.id) ||
          (field.field === 'size'
            ? !Number.isSafeInteger(choice.sizeGroupId) || choice.sizeGroupId <= 0
            : choice.sizeGroupId !== null) ||
          !safeText(choice.label, 2000) ||
          typeof choice.selected !== 'boolean' ||
          typeof choice.disabled !== 'boolean'
        )
          invalid();
        ids.add(choice.id);
        const id =
          field.field === 'size'
            ? `size-group-${choice.sizeGroupId}-grid-option-${choice.id}`
            : field.field === 'package'
              ? 'package_type_selector_' + choice.id
              : choice.id === null
                ? 'empty-brand'
                : field.field + '-' + choice.id;
        return { id, label: choice.label, selected: choice.selected, disabled: choice.disabled };
      });
      const parsed = parseChoices(field.field, choices);
      if (field.field === 'size') {
        // Die Feldgruppe muss eine der gelieferten Gruppen sein.
        if (!field.choices.some((choice) => choice.sizeGroupId === field.sizeGroupId)) invalid();
        fields.push({ ...parsed, sizeGroupId: field.sizeGroupId });
      } else fields.push(parsed);
    }
    return {
      categoryId: expectedCategoryId,
      fields,
      unknownFields: [...input.unknownFields],
      acceptedPhotoMimeTypes: [...input.acceptedPhotoMimeTypes],
      titleMaxLength: input.titleMaxLength,
      descriptionMaxLength: input.descriptionMaxLength,
      aiPhoto: input.aiPhoto,
      bump: input.bump,
    };
  }

  // Selbstständig serialisierbar: liest nur sichtbare Formularoptionen, keine Seitendaten.
  function collectChoices(field) {
    const selectors = {
      category: '[role="radio"][id^="catalog-"]',
      accessory_department: '[role="radio"][id^="accessory_department-"]',
      brand:
        '[role="radio"][id^="brand-"],[role="radio"][id^="suggested-brand-"],[role="radio"]#empty-brand',
      size: '[role="checkbox"][data-testid^="size-group-"]',
      condition: '[role="radio"][id^="condition-"]',
      color:
        '[role="checkbox"][id^="color-"],[role="checkbox"][data-testid^="filter-grid-option-"]:has([data-testid^="color-"])',
      material: '[role="checkbox"][id^="material-"]',
      package: 'input[id^="package_type_selector_"]',
    };
    if (!Object.hasOwn(selectors, field)) return [];
    const result = [];
    for (const element of document.querySelectorAll(selectors[field])) {
      const label = element instanceof HTMLInputElement ? element.labels?.[0] : element;
      if (
        !label ||
        label.getClientRects().length === 0 ||
        label.closest('[hidden],[aria-hidden="true"]')
      )
        continue;
      let hidden = false;
      for (let ancestor = label; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
          hidden = true;
          break;
        }
      }
      if (hidden) continue;
      let id = field === 'size' ? element.getAttribute('data-testid') : element.id;
      if (
        field === 'color' &&
        element.getAttribute('data-testid')?.startsWith('filter-grid-option-')
      ) {
        const grid = /^filter-grid-option-([1-9][0-9]*)$/.exec(element.getAttribute('data-testid'));
        const colors = [...element.querySelectorAll('[data-testid^="color-"]')].filter((color) =>
          /^color-[1-9][0-9]*$/.test(color.getAttribute('data-testid')),
        );
        if (
          !grid ||
          colors.length !== 1 ||
          colors[0].getAttribute('data-testid') !== 'color-' + grid[1] ||
          (element.id && element.id !== 'color-' + grid[1])
        )
          throw new Error('Vinted-Farbauswahl nicht eindeutig.');
        // Die innere Farbkennung und die äußere Grid-Kennung müssen dieselbe Farbe belegen.
        id = 'color-' + grid[1];
      }
      const labelledBy = (element.getAttribute('aria-labelledby') || '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      const title = element.querySelector(
        '[data-testid$="--title"],[class*="__Cell__title"]',
      )?.textContent;
      // Kachel-ID und Testkennung verwenden bei Vinted auch unterschiedliche Reihenfolgen.
      const packageId =
        field === 'package' ? /^package_type_selector_([1-9][0-9]*)$/.exec(element.id) : null;
      const packageCell = packageId
        ? element.closest(
            '[id="' + packageId[1] + '-package-size"],[id="package-size-' + packageId[1] + '"]',
          )
        : null;
      const packageCellTestId = packageCell?.getAttribute('data-testid');
      const packageCellMatches =
        packageId &&
        [packageId[1] + '-package-size--cell', 'package-size-' + packageId[1] + '--cell'].includes(
          packageCellTestId,
        );
      if (packageCellTestId && !packageCellMatches)
        throw new Error('Vinted-Paketname nicht eindeutig.');
      const packageLabel = packageCellMatches ? packageCell.textContent : '';
      let packageName = '';
      if (packageLabel) {
        const titles = packageCell.querySelectorAll(
          '[data-testid$="--cell--title"],[data-testid$="--cell-title"]',
        );
        if (titles.length > 0) {
          const names = titles[0].querySelectorAll(':scope > span');
          if (
            titles.length !== 1 ||
            ![packageCellTestId + '--title', packageCellTestId + '-title'].includes(
              titles[0].getAttribute('data-testid'),
            ) ||
            names.length !== 1 ||
            !names[0].textContent?.trim()
          )
            throw new Error('Vinted-Paketname nicht eindeutig.');
          const name = names[0];
          if (name.getClientRects().length === 0 || name.closest('[hidden],[aria-hidden="true"]'))
            throw new Error('Vinted-Paketname nicht eindeutig.');
          for (let ancestor = name; ancestor !== packageCell; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0')
              throw new Error('Vinted-Paketname nicht eindeutig.');
          }
          // Empfehlung, Beschreibung und Zusatzlink ändern sich unabhängig vom Paketnamen.
          packageName = name.textContent;
        }
      }
      result.push({
        id,
        label: (
          packageName ||
          element.getAttribute('aria-label') ||
          labelledBy ||
          title ||
          packageLabel ||
          label.textContent ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim(),
        selected:
          element instanceof HTMLInputElement
            ? element.checked
            : element.getAttribute('aria-checked') === 'true'
              ? true
              : element.getAttribute('aria-checked') === 'false'
                ? false
                : null,
        disabled:
          element instanceof HTMLInputElement
            ? element.disabled
            : element.getAttribute('aria-disabled') === 'true',
      });
    }
    return result;
  }

  function isResult(input, action, accountId) {
    if (
      !['publish', 'vinted_draft', 'update'].includes(action) ||
      typeof accountId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(accountId) ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input)
    )
      return false;
    if (input.outcome === 'relisting_deleted')
      return (
        action === 'publish' &&
        Object.keys(input).length === 4 &&
        typeof input.externalId === 'string' &&
        /^[1-9][0-9]{0,31}$/.test(input.externalId) &&
        input.externalAccountId === accountId &&
        typeof input.verifiedAt === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.verifiedAt) &&
        Number.isFinite(Date.parse(input.verifiedAt)) &&
        Date.parse(input.verifiedAt) <= Date.now() + 60000 &&
        new Date(input.verifiedAt).toISOString() === input.verifiedAt
      );
    if (input.outcome === 'failed' || input.outcome === 'outcome_unknown') {
      return (
        (Object.keys(input).length === 2 ||
          (input.outcome === 'outcome_unknown' &&
            action === 'publish' &&
            Object.keys(input).length === 4 &&
            typeof input.externalId === 'string' &&
            /^[1-9][0-9]{0,31}$/.test(input.externalId) &&
            input.externalAccountId === accountId)) &&
        typeof input.errorCode === 'string' &&
        /^[a-z_]{1,80}$/.test(input.errorCode)
      );
    }
    if (
      input.outcome !== 'confirmed' ||
      Object.keys(input).length !== 6 ||
      input.action !== action ||
      typeof input.externalId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(input.externalId) ||
      input.externalAccountId !== accountId ||
      !(action === 'vinted_draft'
        ? input.providerState === 'draft'
        : ['active', 'processing'].includes(input.providerState)) ||
      typeof input.verifiedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.verifiedAt)
    )
      return false;
    const time = Date.parse(input.verifiedAt);
    return Number.isFinite(time) && new Date(time).toISOString() === input.verifiedAt;
  }

  // Selbstständig serialisierbarer Leser des beobachteten eigenen Aktiv-Filters.
  // Bestätigt ausschließlich den Anbieterstatus einer bereits bekannten ID.
  function hasActiveListingEvidence(expected) {
    if (
      !expected ||
      typeof expected.accountId !== 'string' ||
      typeof expected.externalId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(expected.accountId) ||
      !/^[1-9][0-9]{0,31}$/.test(expected.externalId) ||
      typeof expected.title !== 'string' ||
      !expected.title.trim() ||
      location.origin !== 'https://www.vinted.de' ||
      location.pathname !== '/member/' + expected.accountId ||
      location.search ||
      location.hash
    )
      return false;
    const roots = document.querySelectorAll('#content');
    if (roots.length !== 1) return false;
    const content = roots[0];
    function visible(element) {
      if (
        !element ||
        element.getClientRects().length === 0 ||
        element.closest('[hidden],[aria-hidden="true"]')
      )
        return false;
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
          return false;
      }
      return true;
    }
    const active = content.querySelectorAll('[data-testid="closet-seller-filters-active"]');
    const sold = content.querySelectorAll('[data-testid="closet-seller-filters-sold"]');
    const editing = content.querySelectorAll('a[href="/settings/profile"]');
    if (
      active.length !== 1 ||
      sold.length !== 1 ||
      editing.length !== 1 ||
      !visible(active[0]) ||
      !visible(sold[0]) ||
      !visible(editing[0]) ||
      active[0].getAttribute('aria-pressed') !== 'true' ||
      active[0].textContent.trim() !== 'Aktiv' ||
      ![null, 'false'].includes(sold[0].getAttribute('aria-pressed')) ||
      Array.from(content.querySelectorAll('[role="progressbar"]')).some(visible)
    )
      return false;
    const items = content.querySelectorAll(
      '[data-testid="product-item-id-' + expected.externalId + '--overlay-link"]',
    );
    const caption = items.length === 1 ? items[0].getAttribute('title') : null;
    // Vinted ergänzt am Kachellink Marke, Zustand, Größe und Preis. Nur den
    // vollständig erkannten Zusatz abtrennen; der Artikeltitel bleibt exakt.
    const title =
      caption?.match(
        /^(.+), marke: [^,\r\n]+, zustand: [^,\r\n]+(?:, größe: [^,\r\n]+(?:,[0-9]+)?)?, [0-9]+(?:\.[0-9]{3})*,[0-9]{2} €$/u,
      )?.[1] ?? caption;
    return (
      items.length === 1 &&
      items[0].tagName === 'A' &&
      visible(items[0]) &&
      items[0].getAttribute('href') === '/items/' + expected.externalId &&
      (caption === expected.title || title === expected.title)
    );
  }

  // Selbständig serialisierbar: dieselbe Feldbindung dient Metadaten und einzelnen Controls.
  function collectFormMetadata(requestedField) {
    const testIds = {
      category: 'catalog-select-dropdown-input',
      accessory_department: 'category-accessory_department-single-list-input',
      brand: 'brand-select-dropdown-input',
      size: 'category-size-single-grid-input',
      condition: 'category-condition-single-list-input',
      color: 'color-select-dropdown-input',
      material: 'category-material-multi-list-input',
    };
    const roots = document.querySelectorAll(':is(#content, main:not(:has(#content)))');
    const root = roots.length === 1 ? roots[0] : null;
    const visible = (element) => {
      if (!element.getClientRects().length || element.closest('[hidden],[aria-hidden="true"]'))
        return false;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0')
          return false;
      }
      return true;
    };
    const control = (field) => {
      const absent = {
        state: 'missing',
        kind: null,
        value: null,
        testId: null,
        visible: false,
        scoped: !!root,
      };
      if (!Object.hasOwn(testIds, field) || roots.length > 1)
        return { ...absent, state: 'invalid' };
      const scope = root || document;
      const inputs = [...scope.querySelectorAll('#' + field)];
      // Am echten Formular vom 12.11.2026: Größengruppen mit Chips haben eine eigene Feldkennung.
      const fieldTestIds =
        field === 'size'
          ? [testIds.size, 'category-size-single-grid_chips-input']
          : [testIds[field]];
      const taggedControls = [
        ...scope.querySelectorAll(
          fieldTestIds.map((testId) => '[data-testid="' + testId + '"]').join(','),
        ),
      ];
      const elements = [...new Set([...inputs, ...taggedControls])];
      if (elements.length === 0) return absent;
      if (elements.length !== 1) return { ...absent, state: 'multiple' };
      const element = elements[0];
      if (
        inputs.includes(element) &&
        element instanceof HTMLInputElement &&
        ['text', 'search'].includes(element.type) &&
        (!element.name || element.name === field)
      )
        return {
          state: 'ready',
          kind: 'input',
          value: element.value.trim(),
          testId: null,
          visible: visible(element),
          scoped: !!root,
        };
      if (
        !root ||
        !taggedControls.includes(element) ||
        !(element instanceof HTMLButtonElement) ||
        element.type !== 'button' ||
        !element.id ||
        [...document.querySelectorAll('[id]')].filter((node) => node.id === element.id).length !== 1
      )
        return { ...absent, state: 'invalid' };
      const labels = [...(element.labels || [])].filter(
        (label) =>
          root.contains(label) && label.htmlFor === element.id && label.control === element,
      );
      if (labels.length !== 1 || !labels[0].textContent.trim())
        return { ...absent, state: 'invalid' };
      return {
        state: 'ready',
        kind: 'button',
        value: element.innerText.replace(/\s+/g, ' ').trim(),
        testId: element.dataset.testid,
        visible: visible(element),
        scoped: true,
      };
    };
    if (typeof requestedField === 'string') return control(requestedField);
    if (
      !root ||
      !root.querySelector('input[name="title"]') ||
      !root.querySelector('textarea[name="description"]')
    )
      throw new Error('Vinted-Formular unvollständig.');
    const names = ['accessory_department', 'brand', 'size', 'condition', 'color', 'material'];
    const controls = new Map(['category', ...names].map((name) => [name, control(name)]));
    if ([...controls.values()].some((entry) => !['ready', 'missing'].includes(entry.state)))
      throw new Error('Vinted-Formularfeld nicht eindeutig.');
    const presentFields = names.filter(
      (name) => controls.get(name).state === 'ready' && controls.get(name).visible,
    );
    // Die sichtbare Sendungsgrößen-Kachel bleibt maßgeblich, auch bei ausgeblendetem Radio.
    if (
      [...root.querySelectorAll('input[id^="package_type_selector_"]')].some(
        (element) => element.labels?.[0] && visible(element.labels[0]),
      )
    )
      presentFields.push('package');
    const unknownFields = new Set();
    const allowed = new Set([
      'title',
      'description',
      'price',
      'category',
      'photos',
      'ai_photo',
      'bump',
      ...names,
    ]);
    for (const element of root.querySelectorAll('input,textarea,select')) {
      if (!visible(element) || ['hidden', 'button', 'submit'].includes(element.type)) continue;
      const nativeSelector = element.matches(
        'input[name="title"],input[name="price"],textarea[name="description"],input[name="photos"][type="file"]',
      )
        ? element.tagName.toLowerCase() + '[name="' + element.name + '"]'
        : null;
      if (nativeSelector && root.querySelectorAll(nativeSelector).length === 1) continue;
      if (
        ['title', 'description', 'price', 'photos'].includes(element.name) ||
        ['title', 'description', 'price', 'photos'].includes(element.id)
      ) {
        unknownFields.add(element.id || element.name);
        continue;
      }
      const current = controls.get(element.name);
      if (
        element instanceof HTMLInputElement &&
        !element.id &&
        element.labels.length === 0 &&
        !element.hasAttribute('aria-label') &&
        !element.hasAttribute('aria-labelledby') &&
        current?.state === 'ready' &&
        current.kind === 'button' &&
        root.querySelectorAll('input[name="' + element.name + '"]').length === 1
      )
        continue;
      if (
        controls.has(element.name) &&
        (!(element instanceof HTMLInputElement) || element.id !== element.name)
      ) {
        unknownFields.add(element.name);
        continue;
      }
      const name = element.id || element.name;
      // Zusatzfelder einer Kategorie füllt Flipbase selbst aus (vinted-browser-listing-extras):
      // Auswahllisten wie die Rocklänge und freie Maße oder die ISBN. Sie sind optional, solange
      // Vinted sie nicht verlangt, und gelten deshalb nicht als unbekannt.
      const testId = element.getAttribute('data-testid');
      const extraField =
        element instanceof HTMLInputElement &&
        /^[a-z][a-z0-9_]{0,39}$/.test(element.id) &&
        (testId === 'category-' + element.id + '-single-list-input' ||
          testId === 'category-' + element.id + '-multi-list-input' ||
          (element.type === 'text' && ['shoulder_width', 'height', 'isbn'].includes(element.id)));
      if (!allowed.has(name) && !extraField && !/^package_type_selector_[1-9][0-9]*$/.test(name))
        unknownFields.add(name || 'unknown_field');
    }
    for (const element of root.querySelectorAll('button[data-testid$="-input"]'))
      if (
        visible(element) &&
        ![...controls.values()].some(
          (entry) =>
            entry.state === 'ready' &&
            entry.kind === 'button' &&
            entry.testId === element.dataset.testid,
        )
      )
        unknownFields.add(element.dataset.testid || 'unknown_field');
    const photos = root.querySelector('input[name="photos"][type="file"]');
    const title = root.querySelector('input[name="title"]');
    const description = root.querySelector('textarea[name="description"]');
    const flag = (name) => {
      const element = root.querySelector(`input#${name}[type="checkbox"]`);
      return element ? element.checked : null;
    };
    return {
      presentFields,
      unknownFields: [...unknownFields],
      acceptedPhotoMimeTypes: photos
        ? [
            ...new Set(
              photos.accept
                .split(',')
                .map((type) => type.trim())
                .filter(Boolean),
            ),
          ]
        : [],
      titleMaxLength: title.maxLength < 0 ? null : title.maxLength,
      descriptionMaxLength: description.maxLength < 0 ? null : description.maxLength,
      aiPhoto: flag('ai_photo'),
      bump: flag('bump'),
    };
  }
  function validateSubmission(content, photos, schema) {
    const issues = [];
    const add = (field, code) => {
      if (!issues.some((issue) => issue.field === field && issue.code === code))
        issues.push({ field, code });
    };
    const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const positive = (value) => Number.isSafeInteger(value) && value > 0;
    if (
      !record(content) ||
      !record(schema) ||
      !positive(schema.categoryId) ||
      !Array.isArray(schema.fields) ||
      !Array.isArray(schema.unknownFields) ||
      schema.unknownFields.some((field) => typeof field !== 'string' || !field) ||
      !Array.isArray(schema.acceptedPhotoMimeTypes) ||
      !schema.acceptedPhotoMimeTypes.length ||
      schema.acceptedPhotoMimeTypes.some((type) => typeof type !== 'string') ||
      ![schema.titleMaxLength, schema.descriptionMaxLength].every(
        (limit) => limit === null || positive(limit),
      ) ||
      ![schema.aiPhoto, schema.bump].every((flag) => flag === null || typeof flag === 'boolean')
    )
      return [{ field: 'form', code: 'invalid' }];
    const fields = new Map();
    for (const field of schema.fields) {
      if (
        !record(field) ||
        !Object.hasOwn(patterns, field.field) ||
        field.field === 'category' ||
        fields.has(field.field) ||
        !Array.isArray(field.choices) ||
        !field.choices.length ||
        field.choices.some(
          (choice) =>
            !record(choice) ||
            (choice.id !== null && !positive(choice.id)) ||
            (choice.id === null && field.field !== 'brand') ||
            typeof choice.label !== 'string' ||
            !choice.label ||
            typeof choice.selected !== 'boolean' ||
            typeof choice.disabled !== 'boolean',
        ) ||
        new Set(field.choices.map((choice) => choice.id)).size !== field.choices.length
      )
        return [{ field: 'form', code: 'invalid' }];
      fields.set(field.field, field.choices);
    }
    if (content.categoryId !== schema.categoryId) add('category', 'unavailable');
    if (schema.bump === true) add('bump', 'unsupported');
    for (const [field, max] of [
      ['title', schema.titleMaxLength],
      ['description', schema.descriptionMaxLength],
    ]) {
      const text = content[field];
      if (
        typeof text !== 'string' ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) ||
        /\{\s*[^{}]+?\s*\}/.test(text)
      )
        add(field, 'invalid');
      else if (!text.trim()) add(field, 'missing');
      else if (max !== null && text.length > max) add(field, 'limit');
    }
    if (content.priceCents === null) add('price', 'missing');
    else if (!positive(content.priceCents)) add('price', 'invalid');
    if (content.currency !== 'EUR') add('currency', 'invalid');
    if (!record(content.attributes)) add('attributes', 'invalid');
    else if (!validAttributes(content.attributes)) add('attributes', 'unsupported');
    for (const field of schema.unknownFields) add(field, 'unsupported');

    for (const [field, id, label] of [
      ['brand', content.brandId, content.brandLabel],
      ['size', content.sizeId, content.sizeLabel],
      ['condition', content.conditionId, content.conditionLabel],
      ['package', content.packageSizeId, ''],
      [
        'accessory_department',
        content.attributes?.accessory_department
          ? Number(content.attributes.accessory_department)
          : null,
        content.attributes?.accessory_department_label ?? '',
      ],
    ]) {
      const choices = fields.get(field);
      if (!choices) {
        if (field === 'condition' || field === 'package' || id !== null || label)
          add(field, 'unsupported');
        continue;
      }
      if (id === null && (field !== 'brand' || !label)) {
        add(field, 'missing');
        continue;
      }
      if (id !== null && !positive(id)) {
        add(field, 'invalid');
        continue;
      }
      const choice = choices.find(
        (choice) => choice.id === id && (field === 'package' || choice.label === label),
      );
      if (!choice) add(field, 'unavailable');
      else if (choice.disabled && !choice.selected) add(field, 'disabled');
    }
    for (const [field, ids, labels, max] of [
      ['color', content.colorIds, content.colorLabels, 2],
      ['material', content.materialIds, content.materialLabels, 3],
    ]) {
      if (
        !Array.isArray(ids) ||
        !Array.isArray(labels) ||
        ids.length !== labels.length ||
        ids.some((id) => !positive(id)) ||
        labels.some((label) => typeof label !== 'string' || !label) ||
        new Set(ids).size !== ids.length
      ) {
        add(field, 'invalid');
        continue;
      }
      if (ids.length > max) add(field, 'limit');
      const choices = fields.get(field);
      if (!choices) {
        if (ids.length) add(field, 'unsupported');
        continue;
      }
      for (const [index, id] of ids.entries()) {
        const choice = choices.find((choice) => choice.id === id && choice.label === labels[index]);
        if (!choice) add(field, 'unavailable');
        else if (choice.disabled && !choice.selected) add(field, 'disabled');
      }
    }
    if (!Array.isArray(photos)) add('photos', 'invalid');
    else {
      if (!photos.length) add('photos', 'missing');
      // Offiziell bestätigt am 09.10.2026: https://www.vinted.de/help/4/375-vaiheittaiset-ohjeet-tuotteen-lataamista-varten
      if (photos.length > 20) add('photos', 'limit');
      if (
        photos.some(
          (photo) =>
            !record(photo) ||
            !positive(photo.byteSize) ||
            !schema.acceptedPhotoMimeTypes.includes(photo.mimeType),
        )
      )
        add('photos', 'invalid');
    }
    return issues;
  }
  // Unveränderlicher Auftragsinhalt; gemeinsam für Erweiterung und Worker.
  const parseSnapshot = (function snapshotParser() {
    'use strict';
    function invalid() {
      return new Error('Inseratauftrag ungültig');
    }
    function fields(input, keys) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
      const result = input;
      if (
        Object.keys(result).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(result, key))
      )
        throw invalid();
      return result;
    }
    function uuid(input) {
      if (
        typeof input !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
      )
        throw invalid();
      return input;
    }
    function id(input) {
      if (
        typeof input !== 'string' ||
        !/^[1-9][0-9]{0,18}$/.test(input) ||
        BigInt(input) > 9223372036854775807n
      )
        throw invalid();
      return input;
    }
    function integer(input, minimum = 1) {
      if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < minimum)
        throw invalid();
      return input;
    }
    function text(input) {
      if (
        typeof input !== 'string' ||
        input.length > 20000 ||
        [...input].some((char) => {
          const code = char.charCodeAt(0);
          return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
        })
      )
        throw invalid();
      return input;
    }
    function strings(input) {
      if (!Array.isArray(input) || input.length > 100) throw invalid();
      return Object.freeze(input.map(text));
    }
    function ids(input) {
      if (!Array.isArray(input) || input.length > 100) throw invalid();
      const result = input.map((value) => integer(value));
      if (new Set(result).size !== result.length) throw invalid();
      return Object.freeze(result);
    }
    function content(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
      const value = input;
      const allowed = [
        'title',
        'description',
        'priceCents',
        'currency',
        'categoryId',
        'categoryLabel',
        'brandId',
        'brandLabel',
        'sizeId',
        'sizeLabel',
        'conditionId',
        'conditionLabel',
        'colorIds',
        'colorLabels',
        'materialIds',
        'materialLabels',
        'packageSizeId',
        'attributes',
      ];
      if (Object.keys(value).some((key) => !allowed.includes(key)) || value['currency'] !== 'EUR')
        throw invalid();
      const attributes = value['attributes'] ?? {};
      if (typeof attributes !== 'object' || !attributes || Array.isArray(attributes))
        throw invalid();
      const parsedAttributes = {};
      for (const [key, entry] of Object.entries(attributes)) {
        if (
          !/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(key) ||
          ['constructor', 'prototype', '__proto__'].includes(key)
        )
          throw invalid();
        parsedAttributes[key] = text(entry);
      }
      if (Object.keys(parsedAttributes).length > 100) throw invalid();
      const title = text(value['title']),
        description = text(value['description']);
      if (!title.trim() || !description.trim()) throw invalid();
      return Object.freeze({
        title,
        description,
        priceCents: integer(value['priceCents']),
        currency: 'EUR',
        categoryId: integer(value['categoryId']),
        categoryLabel: text(value['categoryLabel'] ?? ''),
        brandId: value['brandId'] == null ? null : integer(value['brandId']),
        brandLabel: text(value['brandLabel'] ?? ''),
        sizeId: value['sizeId'] == null ? null : integer(value['sizeId']),
        sizeLabel: text(value['sizeLabel'] ?? ''),
        conditionId: integer(value['conditionId']),
        conditionLabel: text(value['conditionLabel'] ?? ''),
        colorIds: ids(value['colorIds'] ?? []),
        colorLabels: strings(value['colorLabels'] ?? []),
        materialIds: ids(value['materialIds'] ?? []),
        materialLabels: strings(value['materialLabels'] ?? []),
        packageSizeId: integer(value['packageSizeId']),
        attributes: Object.freeze(parsedAttributes),
      });
    }
    function snapshot(input, workspaceId, connectionId) {
      const relisting =
        input && typeof input === 'object' && Object.hasOwn(input, 'relistExternalId');
      const value = fields(input, [
        'content',
        'images',
        'aiPhoto',
        'bump',
        'connectionId',
        'inventoryItemId',
        ...(relisting ? ['relistExternalId'] : []),
        ...(input && Object.hasOwn(input, 'relistStage') ? ['relistStage'] : []),
        ...(input && Object.hasOwn(input, 'photoOptions') ? ['photoOptions'] : []),
      ]);
      if (
        value['connectionId'] !== connectionId ||
        typeof value['aiPhoto'] !== 'boolean' ||
        value['bump'] !== false ||
        !Array.isArray(value['images']) ||
        value['images'].length < 1 ||
        value['images'].length > 20
      )
        throw invalid();
      if (
        value['relistStage'] !== undefined &&
        (!relisting || !['delete', 'publish'].includes(value['relistStage']))
      )
        throw invalid();
      const seen = new Set(),
        paths = new Set();
      let draftId;
      const images = value['images'].map((input) => {
        const image = fields(input, ['id', 'storagePath', 'fileName', 'mimeType', 'byteSize']),
          imageId = id(image['id']);
        if (typeof image['storagePath'] !== 'string') throw invalid();
        const parts = image['storagePath'].split('/');
        const photoDraftId = parts[1],
          file = parts[2];
        if (
          parts.length !== 3 ||
          parts[0] !== workspaceId ||
          !photoDraftId ||
          !file ||
          !/^[1-9][0-9]{0,18}$/.test(photoDraftId) ||
          !/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(file) ||
          (draftId && draftId !== photoDraftId) ||
          seen.has(imageId) ||
          paths.has(image['storagePath'])
        )
          throw invalid();
        uuid(file.slice(0, 36));
        id(photoDraftId);
        draftId = photoDraftId;
        seen.add(imageId);
        paths.add(image['storagePath']);
        const mimeType = image['mimeType'];
        if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp')
          throw invalid();
        const extension =
          mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
        if (!file.endsWith('.' + extension)) throw invalid();
        const byteSize = integer(image['byteSize']);
        if (byteSize > 50 * 1024 * 1024) throw invalid();
        const fileName = text(image['fileName']);
        if (!fileName || fileName.length > 255 || /[\r\n/\\]/u.test(fileName)) throw invalid();
        return Object.freeze({
          id: imageId,
          storagePath: image['storagePath'],
          fileName,
          mimeType,
          byteSize,
        });
      });
      let photoOptions;
      if (Object.hasOwn(value, 'photoOptions')) {
        const raw = value['photoOptions'];
        const options = fields(raw, [
          'resize',
          'crops',
          ...(raw && Object.hasOwn(raw, 'filter') ? ['filter'] : []),
          ...(raw && Object.hasOwn(raw, 'border') ? ['border'] : []),
        ]);
        if (
          (options.resize !== null && ![1200, 1600, 2400].includes(options.resize)) ||
          (Object.hasOwn(options, 'filter') &&
            !['none', 'lighter', 'darker', 'soft'].includes(options.filter)) ||
          (Object.hasOwn(options, 'border') &&
            !['none', 'small', 'medium', 'large'].includes(options.border)) ||
          !options.crops ||
          typeof options.crops !== 'object' ||
          Array.isArray(options.crops)
        )
          throw invalid();
        const crops = {};
        for (const [imageId, raw] of Object.entries(options.crops)) {
          if (!seen.has(imageId)) throw invalid();
          const crop = fields(raw, ['x', 'y', 'width', 'height', 'rotation']);
          if (
            !['x', 'y', 'width', 'height'].every(
              (key) => typeof crop[key] === 'number' && Number.isFinite(crop[key]),
            ) ||
            ![0, 90, 180, 270].includes(crop.rotation) ||
            crop.x < 0 ||
            crop.y < 0 ||
            crop.width <= 0 ||
            crop.height <= 0 ||
            crop.x + crop.width > 1.000000001 ||
            crop.y + crop.height > 1.000000001
          )
            throw invalid();
          crops[imageId] = Object.freeze({ ...crop });
        }
        photoOptions = Object.freeze({
          resize: options.resize,
          crops: Object.freeze(crops),
          ...(Object.hasOwn(options, 'filter') ? { filter: options.filter } : {}),
          ...(Object.hasOwn(options, 'border') ? { border: options.border } : {}),
        });
      }
      return Object.freeze({
        content: content(value['content']),
        ...(photoOptions ? { photoOptions } : {}),
        ...(relisting ? { relistExternalId: id(value['relistExternalId']) } : {}),
        ...(value['relistStage'] ? { relistStage: value['relistStage'] } : {}),
        images: Object.freeze(images),
        connectionId,
        inventoryItemId: value['inventoryItemId'] === null ? null : uuid(value['inventoryItemId']),
        aiPhoto: value['aiPhoto'],
        bump: false,
      });
    }

    return snapshot;
  })();
  // Serialisierbar: ausschließlich das native Fotogitter innerhalb der Inseratmaske.
  function collectPhotoState() {
    const roots = document.querySelectorAll(':is(#content, main:not(:has(#content)))');
    const grids =
      roots.length === 1 ? roots[0].querySelectorAll('[data-testid="media-upload-grid"]') : [];
    if (grids.length !== 1) return { valid: false, items: [] };
    const visible = (node) => {
      if (!node.getClientRects().length || node.closest('[hidden],[aria-hidden="true"]'))
        return false;
      for (let parent = node; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
          return false;
      }
      return true;
    };
    const items = Array.from(grids[0].querySelectorAll('[data-testid^="image-wrapper-"]')).map(
      (node) => {
        const identifier = /^image-wrapper-(0|[1-9][0-9]*)$/.exec(
          node.getAttribute('data-testid') ?? '',
        );
        const images = node.querySelectorAll('img'),
          image = images[0];
        let url = null;
        try {
          const source = new URL(image?.getAttribute('src') ?? '');
          if (
            source.protocol === 'https:' &&
            /^images[1-9][0-9]*\.vinted\.net$/.test(source.hostname) &&
            !source.username &&
            !source.password &&
            !source.port &&
            !source.hash &&
            (!source.search || /^\?s=[0-9a-f]{40,128}$/i.test(source.search))
          )
            url = source.href;
        } catch {
          /* Lokale Vorschauen sind kein bestätigter Anbieterupload. */
        }
        return {
          index: identifier ? Number(identifier[1]) : -1,
          url,
          ready:
            images.length === 1 &&
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0 &&
            image.naturalHeight > 0 &&
            visible(node) &&
            visible(image),
        };
      },
    );
    return {
      valid: items.length <= 20 && items.every((item, index) => item.index === index),
      items,
    };
  }
  function collectFormValues(options) {
    const roots = document.querySelectorAll(':is(#content, main:not(:has(#content)))');
    if (roots.length !== 1) return null;
    const root = roots[0],
      values = {};
    for (const [name, tag] of [
      ['title', 'input'],
      ['description', 'textarea'],
      ['price', 'input'],
    ]) {
      const nodes = root.querySelectorAll(tag + '[name="' + name + '"]'),
        node = nodes[0];
      if (
        nodes.length !== 1 ||
        !node.getClientRects().length ||
        node.closest('[hidden],[aria-hidden="true"]')
      )
        return null;
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
          return null;
      }
      values[name] = node.value;
    }
    for (const name of ['ai_photo', 'bump']) {
      const nodes = root.querySelectorAll('input#' + name + '[type="checkbox"]');
      // Die Veröffentlichung ohne KI ist auch in Masken ohne diese optionale Auswahl möglich.
      if (name === 'ai_photo' && nodes.length === 0 && options?.allowMissingAiPhoto === true) {
        values[name] = false;
        continue;
      }
      if (nodes.length !== 1) return null;
      values[name] = nodes[0].checked;
    }
    return values;
  }
  function formMatches(content, photos, schema, values, aiPhoto) {
    if (
      !values ||
      !Number.isSafeInteger(content?.priceCents) ||
      validateSubmission(content, photos, schema).length > 0 ||
      values.title !== content.title ||
      values.description !== content.description ||
      typeof values.price !== 'string' ||
      (schema.aiPhoto !== aiPhoto && !(schema.aiPhoto === null && aiPhoto === false)) ||
      schema.bump !== false ||
      values.ai_photo !== aiPhoto ||
      values.bump !== false
    )
      return false;
    let price = values.price.replace(/[€\s]/gu, '');
    if (price.includes('.') && price.includes(',')) {
      if (!/^[0-9]{1,3}(?:\.[0-9]{3})+,[0-9]{1,2}$/.test(price)) return false;
      price = price.replaceAll('.', '');
    }
    const match = /^([0-9]+)(?:[,.]([0-9]{1,2}))?$/.exec(price);
    if (
      !match ||
      BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0') !==
        BigInt(content.priceCents)
    )
      return false;
    return schema.fields.every((field) => {
      const expected = {
        brand: [content.brandId],
        size: [content.sizeId],
        condition: [content.conditionId],
        package: [content.packageSizeId],
        accessory_department: [Number(content.attributes.accessory_department)],
        color: content.colorIds,
        material: content.materialIds,
      }[field.field];
      const selected = field.choices.filter((choice) => choice.selected).map((choice) => choice.id);
      return (
        expected &&
        selected.length === expected.length &&
        selected.every((id) => expected.includes(id))
      );
    });
  }
  function photosMatch(uploaded, saved, originalIds) {
    function assetKey(input) {
      if (typeof input !== 'string') return null;
      try {
        const url = new URL(input);
        if (
          url.protocol !== 'https:' ||
          !/^images[1-9][0-9]*\.vinted\.net$/.test(url.hostname) ||
          url.port ||
          url.username ||
          url.password ||
          url.hash ||
          (url.search && !/^\?s=[0-9a-f]{40,128}$/i.test(url.search))
        )
          return null;
        const path =
          /^\/tc?\/([a-zA-Z0-9_-]{1,128})\/(?:f[1-9][0-9]{0,4}|[1-9][0-9]{0,4}x[1-9][0-9]{0,4})\/([0-9]{1,20}\.(?:webp|jpg|png)|[a-f0-9]{8}\.jpeg)$/.exec(
            url.pathname,
          );
        return path ? path[1] + '/' + path[2] : null;
      } catch {
        return null;
      }
    }
    if (
      !Array.isArray(uploaded) ||
      !Array.isArray(originalIds) ||
      uploaded.length < 1 ||
      uploaded.length > 20 ||
      uploaded.length !== originalIds.length ||
      !saved ||
      saved.valid !== true ||
      !Array.isArray(saved.items) ||
      saved.items.length !== uploaded.length
    )
      return false;
    const ids = new Set(),
      assets = new Set();
    return uploaded.every((photo, index) => {
      const id = originalIds[index],
        item = saved.items[index];
      if (
        typeof id !== 'string' ||
        !/^[1-9][0-9]{0,18}$/.test(id) ||
        BigInt(id) > 9223372036854775807n ||
        ids.has(id) ||
        !photo ||
        photo.sourceImageId !== id ||
        !item ||
        item.index !== index ||
        item.ready !== true
      )
        return false;
      const asset = assetKey(photo.previewUrl);
      if (!asset || assets.has(asset) || asset !== assetKey(item.url)) return false;
      ids.add(id);
      assets.add(asset);
      return true;
    });
  }
  /** Prüft den übertragenen Iststand eines bestehenden Inserats; Inhalt muss zur Auswahl passen. */
  function parseCurrentContent(input, accountId, externalId) {
    const exact = (value, keys) =>
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key));
    const identifier = (value) => typeof value === 'string' && /^[1-9][0-9]{0,31}$/.test(value);
    const text = (value) =>
      typeof value === 'string' &&
      value.length <= 20000 &&
      ![...value].some((character) => {
        const code = character.charCodeAt(0);
        return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
      });
    const positive = (value) => Number.isSafeInteger(value) && value > 0;
    if (
      !identifier(accountId) ||
      !identifier(externalId) ||
      !exact(input, [
        'externalId',
        'externalAccountId',
        'content',
        'aiPhoto',
        'bump',
        'photoUrls',
        'schema',
      ]) ||
      input.externalId !== externalId ||
      input.externalAccountId !== accountId ||
      typeof input.aiPhoto !== 'boolean' ||
      typeof input.bump !== 'boolean' ||
      !Array.isArray(input.photoUrls) ||
      input.photoUrls.length < 1 ||
      input.photoUrls.length > 20 ||
      new Set(input.photoUrls).size !== input.photoUrls.length
    )
      invalid();
    for (const photoUrl of input.photoUrls) {
      let source;
      try {
        source = new URL(photoUrl);
      } catch {
        invalid();
      }
      if (
        typeof photoUrl !== 'string' ||
        source.href !== photoUrl ||
        source.protocol !== 'https:' ||
        !/^images[1-9][0-9]*\.vinted\.net$/.test(source.hostname) ||
        source.username ||
        source.password ||
        source.port ||
        source.hash ||
        (source.search && !/^\?s=[0-9a-f]{40,128}$/i.test(source.search))
      )
        invalid();
    }
    const content = input.content;
    if (
      !exact(content, [
        'title',
        'description',
        'priceCents',
        'currency',
        'categoryId',
        'categoryLabel',
        'brandId',
        'brandLabel',
        'sizeId',
        'sizeLabel',
        'conditionId',
        'conditionLabel',
        'colorIds',
        'colorLabels',
        'materialIds',
        'materialLabels',
        'packageSizeId',
        'attributes',
      ]) ||
      ![
        content.title,
        content.description,
        content.categoryLabel,
        content.brandLabel,
        content.sizeLabel,
        content.conditionLabel,
      ].every(text) ||
      !content.categoryLabel ||
      !positive(content.priceCents) ||
      content.currency !== 'EUR' ||
      !positive(content.categoryId) ||
      !validAttributes(content.attributes)
    )
      invalid();
    const schema = parseCategoryFields(input.schema, content.categoryId);
    if (
      (schema.aiPhoto !== input.aiPhoto && !(schema.aiPhoto === null && input.aiPhoto === false)) ||
      schema.bump !== input.bump
    )
      invalid();
    // Kennungen und Namen stammen aus derselben aktuellen Auswahl, nie aus getrennten Quellen.
    const selected = (field) =>
      schema.fields
        .find((entry) => entry.field === field)
        ?.choices.filter((choice) => choice.selected) ?? [];
    for (const [field, id, label] of [
      ['brand', content.brandId, content.brandLabel],
      ['size', content.sizeId, content.sizeLabel],
      ['condition', content.conditionId, content.conditionLabel],
      ['package', content.packageSizeId, null],
      [
        'accessory_department',
        content.attributes.accessory_department
          ? Number(content.attributes.accessory_department)
          : null,
        content.attributes.accessory_department_label ?? '',
      ],
    ]) {
      const choice = selected(field)[0];
      if (
        (choice?.id ?? null) !== id ||
        (label !== null && (choice?.label ?? '') !== label) ||
        (id !== null && !positive(id))
      )
        invalid();
    }
    for (const [field, ids, labels] of [
      ['color', content.colorIds, content.colorLabels],
      ['material', content.materialIds, content.materialLabels],
    ]) {
      const choices = selected(field);
      if (
        !Array.isArray(ids) ||
        !Array.isArray(labels) ||
        ids.length !== choices.length ||
        labels.length !== choices.length ||
        choices.some((choice, index) => choice.id !== ids[index] || choice.label !== labels[index])
      )
        invalid();
    }
    return {
      externalId,
      externalAccountId: accountId,
      content: {
        title: content.title,
        description: content.description,
        priceCents: content.priceCents,
        currency: 'EUR',
        categoryId: content.categoryId,
        categoryLabel: content.categoryLabel,
        brandId: content.brandId,
        brandLabel: content.brandLabel,
        sizeId: content.sizeId,
        sizeLabel: content.sizeLabel,
        conditionId: content.conditionId,
        conditionLabel: content.conditionLabel,
        colorIds: [...content.colorIds],
        colorLabels: [...content.colorLabels],
        materialIds: [...content.materialIds],
        materialLabels: [...content.materialLabels],
        packageSizeId: content.packageSizeId,
        attributes: { ...content.attributes },
      },
      aiPhoto: input.aiPhoto,
      bump: input.bump,
      photoUrls: [...input.photoUrls],
      schema,
    };
  }
  /** Prüft vollständige Inseratangaben für eine Änderung; ob die Werte wählbar sind, klärt erst die Maske. */
  function parseEditContent(input) {
    const text = (value, limit) =>
      typeof value === 'string' &&
      value.length <= limit &&
      ![...value].some((character) => {
        const code = character.charCodeAt(0);
        return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
      });
    const positive = (value) => Number.isSafeInteger(value) && value > 0;
    const optional = (value) => value === null || positive(value);
    const keys = [
      'title',
      'description',
      'priceCents',
      'currency',
      'categoryId',
      'categoryLabel',
      'brandId',
      'brandLabel',
      'sizeId',
      'sizeLabel',
      'conditionId',
      'conditionLabel',
      'colorIds',
      'colorLabels',
      'materialIds',
      'materialLabels',
      'packageSizeId',
      'attributes',
    ];
    const choices = (ids, labels, max) =>
      Array.isArray(ids) &&
      Array.isArray(labels) &&
      ids.length <= max &&
      ids.length === labels.length &&
      new Set(ids).size === ids.length &&
      ids.every(positive) &&
      labels.every((label) => text(label, 2000) && label.trim());
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length !== keys.length ||
      !keys.every((key) => Object.hasOwn(input, key)) ||
      !text(input.title, 20000) ||
      !input.title.trim() ||
      !text(input.description, 20000) ||
      !input.description.trim() ||
      !positive(input.priceCents) ||
      input.priceCents > 100000000 ||
      input.currency !== 'EUR' ||
      !positive(input.categoryId) ||
      ![input.categoryLabel, input.brandLabel, input.sizeLabel, input.conditionLabel].every(
        (label) => text(label, 2000),
      ) ||
      ![input.brandId, input.sizeId, input.conditionId, input.packageSizeId].every(optional) ||
      !choices(input.colorIds, input.colorLabels, 2) ||
      !choices(input.materialIds, input.materialLabels, 3) ||
      !input.attributes ||
      typeof input.attributes !== 'object' ||
      Array.isArray(input.attributes) ||
      !validAttributes(input.attributes)
    )
      invalid();
    return {
      title: input.title,
      description: input.description,
      priceCents: input.priceCents,
      currency: 'EUR',
      categoryId: input.categoryId,
      categoryLabel: input.categoryLabel,
      brandId: input.brandId,
      brandLabel: input.brandLabel,
      sizeId: input.sizeId,
      sizeLabel: input.sizeLabel,
      conditionId: input.conditionId,
      conditionLabel: input.conditionLabel,
      colorIds: [...input.colorIds],
      colorLabels: [...input.colorLabels],
      materialIds: [...input.materialIds],
      materialLabels: [...input.materialLabels],
      packageSizeId: input.packageSizeId,
      attributes: { ...input.attributes },
    };
  }
  root.FlipbaseVintedListingRuntime = Object.freeze({
    parseEditContent,
    parseCurrentContent,
    photosMatch,
    collectPhotoState,
    collectFormValues,
    formMatches,
    parseSnapshot,
    hasActiveListingEvidence,
    parseChoices,
    parseCategoryFields,
    collectChoices,
    collectFormMetadata,
    collectFormControl: collectFormMetadata,
    isResult,
    validateSubmission,
  });
  if (typeof module !== 'undefined' && module.exports)
    module.exports = root.FlipbaseVintedListingRuntime;
})(globalThis);

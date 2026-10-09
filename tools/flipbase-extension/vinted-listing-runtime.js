// Gemeinsamer Formularvertrag für lokale Erweiterung und Cloud-Ausführung.
(function exposeListingRuntime(root) {
  'use strict';
  const patterns = {
    category: /^catalog-(?:suggestion-)?([1-9][0-9]*)$/,
    brand: /^(?:suggested-)?brand-([1-9][0-9]*)$/,
    size: /^size-group-([1-9][0-9]*)-grid-option-([1-9][0-9]*)$/,
    condition: /^condition-([1-9][0-9]*)$/,
    color: /^color-([1-9][0-9]*)$/,
    material: /^material-([1-9][0-9]*)$/,
    package: /^package_type_selector_([1-9][0-9]*)$/,
  };
  function invalid() {
    throw new Error('Die Vinted-Auswahl konnte nicht eindeutig gelesen werden.');
  }
  function numeric(value) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) invalid();
    return number;
  }
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
      const id = emptyBrand ? null : numeric(match[field === 'size' ? 2 : 1]);
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
    if (groups.size > 1 || result.filter((choice) => choice.selected).length > max) invalid();
    return { field, sizeGroupId: [...groups][0] ?? null, choices: result };
  }

  // Selbstständig serialisierbar: liest nur sichtbare Formularoptionen, keine Seitendaten.
  function collectChoices(field) {
    const selectors = {
      category: '[role="radio"][id^="catalog-"]',
      brand:
        '[role="radio"][id^="brand-"],[role="radio"][id^="suggested-brand-"],[role="radio"]#empty-brand',
      size: '[role="checkbox"][data-testid^="size-group-"]',
      condition: '[role="radio"][id^="condition-"]',
      color: '[role="checkbox"][id^="color-"]',
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
      const labelledBy = (element.getAttribute('aria-labelledby') || '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      const title = element.querySelector(
        '[data-testid$="--title"],[class*="__Cell__title"]',
      )?.textContent;
      result.push({
        id: field === 'size' ? element.getAttribute('data-testid') : element.id,
        label: (
          element.getAttribute('aria-label') ||
          labelledBy ||
          title ||
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
    if (input.outcome === 'failed' || input.outcome === 'outcome_unknown') {
      return (
        Object.keys(input).length === 2 &&
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

  function collectFormMetadata() {
    const root = document.querySelector('#content');
    if (
      !root ||
      !root.querySelector('input[name="title"]') ||
      !root.querySelector('textarea[name="description"]')
    )
      throw new Error('Vinted-Formular unvollständig.');
    const names = ['brand', 'size', 'condition', 'color', 'material'];
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
    const presentFields = names.filter((name) => {
      const element = root.querySelector(`#${name}`);
      return element && visible(element);
    });
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
      const name = element.id || element.name;
      if (!allowed.has(name) && !/^package_type_selector_[1-9][0-9]*$/.test(name))
        unknownFields.add(name || 'unknown_field');
    }
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
    else if (Object.keys(content.attributes).length) add('attributes', 'unsupported');
    for (const field of schema.unknownFields) add(field, 'unsupported');

    for (const [field, id, label] of [
      ['brand', content.brandId, content.brandLabel],
      ['size', content.sizeId, content.sizeLabel],
      ['condition', content.conditionId, content.conditionLabel],
      ['package', content.packageSizeId, ''],
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
      const value = fields(input, [
        'content',
        'images',
        'aiPhoto',
        'bump',
        'connectionId',
        'inventoryItemId',
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
      return Object.freeze({
        content: content(value['content']),
        images: Object.freeze(images),
        connectionId,
        inventoryItemId: value['inventoryItemId'] === null ? null : uuid(value['inventoryItemId']),
        aiPhoto: value['aiPhoto'],
        bump: false,
      });
    }

    return snapshot;
  })();
  root.FlipbaseVintedListingRuntime = Object.freeze({
    parseSnapshot,
    parseChoices,
    collectChoices,
    collectFormMetadata,
    isResult,
    validateSubmission,
  });
  if (typeof module !== 'undefined' && module.exports)
    module.exports = root.FlipbaseVintedListingRuntime;
})(globalThis);

// Öffentliche Kategorie-/Formularmerkmale aus dem gemessenen Anbieteraufbau, ohne Plattformschreibaktion.
(function exposeKleinanzeigenFormReader(root) {
  const path = (value) =>
    typeof value === 'string' &&
    value.length <= 160 &&
    /^[1-9][0-9]*(?:\/[a-z0-9_]+){0,5}$/u.test(value);
  const label = (node) => (node.textContent ?? '').replace(/\s+/gu, ' ').trim();
  function categoryUrl(value, base) {
    try {
      const url = new URL(value, base);
      return url.protocol === 'https:' &&
        ['www.kleinanzeigen.de', 'kleinanzeigen.de'].includes(url.hostname) &&
        !url.port &&
        !url.username &&
        !url.password &&
        url.pathname === '/p-kategorie-aendern.html' &&
        !url.search
        ? url
        : null;
    } catch {
      return null;
    }
  }
  function readCategories(doc) {
    const url = categoryUrl(doc.URL, doc.URL);
    if (!url) return null;
    const selected = url.hash ? (new URLSearchParams(url.hash.slice(2)).get('path') ?? '') : '';
    if (selected && !path(selected)) return null;
    const box = doc.querySelector('#postad-category-select-box');
    if (!box) return null;
    const all = [];
    for (const link of box.querySelectorAll('a[id^="cat_"]')) {
      const target = categoryUrl(link.getAttribute('href'), doc.URL);
      if (!target || !target.hash.startsWith('#?')) return null;
      const params = new URLSearchParams(target.hash.slice(2));
      const value = params.get('path');
      const parent = params.get('isParent');
      const text = label(link);
      if (
        !path(value) ||
        link.id !== 'cat_' + value.split('/').at(-1) ||
        !['true', 'undefined'].includes(parent) ||
        !text ||
        text.length > 200
      )
        return null;
      all.push({ path: value, label: text, isParent: parent === 'true' });
    }
    if (
      !all.length ||
      all.length > 300 ||
      new Set(all.map((item) => item.path)).size !== all.length
    )
      return null;
    const current = selected ? all.find((item) => item.path === selected) : null;
    if (selected && !current) return null;
    const continueButtons = Array.from(doc.querySelectorAll('button[type="submit"]')).filter(
      (button) => label(button) === 'Weiter',
    );
    let canContinue = false;
    if (continueButtons.length) {
      if (continueButtons.length !== 1) return null;
      const form = continueButtons[0].closest('form');
      let action;
      try {
        action = new URL(form?.getAttribute('action'), doc.URL);
      } catch {
        return null;
      }
      if (
        action.origin !== url.origin ||
        action.pathname !== '/p-anzeige-aufgeben-schritt2.html' ||
        form.getAttribute('method')?.toLowerCase() !== 'post'
      )
        return null;
      canContinue =
        !!current &&
        !current.isParent &&
        !continueButtons[0].disabled &&
        continueButtons[0].getAttribute('aria-disabled') !== 'true';
    }
    const depth = selected ? selected.split('/').length + 1 : 1;
    const prefix = selected ? selected + '/' : '';
    const choices = all.filter(
      (item) => item.path.startsWith(prefix) && item.path.split('/').length === depth,
    );
    const labels = [];
    if (selected) {
      const parts = selected.split('/');
      for (let index = 0; index < parts.length; index++) {
        const choice = all.find((item) => item.path === parts.slice(0, index + 1).join('/'));
        if (!choice) return null;
        labels.push(choice.label);
      }
    }
    return {
      path: selected,
      label: labels.join(' > '),
      choices,
      selectedLeaf: !!current && !current.isParent,
      canContinue,
    };
  }
  function readSelectOptions(doc, key) {
    if (typeof key !== 'string' || !/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/u.test(key)) return null;
    const options = Array.from(doc.querySelectorAll('[role="option"]')).filter((node) =>
      node.id.startsWith(key + '-menu-option-'),
    );
    if (!options.length || options.length > 250) return null;
    const choices = [];
    for (const node of options) {
      const text = label(node);
      if (text === 'Bitte wählen') continue;
      if (!text || text.length > 200) return null;
      if (node.getAttribute('aria-disabled') === 'true') continue;
      choices.push({ value: text, label: text });
    }
    return choices.length && new Set(choices.map((item) => item.value)).size === choices.length
      ? choices
      : null;
  }
  function readConditionOptions(doc) {
    const dialogs = Array.from(doc.querySelectorAll('dialog[open]')).filter(
      (dialog) => dialog.getAttribute('aria-labelledby') === 'modal-conditions-title',
    );
    if (dialogs.length !== 1) return null;
    const choices = [];
    for (const input of dialogs[0].querySelectorAll('input[type="radio"]')) {
      const text = Array.from(input.labels ?? [])
        .map(label)
        .join(' ');
      const value = input.value;
      if (!/^[a-z0-9_]+$/u.test(value) || !text || text.length > 200) return null;
      choices.push({ value, label: text });
    }
    return choices.length > 0 &&
      choices.length <= 30 &&
      new Set(choices.map((item) => item.value)).size === choices.length
      ? choices
      : null;
  }
  function readBase(doc, expectedAccountId) {
    const identity = root.FlipbaseKleinanzeigenReader?.pageIdentity(
      doc,
      '/p-anzeige-aufgeben-schritt2.html',
    );
    if (
      !identity ||
      identity.externalAccountId !== expectedAccountId ||
      identity.accountType !== 'private'
    )
      return null;
    for (const [id, max] of [
      ['ad-title', 65],
      ['ad-description', 4000],
      ['ad-price-amount', 8],
      ['ad-zip-code', 5],
    ])
      if (doc.getElementById(id)?.maxLength !== max) return null;
    const category = label(doc.getElementById('ad-category-path') ?? { textContent: '' });
    if (!category || category.length > 600) return null;
    const fields = [];
    let prefix;
    for (const node of doc.querySelectorAll('[role="combobox"]')) {
      if (node.id === 'ad-price-type') continue;
      const match = /^([a-z][a-z0-9_]*)\.([a-z0-9_]+)$/u.exec(node.id);
      if (
        !match ||
        (prefix && prefix !== match[1]) ||
        !['BUTTON', 'INPUT'].includes(node.tagName) ||
        !['true', 'false'].includes(node.getAttribute('aria-required'))
      )
        return null;
      prefix = match[1];
      if (match[2] === 'art') continue;
      const labels = Array.from(doc.querySelectorAll('label')).filter(
        (candidate) => candidate.htmlFor === node.id,
      );
      if (labels.length !== 1) return null;
      const name = label(labels[0]);
      if (!name || name.length > 200) return null;
      fields.push({
        key: node.id,
        label: name,
        kind: node.tagName === 'INPUT' ? 'search' : 'select',
        selection: 'label',
        required: node.getAttribute('aria-required') === 'true',
      });
    }
    const condition = Array.from(doc.querySelectorAll('input[type="hidden"]')).filter(
      (node) => node.name === 'attributeMap[' + prefix + '.condition]',
    );
    const conditionButtons = Array.from(
      doc.querySelectorAll('button[aria-haspopup="dialog"]'),
    ).filter((node) => label(node).startsWith('Zustand auswählen'));
    if (condition.length !== 1 || conditionButtons.length !== 1 || !prefix || fields.length > 29)
      return null;
    fields.push({
      key: prefix + '.condition',
      label: 'Zustand',
      kind: 'select',
      selection: 'value',
      required: false,
    });
    if (
      !['ad-shipping-enabled-yes', 'ad-shipping-enabled-no', 'ad-shipping-options'].every((id) =>
        doc.getElementById(id),
      )
    )
      return null;
    return {
      externalAccountId: identity.externalAccountId,
      categoryLabel: category,
      titleMax: 65,
      descriptionMax: 4000,
      photoCountMax: 20,
      photoBytesMax: 12582912,
      priceStepCents: 100,
      fields,
    };
  }
  function shippingDialog(doc) {
    const dialogs = Array.from(doc.querySelectorAll('dialog[open]')).filter((dialog) =>
      Array.from(dialog.querySelectorAll('h2')).some((node) => label(node) === 'Versandmethoden'),
    );
    return dialogs.length === 1 ? dialogs[0] : null;
  }
  function readShippingGroups(doc) {
    const dialog = shippingDialog(doc);
    if (!dialog) return null;
    const inputs = Array.from(dialog.querySelectorAll('input[type="radio"]'));
    const result = inputs.map((input) => ({
      value: input.value,
      label: Array.from(input.labels ?? [])
        .map(label)
        .join(' '),
    }));
    return result.length > 0 &&
      result.length <= 10 &&
      result.every(
        (item) => /^[A-Z_]+$/u.test(item.value) && item.label && item.label.length <= 200,
      ) &&
      new Set(result.map((item) => item.value)).size === result.length
      ? result
      : null;
  }
  function readShippingMethods(doc) {
    const dialog = shippingDialog(doc);
    if (!dialog) return null;
    const inputs = Array.from(dialog.querySelectorAll('input[type="checkbox"]'));
    const selected = [];
    const choices = [];
    for (const input of inputs) {
      const value = input.value;
      const name = Array.from(input.labels ?? [])
        .map(label)
        .join(' ');
      const descriptions = (input.getAttribute('aria-describedby') ?? '')
        .split(/\s+/u)
        .filter(Boolean)
        .map((id) => doc.getElementById(id));
      if (
        !/^[A-Z]+_[0-9]+$/u.test(value) ||
        !name ||
        name.length > 200 ||
        descriptions.some((node) => !node || !dialog.contains(node))
      )
        return null;
      const container = input.parentElement?.parentElement;
      const measuredContainer =
        container?.tagName === 'DIV' &&
        dialog.contains(container) &&
        container.querySelectorAll('input[type="checkbox"]').length === 1 &&
        Array.from(input.labels ?? []).every((node) => container.contains(node)) &&
        descriptions.every((node) => container.contains(node));
      const visible = measuredContainer ? label(container) : descriptions.map(label).join(' ');
      const description = visible.startsWith(name) ? visible.slice(name.length).trim() : visible;
      if (description.length > 1000) return null;
      choices.push({ value, label: name, description });
      if (input.checked) selected.push(value);
    }
    return choices.length > 0 &&
      choices.length <= 20 &&
      new Set(choices.map((item) => item.value)).size === choices.length
      ? { choices, selected }
      : null;
  }
  root.FlipbaseKleinanzeigenFormReader = Object.freeze({
    validPath: path,
    readCategories,
    readSelectOptions,
    readConditionOptions,
    readBase,
    readShippingGroups,
    readShippingMethods,
  });
})(globalThis);

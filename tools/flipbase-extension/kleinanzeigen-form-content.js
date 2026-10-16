// Nur eigene, vom Hintergrunddienst angelegte Formular-Tabs. Kein Speichern oder Inserieren.
(function exposeFormContent(root) {
  const reader = root.FlipbaseKleinanzeigenFormReader;
  if (!reader || window.top !== window) return;
  let busy = false;
  const text = (node) => (node.textContent ?? '').replace(/\s+/gu, ' ').trim();
  const wait = async (read) => {
    const end = Date.now() + 4000;
    while (Date.now() < end) {
      const value = read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('schema_changed');
  };
  const button = (container, name) => {
    const nodes = Array.from(container.querySelectorAll('button')).filter(
      (node) =>
        text(node) === name && !node.disabled && node.getAttribute('aria-disabled') !== 'true',
    );
    if (nodes.length !== 1) throw new Error('schema_changed');
    return nodes[0];
  };
  const shippingDialog = () =>
    Array.from(document.querySelectorAll('dialog[open]')).find((dialog) =>
      Array.from(dialog.querySelectorAll('h2')).some((node) => text(node) === 'Versandmethoden'),
    );
  async function collect(expectedAccountId, categoryPath, categoryLabel) {
    const base = reader.readBase(document, expectedAccountId);
    if (!base) throw new Error('schema_changed');
    const fields = [];
    try {
      for (const field of base.fields) {
        if (field.kind === 'search') {
          fields.push({ ...field, choices: [] });
          continue;
        }
        if (field.key.endsWith('.condition')) {
          const triggers = Array.from(
            document.querySelectorAll('button[aria-haspopup="dialog"]'),
          ).filter((node) => text(node).startsWith('Zustand auswählen'));
          if (triggers.length !== 1) throw new Error('schema_changed');
          triggers[0].click();
          const choices = await wait(() => reader.readConditionOptions(document));
          const dialog = document.querySelector(
            'dialog[open][aria-labelledby="modal-conditions-title"]',
          );
          button(dialog, 'Abbrechen').click();
          await wait(() => !document.querySelector('dialog[open]'));
          fields.push({
            ...field,
            choices: choices.map((choice) => ({ ...choice, description: '' })),
          });
        } else {
          const control = document.getElementById(field.key);
          control.click();
          const choices = await wait(() => reader.readSelectOptions(document, field.key));
          control.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
          );
          await wait(() => control.getAttribute('aria-expanded') !== 'true');
          fields.push({
            ...field,
            choices: choices.map((choice) => ({ ...choice, description: '' })),
          });
        }
      }
      document.getElementById('ad-shipping-options').click();
      const original = await wait(() => reader.readShippingMethods(document));
      button(shippingDialog(), 'Andere Versandmethoden').click();
      const sizes = await wait(() => reader.readShippingGroups(document));
      const selected = Array.from(shippingDialog().querySelectorAll('input[type="radio"]')).find(
        (input) => input.checked,
      )?.value;
      if (!sizes.some((size) => size.value === selected)) throw new Error('schema_changed');
      const groups = [];
      for (let index = 0; index < sizes.length; index++) {
        const size = sizes[index];
        const radios = Array.from(shippingDialog().querySelectorAll('input[type="radio"]')).filter(
          (input) => input.value === size.value,
        );
        if (radios.length !== 1) throw new Error('schema_changed');
        radios[0].click();
        await wait(() => radios[0].checked);
        button(shippingDialog(), 'Weiter').click();
        const methods = await wait(() => reader.readShippingMethods(document));
        groups.push({ ...size, choices: methods.choices });
        if (index < sizes.length - 1) {
          button(shippingDialog(), 'Zurück').click();
          await wait(() => reader.readShippingGroups(document));
        }
      }
      button(shippingDialog(), 'Schließen').click();
      await wait(() => !shippingDialog());
      if (!reader.readBase(document, expectedAccountId)) throw new Error('account_changed');
      return {
        categoryPath,
        categoryLabel,
        titleMax: base.titleMax,
        descriptionMax: base.descriptionMax,
        photoCountMax: base.photoCountMax,
        photoBytesMax: base.photoBytesMax,
        priceStepCents: base.priceStepCents,
        fields,
        shipping: { defaultGroup: selected, defaultMethods: original.selected, groups },
      };
    } finally {
      const open = Array.from(document.querySelectorAll('dialog[open]'));
      for (const dialog of open) {
        const close = Array.from(dialog.querySelectorAll('button')).find(
          (node) => text(node) === 'Abbrechen' || text(node) === 'Schließen',
        );
        close?.click();
      }
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      message?.type !== 'KLEINANZEIGEN_FORM_STEP'
    )
      return false;
    const now = Date.now();
    if (
      busy ||
      !Number.isFinite(message.minimumDocumentTime) ||
      message.minimumDocumentTime > now + 1000 ||
      message.minimumDocumentTime < now - 180000 ||
      performance.timeOrigin < message.minimumDocumentTime ||
      typeof message.expectedExternalAccountId !== 'string'
    )
      return false;
    if (
      !/^[1-9][0-9]{0,31}$/u.test(message.expectedExternalAccountId) ||
      (message.categoryPath !== '' && !reader.validPath(message.categoryPath))
    )
      return false;
    busy = true;
    Promise.resolve()
      .then(async () => {
        if (message.action === 'enter_categories') {
          if (
            !root.FlipbaseKleinanzeigenReader.pageIdentity(
              document,
              '/p-anzeige-aufgeben-schritt2.html',
            ) ||
            root.FlipbaseKleinanzeigenReader.pageIdentity(
              document,
              '/p-anzeige-aufgeben-schritt2.html',
            ).externalAccountId !== message.expectedExternalAccountId
          )
            throw new Error('account_changed');
          const links = Array.from(document.querySelectorAll('a')).filter((node) =>
            ['Kategorie ändern', 'Wähle deine Kategorie'].includes(text(node)),
          );
          if (links.length !== 1) throw new Error('schema_changed');
          links[0].click();
          return { moving: true };
        }
        if (message.action === 'categories') {
          const result = reader.readCategories(document);
          if (!result || result.path !== message.categoryPath) throw new Error('schema_changed');
          return result;
        }
        if (message.action === 'choose_category') {
          const before = reader.readCategories(document);
          const choice = before?.choices.find((item) => item.path === message.categoryPath);
          if (!choice) throw new Error('schema_changed');
          const node = document.getElementById('cat_' + choice.path.split('/').at(-1));
          node.click();
          return await wait(() => {
            const result = reader.readCategories(document);
            return result?.path === choice.path ? result : null;
          });
        }
        if (message.action === 'continue_category') {
          const category = reader.readCategories(document);
          if (
            category?.path !== message.categoryPath ||
            !category.selectedLeaf ||
            !category.canContinue
          )
            throw new Error('schema_changed');
          button(document, 'Weiter').click();
          return { moving: true };
        }
        if (
          message.action === 'schema' &&
          reader.validPath(message.categoryPath) &&
          typeof message.categoryLabel === 'string'
        )
          return await collect(
            message.expectedExternalAccountId,
            message.categoryPath,
            message.categoryLabel,
          );
        throw new Error('unsupported');
      })
      .then(
        (result) => {
          busy = false;
          respond({ success: true, result });
        },
        (error) => {
          busy = false;
          respond({
            success: false,
            errorCode: ['account_changed', 'unsupported'].includes(error?.message)
              ? error.message
              : 'schema_changed',
          });
        },
      );
    return true;
  });
})(globalThis);

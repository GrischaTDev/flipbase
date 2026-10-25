// Eigene Anzeigen lesen und genau die ausdrücklich ausgewählte Altanzeige entfernen.
(function defineRelistingContent(root) {
  const text = (node) => (node?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  const imageUrl = (value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        ['img.kleinanzeigen.de', 'img.classistatic.de', 'i.ebayimg.com'].includes(url.hostname)
      );
    } catch {
      return false;
    }
  };
  function readSource(doc, externalAccountId, externalId) {
    const url = new URL(doc.URL);
    const identity = root.FlipbaseKleinanzeigenReader.pageIdentity(
      doc,
      '/p-anzeige-bearbeiten.html',
    );
    const value = (id) => doc.getElementById(id)?.value ?? '';
    const hidden = (name) =>
      [...doc.querySelectorAll('input[type="hidden"]')].filter((node) => node.name === name);
    if (
      identity?.externalAccountId !== externalAccountId ||
      identity.accountType !== 'private' ||
      url.searchParams.get('adId') !== externalId ||
      hidden('adId').length !== 1 ||
      hidden('adId')[0].value !== externalId ||
      !doc.getElementById('ad-type-OFFER')?.checked
    )
      throw new Error('source_changed');
    const title = value('ad-title');
    const description = value('ad-description');
    const amount = value('ad-price-amount');
    const priceType = text(doc.getElementById('ad-price-type')).startsWith('VB')
      ? 'NEGOTIABLE'
      : text(doc.getElementById('ad-price-type')).startsWith('Festpreis')
        ? 'FIXED'
        : null;
    if (
      !title.trim() ||
      title.length > 65 ||
      !description.trim() ||
      description.length > 4000 ||
      !/^[0-9]{1,8}$/u.test(amount) ||
      !priceType ||
      !/^\d{5}$/u.test(value('ad-zip-code'))
    )
      throw new Error('invalid_fields');
    const fields = {};
    let categoryLabel = text(doc.getElementById('ad-category-path'));
    for (const input of doc.querySelectorAll('input[type="hidden"]')) {
      const match = /^attributeMap\[([a-z][a-z0-9_]*\.[a-z0-9_]+)\]$/u.exec(input.name);
      if (!match) continue;
      const key = match[1];
      const control = doc.getElementById(key);
      const selected = key.endsWith('.condition')
        ? input.value
        : control?.tagName === 'INPUT'
          ? control.value
          : text(control);
      if (typeof selected !== 'string' || selected.length > 200) throw new Error('invalid_fields');
      if (selected && selected !== 'Bitte wählen') fields[key] = selected;
      if (key.endsWith('.art') && selected && selected !== 'Bitte wählen')
        categoryLabel += ' > ' + selected;
    }
    const images = [...doc.querySelectorAll('input[type="hidden"]')].filter((node) =>
      /^adImages\[[0-9]+\]\.url$/u.test(node.name),
    );
    const displayedImages = [...doc.querySelectorAll('img[alt="Bild zur Anzeige"]')];
    if (
      !categoryLabel ||
      displayedImages.length !== images.length ||
      doc.querySelector('[role="progressbar"]') ||
      images.length > 20 ||
      images.some((node, index) => node.name !== `adImages[${index}].url` || !imageUrl(node.value))
    )
      throw new Error('images_incomplete');
    const shipping = [...doc.querySelectorAll('input[type="hidden"]')]
      .filter((node) => /^shippingOptions\[[0-9]+\]\.id$/u.test(node.name))
      .map((node) => node.value);
    const both = doc.getElementById('ad-shipping-enabled-yes')?.checked === true;
    if (!both && !doc.getElementById('ad-shipping-enabled-no')?.checked)
      throw new Error('invalid_fields');
    return {
      externalId,
      categoryLabel,
      shippingMethods: shipping,
      content: {
        title,
        description,
        priceCents: Number(amount) * 100,
        currency: 'EUR',
        priceType,
        shippingType: both ? 'both' : 'pickup',
        postalCode: value('ad-zip-code'),
        categoryFields: fields,
        buyNow: doc.getElementById('ad-buy-now-true')?.checked === true,
      },
      imageUrls: images.map((node) => node.value),
    };
  }
  async function remove(doc, accountId, externalId, expectedTitle) {
    const reader = root.FlipbaseKleinanzeigenReader;
    const check = () => {
      if (reader.pageIdentity(doc, '/m-meine-anzeigen.html')?.externalAccountId !== accountId)
        throw new Error('account_changed');
    };
    check();
    const links = [...doc.querySelectorAll('a')].filter((node) => {
      try {
        const url = new URL(node.href, doc.URL);
        return (
          url.origin === new URL(doc.URL).origin &&
          url.pathname === '/p-anzeige-bearbeiten.html' &&
          url.searchParams.get('adId') === externalId
        );
      } catch {
        return false;
      }
    });
    if (links.length !== 1 || doc.querySelector('dialog[open],[role="dialog"]'))
      throw new Error('source_changed');
    let card = links[0].parentElement;
    while (card && card !== doc.body && !card.querySelector('h3')) card = card.parentElement;
    const title = text(card?.querySelector('h3')).replace(/^Anzeige\s+/u, '');
    const buttons = [...(card?.querySelectorAll('button') ?? [])].filter(
      (node) => text(node) === 'Löschen' && !node.disabled,
    );
    if (title !== expectedTitle || buttons.length !== 1) throw new Error('source_changed');
    check();
    buttons[0].click();
    const end = Date.now() + 20000;
    let confirmationClicked = false;
    while (Date.now() < end) {
      check();
      const page = reader.readPublicationPage(doc);
      if (page && !page.items.some((item) => item.externalId === externalId))
        return { confirmed: true };
      const dialogs = [...doc.querySelectorAll('dialog[open],[role="dialog"]')].filter((node) =>
        /Anzeige.*löschen/iu.test(text(node)),
      );
      if (dialogs.length === 1 && !confirmationClicked) {
        const confirm = [...dialogs[0].querySelectorAll('button')].filter(
          (node) =>
            ['Löschen', 'Anzeige löschen', 'Ja, löschen'].includes(text(node)) &&
            !node.disabled &&
            node.getAttribute('aria-disabled') !== 'true',
        );
        if (confirm.length !== 1) return { confirmed: false };
        check();
        confirmationClicked = true;
        confirm[0].click();
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { confirmed: false };
  }
  root.FlipbaseKleinanzeigenRelistingContent = Object.freeze({ readSource, remove });
  if (!root.chrome?.runtime?.onMessage || window.top !== window) return;
  let busy = false;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      message?.type !== 'KLEINANZEIGEN_RELISTING_STEP' ||
      busy ||
      !/^[1-9][0-9]{0,31}$/u.test(message.externalId ?? '') ||
      !/^[1-9][0-9]{0,31}$/u.test(message.expectedExternalAccountId ?? '') ||
      !Number.isFinite(message.minimumDocumentTime) ||
      performance.timeOrigin < message.minimumDocumentTime ||
      Date.now() - message.minimumDocumentTime > 900000 ||
      message.minimumDocumentTime > Date.now() + 1000
    )
      return false;
    busy = true;
    Promise.resolve()
      .then(() => {
        if (message.action === 'read')
          return readSource(document, message.expectedExternalAccountId, message.externalId);
        if (message.action === 'remove')
          return remove(
            document,
            message.expectedExternalAccountId,
            message.externalId,
            message.title,
          );
        throw new Error('unsupported');
      })
      .then(
        (result) => respond({ success: true, result }),
        (error) => respond({ success: false, errorCode: error.message }),
      )
      .finally(() => {
        busy = false;
      });
    return true;
  });
})(globalThis);

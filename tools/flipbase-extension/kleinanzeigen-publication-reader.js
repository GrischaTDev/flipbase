// Gemessener Privatkonto-Aufbau. „free“ gilt nur zusammen mit der frischen offiziellen Kontingentprüfung.
(function definePublicationReader(root) {
  const text = (node) => (node?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  function postingButton(doc) {
    const nodes = Array.from(doc.querySelectorAll('button[type="button"]')).filter(
      (node) =>
        text(node) === 'Anzeige aufgeben' &&
        !node.disabled &&
        node.getAttribute('aria-disabled') !== 'true',
    );
    return nodes.length === 1 ? nodes[0] : null;
  }
  function visible(node, doc, cache) {
    if (!node) return false;
    if (cache.has(node)) return cache.get(node);
    const parent = node.parentElement;
    const style = doc.defaultView?.getComputedStyle(node);
    const own =
      !node.hidden &&
      node.getAttribute('aria-hidden') !== 'true' &&
      !(node.tagName === 'DIALOG' && !node.open) &&
      style?.display !== 'none' &&
      style?.visibility !== 'hidden';
    const value = own && (!parent || visible(parent, doc, cache));
    cache.set(node, value);
    return value;
  }
  function readFee(doc, externalAccountId) {
    const observedAt = new Date().toISOString();
    const answer = (state) => ({ state, observedAt });
    const extras = Array.from(doc.querySelectorAll('input[name="articles"]'));
    if (extras.some((node) => node.checked)) return answer('paid');
    const main = doc.querySelector('main');
    if (!main) return answer('unknown');
    const ignored = new Set(extras.map((node) => node.closest('[role="group"]')).filter(Boolean));
    const buyNo = doc.getElementById('ad-buy-now-false');
    let buy = buyNo?.parentElement;
    while (buy && buy !== main && !buy.querySelector('#ad-buy-now-true')) buy = buy.parentElement;
    if (buy && buy !== main) ignored.add(buy);
    const walker = doc.createTreeWalker(main, 4);
    const remaining = [];
    const visibility = new WeakMap();
    let node;
    while ((node = walker.nextNode())) {
      if (
        !node.parentElement ||
        node.parentElement.closest('script,style,input,textarea,select,[hidden]') ||
        !visible(node.parentElement, doc, visibility) ||
        [...ignored].some((container) => container.contains(node))
      )
        continue;
      const value = text(node);
      if (!value || value === 'Kostenpflichtige Optionen') continue;
      remaining.push(value);
    }
    const costText = remaining
      .filter((value) =>
        /(?:gebühr|kostenpflicht|zahlungsschritt|zahlungspflicht|zu zahlen|gesamtbetrag|gesamtkosten|bezahlen)/iu.test(
          value,
        ),
      )
      .join(' ');
    if (costText) {
      if (/(?:[1-9][0-9]*(?:[.,][0-9]{2})?|0[.,](?:0[1-9]|[1-9][0-9]))\s*(?:€|EUR)/u.test(costText))
        return answer('paid');
      return answer('unknown');
    }
    if (
      !root.FlipbaseKleinanzeigenFormReader?.readBase(doc, externalAccountId) ||
      !postingButton(doc) ||
      doc.querySelector('dialog[open]') ||
      !doc.getElementById('ad-type-OFFER')?.checked ||
      !buyNo?.checked ||
      doc.getElementById('ad-address-visibility')?.checked ||
      doc.getElementById('ad-marketing-consent')?.checked
    )
      return answer('unknown');
    const unknownChecked = Array.from(main.querySelectorAll('input[type="checkbox"]')).some(
      (node) => {
        if (!node.checked || node.name === 'articles') return false;
        const dialog = node.closest('dialog');
        return !(
          dialog &&
          !dialog.open &&
          Array.from(dialog.querySelectorAll('h2')).some(
            (heading) => text(heading) === 'Versandmethoden',
          )
        );
      },
    );
    if (unknownChecked) return answer('unknown');
    const expected = ['0:204', '0:914', '0:62', '0:488'];
    if (
      extras.length !== expected.length ||
      extras.some(
        (node) =>
          node.type !== 'checkbox' ||
          node.getAttribute('data-includedfp') !== 'false' ||
          !expected.includes(node.value),
      ) ||
      new Set(extras.map((node) => node.value)).size !== expected.length
    )
      return answer('unknown');
    if (
      Array.from(doc.querySelectorAll('[role="alert"],[aria-invalid="true"]')).some(
        (node) =>
          visible(node, doc, visibility) &&
          (text(node) || node.getAttribute('aria-invalid') === 'true'),
      )
    )
      return answer('unknown');
    return answer('free');
  }
  function photoContainer(doc) {
    const inputs = doc.querySelectorAll('input[type="file"]');
    if (inputs.length !== 1 || !inputs[0].multiple) return null;
    let node = inputs[0];
    for (let index = 0; node && index < 5; index++) node = node.parentElement;
    return node && text(node).startsWith('Bilder') ? node : null;
  }
  function readPhotos(doc) {
    const container = photoContainer(doc);
    if (!container) return null;
    const images = Array.from(container.querySelectorAll('img'));
    if (
      images.length > 20 ||
      container.querySelector('[role="progressbar"],[aria-busy="true"],[role="alert"]')
    )
      return null;
    const paths = [];
    for (const image of images) {
      let address;
      try {
        address = new URL(image.currentSrc || image.src);
      } catch {
        return null;
      }
      if (
        address.protocol !== 'https:' ||
        address.username ||
        address.password ||
        !image.complete ||
        image.naturalWidth < 1 ||
        image.naturalHeight < 1
      )
        return null;
      paths.push(address.href);
    }
    return new Set(paths).size === paths.length ? paths : null;
  }
  root.FlipbaseKleinanzeigenPublicationReader = Object.freeze({
    readFee,
    postingButton,
    readPhotos,
  });
})(globalThis);

// Nur Aufträge des eigenen Hintergrunddienstes. Ein Klick ist niemals ein Erfolgsbeleg.
(function definePublicationContent(root) {
  const text = (node) => (node?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  const fail = (code) => {
    throw new Error(code);
  };
  async function wait(read, timeout = 5000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return fail('schema_changed');
  }
  function button(doc, name) {
    const nodes = Array.from(doc.querySelectorAll('button')).filter(
      (node) =>
        text(node) === name && !node.disabled && node.getAttribute('aria-disabled') !== 'true',
    );
    return nodes.length === 1 ? nodes[0] : fail('schema_changed');
  }
  function create(doc) {
    const core = root.FlipbaseAutofill;
    const reader = root.FlipbaseKleinanzeigenPublicationReader;
    let fingerprint = null;
    let expectedJob = null;
    let expectedCategoryLabel = null;
    const uploaded = [];
    let uploadedPaths = [];
    const identity = (job) => {
      const value = root.FlipbaseKleinanzeigenReader.pageIdentity(
        doc,
        '/p-anzeige-aufgeben-schritt2.html',
      );
      if (value?.externalAccountId !== job.externalAccountId || value.accountType !== 'private')
        fail('account_changed');
      return value;
    };
    const input = (id, value) => {
      const node = doc.getElementById(id);
      if (!node || !core.setFieldValue(node, value)) fail('invalid_fields');
      return node;
    };
    const radio = (id) => {
      const node = doc.getElementById(id);
      if (node?.type !== 'radio') fail('schema_changed');
      if (!node.checked) node.click();
      if (!node.checked) fail('invalid_fields');
    };
    function state(job) {
      const fields = [
        'ad-title',
        'ad-description',
        'ad-price-amount',
        'ad-zip-code',
        'ad-city',
        'ad-name',
      ];
      const values = fields.map((id) => doc.getElementById(id)?.value ?? null);
      values.push(
        root.FlipbaseKleinanzeigenFormReader.readCategory(
          doc,
          job.content.categoryId,
          expectedCategoryLabel,
        ),
      );
      values.push(
        text(doc.getElementById('ad-price-type')),
        Boolean(doc.getElementById('ad-buy-now-false')?.checked),
        Boolean(
          doc.getElementById(
            job.content.shippingType === 'pickup'
              ? 'ad-shipping-enabled-no'
              : 'ad-shipping-enabled-yes',
          )?.checked,
        ),
        text(doc.getElementById('ad-shipping-options')),
      );
      for (const key of Object.keys(job.content.categoryFields)
        .filter((key) => !key.startsWith('ad-shipping-'))
        .sort()) {
        const node = doc.getElementById(key);
        const hidden = Array.from(doc.querySelectorAll('input[type="hidden"]')).find(
          (node) => node.name === 'attributeMap[' + key + ']',
        );
        values.push(key, hidden?.value ?? (node?.tagName === 'INPUT' ? node.value : text(node)));
      }
      return JSON.stringify(values);
    }
    async function chooseField(field, value) {
      if (!value) return;
      if (field.key.endsWith('.condition')) {
        const trigger = Array.from(doc.querySelectorAll('button[aria-haspopup="dialog"]')).filter(
          (node) => text(node).startsWith('Zustand auswählen'),
        );
        if (trigger.length !== 1) fail('schema_changed');
        trigger[0].click();
        const dialog = await wait(() =>
          doc.querySelector('dialog[open][aria-labelledby="modal-conditions-title"]'),
        );
        const options = Array.from(dialog.querySelectorAll('input[type="radio"]')).filter(
          (node) => node.value === value,
        );
        if (options.length !== 1) fail('invalid_fields');
        options[0].click();
        button(dialog, 'Bestätigen').click();
        await wait(() => !doc.querySelector('dialog[open]'));
        const hidden = Array.from(doc.querySelectorAll('input[type="hidden"]')).find(
          (node) => node.name === 'attributeMap[' + field.key + ']',
        );
        if (hidden?.value !== value) fail('invalid_fields');
        return;
      }
      const control = doc.getElementById(field.key);
      if (!control) fail('schema_changed');
      if (field.kind === 'search') input(field.key, value);
      else control.click();
      const option = await wait(() => {
        const values = Array.from(doc.querySelectorAll('[role="option"]')).filter(
          (node) =>
            node.id.startsWith(field.key + '-menu-option-') &&
            text(node) === value &&
            node.getAttribute('aria-disabled') !== 'true',
        );
        return values.length === 1 ? values[0] : null;
      });
      option.click();
      await wait(() => control.getAttribute('aria-expanded') !== 'true');
      if ((control.tagName === 'INPUT' ? control.value : text(control)) !== value)
        fail('invalid_fields');
    }
    async function shipping(job, schema) {
      radio(
        job.content.shippingType === 'pickup'
          ? 'ad-shipping-enabled-no'
          : 'ad-shipping-enabled-yes',
      );
      if (job.content.shippingType === 'pickup') return;
      const values = job.content.categoryFields;
      const group = values['ad-shipping-package-size'];
      let methods;
      try {
        methods = JSON.parse(values['ad-shipping-options']);
      } catch {
        fail('invalid_fields');
      }
      const offer = schema.shipping?.groups.find((value) => value.value === group);
      if (
        !offer ||
        !Array.isArray(methods) ||
        !methods.length ||
        methods.some((value) => !offer.choices.some((choice) => choice.value === value))
      )
        fail('invalid_fields');
      doc.getElementById('ad-shipping-options').click();
      const dialog = () =>
        Array.from(doc.querySelectorAll('dialog[open]')).find((node) =>
          Array.from(node.querySelectorAll('h2')).some(
            (value) => text(value) === 'Versandmethoden',
          ),
        );
      await wait(dialog);
      button(dialog(), 'Andere Versandmethoden').click();
      const size = await wait(() =>
        Array.from(dialog().querySelectorAll('input[type="radio"]')).find(
          (node) => node.value === group,
        ),
      );
      size.click();
      if (!size.checked) fail('invalid_fields');
      button(dialog(), 'Weiter').click();
      await wait(() => dialog().querySelector('input[type="checkbox"]'));
      const options = Array.from(dialog().querySelectorAll('input[type="checkbox"]'));
      if (
        options.length !== offer.choices.length ||
        options.some((node) => !offer.choices.some((choice) => choice.value === node.value))
      )
        fail('schema_changed');
      for (const option of options) {
        const selected = methods.includes(option.value);
        if (option.checked !== selected) option.click();
        if (option.checked !== selected) fail('invalid_fields');
      }
      button(dialog(), 'Fertig').click();
      await wait(() => !dialog());
      const displayed = text(doc.getElementById('ad-shipping-options'));
      if (
        methods.some(
          (value) =>
            !displayed.includes(offer.choices.find((choice) => choice.value === value).label),
        )
      )
        fail('invalid_fields');
    }
    async function fill(job, schema) {
      identity(job);
      const c = job.content;
      if (
        schema.categoryPath !== c.categoryId ||
        !root.FlipbaseKleinanzeigenFormReader.readCategory(doc, c.categoryId, schema.categoryLabel)
      )
        fail('category_changed');
      expectedCategoryLabel = schema.categoryLabel;
      if (
        !Number.isSafeInteger(c.priceCents) ||
        c.priceCents < 0 ||
        c.priceCents > 9999999900 ||
        c.priceCents % 100 !== 0 ||
        !c.title.trim() ||
        c.title.length > 65 ||
        !c.description.trim() ||
        c.description.length > 4000 ||
        !/^\d{5}$/u.test(c.postalCode ?? '') ||
        !['pickup', 'both'].includes(c.shippingType)
      )
        fail('invalid_fields');
      radio('ad-type-OFFER');
      input('ad-title', c.title);
      input('ad-description', c.description);
      input('ad-price-amount', String(c.priceCents / 100));
      if (!(await core.selectPriceType(doc, c.priceType, 5000))) fail('invalid_fields');
      input('ad-zip-code', c.postalCode);
      const name = doc.getElementById('ad-name');
      if (name && !name.value.trim()) input('ad-name', identity(job).displayName ?? '');
      await wait(() => doc.getElementById('ad-city')?.value.trim());
      if (!doc.getElementById('ad-name')?.value.trim()) fail('contact_details_required');
      for (const field of schema.fields)
        await chooseField(field, c.categoryFields[field.key] ?? '');
      await shipping(job, schema);
      radio(c.buyNow === true ? 'ad-buy-now-true' : 'ad-buy-now-false');
      identity(job);
      if (
        doc.getElementById('ad-title').value !== c.title ||
        doc.getElementById('ad-description').value !== c.description ||
        doc.getElementById('ad-price-amount').value !== String(c.priceCents / 100) ||
        doc.getElementById('ad-zip-code').value !== c.postalCode
      )
        fail('invalid_fields');
      fingerprint = state(job);
      expectedJob = job.id;
      return { valid: true };
    }
    async function upload(job, image, encoded) {
      identity(job);
      if (expectedJob !== job.id || typeof encoded !== 'string' || encoded.length > 18000000)
        fail('invalid_image');
      const index = job.images.findIndex((value) => value.imageId === image.imageId);
      if (index < 0) fail('invalid_image');
      if (uploaded[index] === image.sha256) return { complete: true, count: uploaded.length };
      if (index !== uploaded.length) fail('invalid_image');
      const before = reader.readPhotos(doc);
      if (
        !before ||
        before.length !== index ||
        before.some((path, at) => path !== uploadedPaths[at])
      )
        fail('images_incomplete');
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
      if (bytes.length !== image.byteSize) fail('invalid_image');
      const digest = Array.from(
        new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes)),
        (value) => value.toString(16).padStart(2, '0'),
      ).join('');
      if (digest !== image.sha256) fail('invalid_image');
      const file = new File([bytes], image.fileName, { type: image.mimeType });
      const inputs = doc.querySelectorAll('input[type="file"]');
      if (inputs.length !== 1 || !core.attachImages(inputs[0], [file])) fail('images_incomplete');
      const after = await wait(() => {
        const current = reader.readPhotos(doc);
        return current?.length === index + 1 && before.every((value, at) => current[at] === value)
          ? current
          : null;
      }, 45000);
      uploaded.push(image.sha256);
      uploadedPaths = [...after];
      identity(job);
      return { complete: true, count: after.length };
    }
    function nativeFieldsValid() {
      return Array.from(
        (doc.querySelector('main') ?? doc.body).querySelectorAll('input,textarea,select'),
      ).every((node) => {
        if (
          node.disabled ||
          node.type === 'hidden' ||
          node.closest('dialog:not([open]),[hidden],[aria-hidden="true"]')
        )
          return true;
        if (node.willValidate && !node.checkValidity()) return false;
        if (node.getAttribute('aria-required') === 'true') {
          if (['checkbox', 'radio'].includes(node.type)) return node.checked;
          return String(node.value ?? '').trim().length > 0;
        }
        return true;
      });
    }
    function verify(job) {
      identity(job);
      const paths = reader.readPhotos(doc);
      return {
        complete:
          expectedJob === job.id &&
          fingerprint === state(job) &&
          nativeFieldsValid() &&
          paths?.length === job.images.length &&
          uploaded.length === job.images.length &&
          paths.every((path, index) => path === uploadedPaths[index]),
      };
    }
    async function submitOnce(job) {
      identity(job);
      if (
        expectedJob !== job.id ||
        fingerprint !== state(job) ||
        !verify(job).complete ||
        reader.readFee(doc, job.externalAccountId, job.content.buyNow === true).state !== 'free'
      )
        fail('final_check_failed');
      const key = 'flipbase_kleinanzeigen_submit_' + job.id;
      if (doc.defaultView.sessionStorage.getItem(key)) fail('already_started');
      const target = reader.postingButton(doc);
      if (!target) fail('schema_changed');
      doc.defaultView.sessionStorage.setItem(key, 'started');
      target.click();
      return { clicked: true };
    }
    return {
      fill,
      upload,
      verify,
      submitOnce,
      fee: (job) => {
        identity(job);
        if (expectedJob !== job.id || fingerprint !== state(job))
          return { state: 'unknown', observedAt: new Date().toISOString() };
        return reader.readFee(doc, job.externalAccountId, job.content.buyNow === true);
      },
    };
  }
  root.FlipbaseKleinanzeigenPublicationContent = Object.freeze({ create });
  if (!root.chrome?.runtime?.onMessage || window.top !== window) return;
  const adapter = create(document);
  let current = null;
  let busy = false;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      message?.type !== 'KLEINANZEIGEN_JOB_STEP' ||
      busy ||
      !Number.isFinite(message.minimumDocumentTime) ||
      performance.timeOrigin < message.minimumDocumentTime ||
      Date.now() - message.minimumDocumentTime > 905000 ||
      message.minimumDocumentTime > Date.now() + 1000
    )
      return false;
    if (
      typeof message.attemptId !== 'string' ||
      !/^[a-f0-9-]{36}$/u.test(message.attemptId) ||
      typeof message.jobId !== 'string' ||
      !/^[1-9][0-9]*$/u.test(message.jobId) ||
      typeof message.expectedExternalAccountId !== 'string'
    )
      return false;
    if (message.action === 'prepare') {
      if (current) return false;
      if (
        message.job?.id !== message.jobId ||
        message.job.externalAccountId !== message.expectedExternalAccountId
      )
        return false;
      current = {
        jobId: message.jobId,
        attemptId: message.attemptId,
        job: message.job,
        schema: message.schema,
      };
      sessionStorage.setItem(
        'flipbase_kleinanzeigen_attempt',
        JSON.stringify({
          jobId: message.jobId,
          attemptId: message.attemptId,
          minimumDocumentTime: message.minimumDocumentTime,
        }),
      );
    }
    if (
      !current ||
      current.jobId !== message.jobId ||
      current.attemptId !== message.attemptId ||
      current.job.externalAccountId !== message.expectedExternalAccountId
    )
      return false;
    busy = true;
    Promise.resolve()
      .then(() => {
        const job = current.job;
        if (message.action === 'prepare') return adapter.fill(job, current.schema);
        if (message.action === 'upload') return adapter.upload(job, message.image, message.encoded);
        if (message.action === 'verify') return adapter.verify(job);
        if (message.action === 'fee') return adapter.fee(job);
        if (message.action === 'submit') return adapter.submitOnce(job);
        return fail('unsupported');
      })
      .then(
        (result) => respond({ success: true, result }),
        (error) =>
          respond({
            success: false,
            errorCode: /^[a-z_]{1,80}$/u.test(error?.message ?? '')
              ? error.message
              : 'preparation_failed',
          }),
      )
      .finally(() => {
        busy = false;
      });
    return true;
  });
})(globalThis);

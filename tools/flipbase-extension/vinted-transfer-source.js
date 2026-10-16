// Vollständige eigene Quelle: ausschließlich lesend über den belegten Bearbeitungs-Endpunkt.
(function exposeVintedTransferSource(root) {
  const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const id = (value) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : typeof value === 'string' && /^[1-9][0-9]{0,31}$/u.test(value)
        ? value
        : null;
  const failure = () =>
    new Error('Die vollständige eigene Vinted-Quelle konnte nicht bestätigt werden.');
  function photoUrl(value) {
    try {
      const url = new URL(value);
      return typeof value === 'string' &&
        value.length <= 2000 &&
        url.protocol === 'https:' &&
        ['images1.vinted.net', 'images2.vinted.net'].includes(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.hash
        ? value
        : null;
    } catch {
      return null;
    }
  }
  function parse(body, account, externalId) {
    const item = record(body) && record(body.item) ? body.item : null;
    if (
      !item ||
      id(item.id) !== externalId ||
      (record(item.user) && id(item.user.id) !== account) ||
      (item.user_id !== undefined && id(item.user_id) !== account) ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      item.title.length > 1000 ||
      typeof item.description !== 'string' ||
      item.description.length > 100000 ||
      !Array.isArray(item.photos) ||
      item.photos.length < 1 ||
      item.photos.length > 40
    )
      throw failure();
    const photos = item.photos.map((photo) => {
      if (!record(photo) || !id(photo.id)) throw failure();
      const url = photoUrl(photo.full_size_url ?? photo.url);
      if (!url) throw failure();
      return url;
    });
    if (new Set(photos).size !== photos.length) throw failure();
    const price = record(item.price) ? item.price : null;
    const currency = typeof price?.currency_code === 'string' ? price.currency_code : null;
    const amount =
      typeof price?.amount === 'number' && Number.isFinite(price.amount)
        ? String(price.amount)
        : price?.amount;
    const match =
      typeof amount === 'string' ? /^([0-9]{1,8})(?:\.([0-9]{1,2}))?$/u.exec(amount) : null;
    if (!currency || currency.length > 12) throw failure();
    const priceCents = match
      ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
      : null;
    const hints = {};
    const add = (key, value) => {
      if (typeof value === 'string' && value.trim() && value.length <= 500) hints[key] = value;
    };
    for (const key of ['brand', 'size', 'condition', 'color', 'material', 'catalog']) {
      const entry = item[key];
      if (record(entry)) add(key, entry.title ?? entry.name);
      add(key, item[key + '_title']);
    }
    return {
      externalAccountId: account,
      externalId,
      title: item.title,
      description: item.description,
      priceCents,
      currency,
      photoReferences: photos,
      attributeHints: hints,
    };
  }
  async function read(adapter, account, externalId) {
    if (!id(account) || !id(externalId)) throw failure();
    const before = await adapter.read('/api/v2/users/current');
    if (!record(before) || !record(before.user) || id(before.user.id) !== account) throw failure();
    const source = parse(
      await adapter.read('/api/v2/item_upload/items/' + externalId),
      account,
      externalId,
    );
    const after = await adapter.read('/api/v2/users/current');
    if (!record(after) || !record(after.user) || id(after.user.id) !== account) throw failure();
    return source;
  }
  root.FlipbaseVintedTransferSource = Object.freeze({ read, parse });
})(globalThis);

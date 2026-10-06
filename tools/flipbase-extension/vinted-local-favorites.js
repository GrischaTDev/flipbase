(function exposeFavorites(root) {
  const identifier = (input) => {
    const candidate = Number.isSafeInteger(input) ? String(input) : input;
    return typeof candidate === 'string' && /^[1-9][0-9]{0,31}$/.test(candidate) ? candidate : null;
  };
  async function read(readJson, accountId, now = Date.now()) {
    if (identifier((await readJson('/api/v2/users/current'))?.user?.id) !== accountId)
      throw Object.assign(new Error('Das Vinted-Konto wurde gewechselt.'), {
        code: 'identity_changed',
      });
    const events = new Map();
    for (let page = 1; page <= 2; page++) {
      const response = await readJson(
        `/web/api/notifications/notifications?page=${page}&per_page=100&mark_as_read=false`,
      );
      if (!Array.isArray(response?.notifications))
        throw new Error('Vinted bestätigt die Favoriten nicht.');
      for (const notification of response.notifications) {
        if (notification.entry_type !== 20) continue;
        const link = typeof notification.link === 'string' ? notification.link : '';
        const actorId = identifier(
          link.match(/(?:[?&])(?:offering_id|user_id)=([1-9][0-9]{0,31})(?:&|$)/)?.[1],
        );
        const itemId = identifier(notification.subject_id);
        const eventAt =
          typeof notification.updated_at === 'string' &&
          /^\d{4}-\d{2}-\d{2}T/.test(notification.updated_at)
            ? Date.parse(notification.updated_at)
            : NaN;
        if (!actorId || !itemId || !/\/(?:want_it|messaging)(?:\/|\?|$)/.test(link)) continue;
        if (
          typeof notification.id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            notification.id,
          ) ||
          !Number.isFinite(eventAt) ||
          eventAt > now + 60_000
        )
          throw new Error('Vinted liefert ein ungültiges Favoritenereignis.');
        if (actorId !== accountId)
          events.set(notification.id, {
            externalId: notification.id,
            actorId,
            itemId,
            eventAt: new Date(eventAt).toISOString(),
          });
      }
      if (response.notifications.length < 100 || response.pagination?.total_pages <= page) break;
    }
    if (identifier((await readJson('/api/v2/users/current'))?.user?.id) !== accountId)
      throw Object.assign(new Error('Das Vinted-Konto wurde gewechselt.'), {
        code: 'identity_changed',
      });
    return [...events.values()].sort((first, second) =>
      first.eventAt.localeCompare(second.eventAt),
    );
  }
  async function send(adapter, accountId, command, messages) {
    if (
      !identifier(command.actorId) ||
      !identifier(command.itemId) ||
      typeof command.text !== 'string' ||
      !command.text.trim() ||
      command.text.length > 2000
    )
      throw new Error('Ungültiger Favoritenauftrag.');
    let creationAttempted = false;
    try {
      if (typeof adapter.csrf !== 'string' || !adapter.csrf.trim() || adapter.csrf.length > 512)
        throw Object.assign(new Error('Vinted bestätigt die Browserfreigabe nicht.'), {
          code: 'login_required',
        });
      if (identifier((await adapter.read('/api/v2/users/current'))?.user?.id) !== accountId)
        throw Object.assign(new Error('Das Vinted-Konto wurde gewechselt.'), {
          code: 'identity_changed',
        });
      let item;
      for (let page = 1; page <= 25; page++) {
        const wardrobe = await adapter.read(
          `/api/v2/wardrobe/${accountId}/items?page=${page}&per_page=20`,
        );
        if (!Array.isArray(wardrobe?.items) || !Number.isInteger(wardrobe.pagination?.total_pages))
          throw new Error('Vinted bestätigt den Artikelzustand nicht.');
        item = wardrobe.items.find((candidate) => identifier(candidate.id) === command.itemId);
        if (item || page >= wardrobe.pagination.total_pages) break;
      }
      if (!item || item.is_closed !== false || item.is_reserved === true)
        return { outcome: 'skipped', errorCode: 'inactive_item' };
      // Bereits laufende Unterhaltungen werden nicht mit einer Favoritenvorlage unterbrochen.
      const inbox = await adapter.read('/api/v2/inbox?page=1&per_page=20');
      if (!Array.isArray(inbox?.conversations))
        throw new Error('Vinted bestätigt das Postfach nicht.');
      if (
        inbox.conversations.some(
          (conversation) => identifier(conversation.opposite_user?.id) === command.actorId,
        )
      )
        return { outcome: 'skipped', errorCode: 'existing_conversation' };
      if (identifier((await adapter.read('/api/v2/users/current'))?.user?.id) !== accountId)
        throw Object.assign(new Error('Das Vinted-Konto wurde gewechselt.'), {
          code: 'identity_changed',
        });
      creationAttempted = true;
      const created = await adapter.write('/api/v2/conversations', {
        body: JSON.stringify({
          initiator: 'seller_enters_notification',
          item_id: command.itemId,
          opposite_user_id: command.actorId,
        }),
        json: true,
        csrf: adapter.csrf,
      });
      const conversationId = identifier(created?.conversation?.id);
      if (!conversationId)
        return { outcome: 'outcome_unknown', errorCode: 'conversation_unconfirmed' };
      const detail = await adapter.read(`/api/v2/conversations/${conversationId}`);
      if (
        identifier(detail?.conversation?.id) !== conversationId ||
        identifier(detail.conversation.opposite_user?.id) !== command.actorId ||
        !Array.isArray(detail.conversation.messages)
      )
        return { outcome: 'outcome_unknown', errorCode: 'conversation_unconfirmed' };
      if (detail.conversation.messages.length)
        return { outcome: 'skipped', errorCode: 'existing_conversation' };
      const outcome = await messages.send(adapter, accountId, {
        externalConversationId: conversationId,
        text: command.text,
        attachment: null,
      });
      return command.offer && outcome.outcome === 'sent'
        ? {
            ...outcome,
            conversationId,
            transactionId: identifier(detail.conversation.transaction?.id),
          }
        : outcome;
    } catch (error) {
      return {
        outcome: creationAttempted ? 'outcome_unknown' : 'failed',
        errorCode: error.code ?? 'unavailable',
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      };
    }
  }
  function offerPriceCents(originalPriceCents, offer) {
    if (
      !Number.isSafeInteger(originalPriceCents) ||
      originalPriceCents < 1 ||
      originalPriceCents > 100_000_000 ||
      !offer ||
      !['amount', 'percentage'].includes(offer.type) ||
      Object.keys(offer).some((key) => !['type', 'value'].includes(key)) ||
      typeof offer.value !== 'number' ||
      !Number.isFinite(offer.value) ||
      offer.value <= 0 ||
      Math.abs(offer.value * 100 - Math.round(offer.value * 100)) > 0.000001 ||
      (offer.type === 'percentage' ? offer.value < 1 || offer.value > 50 : offer.value > 1_000_000)
    )
      return null;
    const discount = Math.round(offer.value * 100);
    const price =
      offer.type === 'amount'
        ? originalPriceCents - discount
        : Math.round((originalPriceCents * (10000 - discount)) / 10000);
    return price > 0 && price < originalPriceCents && price >= Math.ceil(originalPriceCents / 2)
      ? price
      : null;
  }
  async function prepareOffer(adapter, accountId, command) {
    if (
      !identifier(command.actorId) ||
      !identifier(command.itemId) ||
      !identifier(command.conversationId) ||
      !identifier(command.transactionId)
    )
      return { outcome: 'skipped', errorCode: 'missing_transaction' };
    if (identifier((await adapter.read('/api/v2/users/current'))?.user?.id) !== accountId)
      throw Object.assign(new Error('Das Vinted-Konto wurde gewechselt.'), {
        code: 'identity_changed',
      });
    let item;
    for (let page = 1; page <= 25; page++) {
      const wardrobe = await adapter.read(
        `/api/v2/wardrobe/${accountId}/items?page=${page}&per_page=20`,
      );
      if (!Array.isArray(wardrobe?.items) || !Number.isInteger(wardrobe.pagination?.total_pages))
        throw new Error('Vinted bestätigt den Artikelzustand nicht.');
      item = wardrobe.items.find((candidate) => identifier(candidate.id) === command.itemId);
      if (item || page >= wardrobe.pagination.total_pages) break;
    }
    if (!item || item.is_closed !== false || item.is_reserved === true)
      return { outcome: 'skipped', errorCode: 'inactive_item' };
    const amount = item.price?.amount;
    if (
      item.price?.currency_code !== 'EUR' ||
      !/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(String(amount))
    )
      return { outcome: 'skipped', errorCode: 'invalid_price' };
    const originalPriceCents = Math.round(Number(amount) * 100);
    const price = offerPriceCents(originalPriceCents, command.offer);
    if (price === null) return { outcome: 'skipped', errorCode: 'invalid_price' };
    const conversation = (await adapter.read(`/api/v2/conversations/${command.conversationId}`))
      ?.conversation;
    const itemIds = [
      conversation?.item_id,
      conversation?.item?.id,
      conversation?.transaction?.item_id,
    ]
      .map(identifier)
      .filter(Boolean);
    if (
      identifier(conversation?.id) !== command.conversationId ||
      identifier(conversation?.opposite_user?.id) !== command.actorId ||
      identifier(conversation?.transaction?.id) !== command.transactionId ||
      !itemIds.length ||
      itemIds.some((itemId) => itemId !== command.itemId)
    )
      return { outcome: 'skipped', errorCode: 'transaction_changed' };
    return { originalPriceCents, offerPriceCents: price };
  }
  async function sendOffer(adapter, accountId, command) {
    let attempted = false;
    try {
      if (typeof adapter.csrf !== 'string' || !adapter.csrf.trim() || adapter.csrf.length > 512)
        throw Object.assign(new Error('Vinted bestätigt die Browserfreigabe nicht.'), {
          code: 'login_required',
        });
      const prepared = await prepareOffer(adapter, accountId, command);
      if (prepared.outcome) return prepared;
      if (
        prepared.originalPriceCents !== command.originalPriceCents ||
        prepared.offerPriceCents !== command.offerPriceCents
      )
        return { outcome: 'skipped', errorCode: 'price_changed' };
      if (identifier((await adapter.read('/api/v2/users/current'))?.user?.id) !== accountId)
        throw Object.assign(new Error('Das Vinted-Konto wurde gewechselt.'), {
          code: 'identity_changed',
        });
      attempted = true;
      const result = await adapter.write(`/api/v2/transactions/${command.transactionId}/offers`, {
        body: JSON.stringify({
          offer: { currency: 'EUR', price: (prepared.offerPriceCents / 100).toFixed(2) },
        }),
        json: true,
        csrf: adapter.csrf,
      });
      const externalOfferId = identifier(result?.offer?.id);
      if (result?.code === 99 || result?.message_code === 'validation_error')
        return { outcome: 'failed', errorCode: 'provider_rejected' };
      // Eine erfolgreiche HTTP-Antwort allein bestätigt kein konkretes Angebot.
      return externalOfferId && !result.code && !result.errors && !result.message_code
        ? { outcome: 'sent', externalOfferId }
        : { outcome: 'outcome_unknown', errorCode: 'offer_unconfirmed' };
    } catch (error) {
      const rejected =
        !attempted ||
        (Number.isInteger(error.httpStatus) &&
          error.httpStatus >= 400 &&
          error.httpStatus < 500 &&
          error.httpStatus !== 408);
      return {
        outcome: rejected ? 'failed' : 'outcome_unknown',
        errorCode:
          rejected && attempted && error.code === 'provider_unavailable'
            ? 'provider_rejected'
            : (error.code ?? 'unavailable'),
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      };
    }
  }
  const api = { read, send, offerPriceCents, prepareOffer, sendOffer };
  root.FlipbaseVintedFavorites = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

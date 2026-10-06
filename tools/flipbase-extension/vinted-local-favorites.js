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
      return await messages.send(adapter, accountId, {
        externalConversationId: conversationId,
        text: command.text,
        attachment: null,
      });
    } catch (error) {
      return {
        outcome: creationAttempted ? 'outcome_unknown' : 'failed',
        errorCode: error.code ?? 'unavailable',
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      };
    }
  }
  const api = { read, send };
  root.FlipbaseVintedFavorites = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

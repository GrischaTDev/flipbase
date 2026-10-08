(function exposeInboxEvents(root) {
  function record(input) {
    return input !== null && typeof input === 'object' && !Array.isArray(input) ? input : null;
  }
  function identifier(input) {
    const candidate =
      typeof input === 'number' && Number.isSafeInteger(input) ? String(input) : input;
    return typeof candidate === 'string' && /^[1-9][0-9]{0,31}$/.test(candidate) ? candidate : null;
  }
  function timestamp(input) {
    if (typeof input !== 'string') return null;
    const match =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
        input,
      );
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const zone = match[7];
    if (
      year < 2000 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > days ||
      Number(match[4]) > 23 ||
      Number(match[5]) > 59 ||
      Number(match[6]) > 59 ||
      (zone !== 'Z' &&
        (!zone ||
          Number(zone.slice(1, 3)) > 14 ||
          Number(zone.slice(4)) > 59 ||
          (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0)))
    )
      return null;
    const instant = Date.parse(input);
    return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
  }
  function parse(input, accountId, observedAt) {
    const empty = { observedAt, events: [], complete: false, coveredConversationIds: [] };
    const ownId = identifier(accountId);
    const observation = timestamp(observedAt);
    const envelope = record(input);
    const conversation = record(envelope?.conversation);
    const conversationId = identifier(conversation?.id);
    const partnerId = identifier(record(conversation?.opposite_user)?.id);
    const messages = conversation?.messages;
    if (
      !ownId ||
      !observation ||
      !conversationId ||
      !partnerId ||
      partnerId === ownId ||
      !Array.isArray(messages) ||
      (envelope?.code !== undefined && envelope.code !== 0)
    )
      return empty;
    let complete = messages.length <= 200;
    const events = new Map();
    const known = new Map();
    const conflicts = new Set();
    for (const raw of messages.slice(0, 200)) {
      const message = record(raw);
      const type = message?.entity_type;
      if (type !== 'message' && type !== 'offer_request_message') continue;
      const entity = record(message?.entity);
      const messageId = identifier(type === 'message' ? entity?.id : message?.id);
      const senderId = identifier(entity?.user_id);
      const occurredAt = timestamp(message?.created_at_ts);
      if (
        !messageId ||
        !senderId ||
        (senderId !== ownId && senderId !== partnerId) ||
        !occurredAt ||
        occurredAt > observation
      ) {
        complete = false;
        continue;
      }
      const externalId = `${type}:${messageId}`;
      const signature = `${senderId}:${occurredAt}`;
      if (known.has(externalId) && known.get(externalId) !== signature) {
        complete = false;
        conflicts.add(externalId);
        events.delete(externalId);
        continue;
      }
      known.set(externalId, signature);
      if (senderId === ownId || conflicts.has(externalId)) continue;
      events.set(externalId, {
        externalId,
        externalConversationId: conversationId,
        occurredAt,
        direction: 'inbound',
        source: 'conversation_snapshot',
      });
    }
    return {
      observedAt,
      events: [...events.values()],
      complete,
      coveredConversationIds: complete ? [conversationId] : [],
    };
  }
  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FlipbaseVintedInboxEvents = api;
})(globalThis);

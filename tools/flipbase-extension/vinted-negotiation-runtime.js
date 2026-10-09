// Provider contracts and execution; browser and authorization access stays in the adapter.
(function exposeNegotiationRuntime(root) {
  'use strict';
  function negotiationRecord(input) {
    return input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  }
  function negotiationId(input) {
    const candidate =
      typeof input === 'number' && Number.isSafeInteger(input) ? String(input) : input;
    return typeof candidate === 'string' && /^[1-9][0-9]{0,31}$/.test(candidate) ? candidate : null;
  }
  function negotiationCents(input) {
    const candidate = negotiationRecord(input)['amount'] ?? input;
    if (typeof candidate !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(candidate)) return null;
    const cents = Math.round(Number(candidate) * 100);
    return Number.isSafeInteger(cents) && cents > 0 && cents <= 100_000_000 ? cents : null;
  }
  function negotiationProviderTime(input, observedAt) {
    const candidate =
      typeof input === 'string' && /^[0-9]{10,13}$/.test(input) ? Number(input) : input;
    const epoch =
      typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
        ? candidate < 10_000_000_000
          ? candidate * 1000
          : candidate
        : typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(candidate)
          ? Date.parse(candidate)
          : NaN;
    if (!Number.isFinite(epoch) || epoch <= 0 || epoch > Date.parse(observedAt) + 60_000)
      return null;
    if (typeof candidate === 'string') {
      const year = Number(candidate.slice(0, 4)),
        month = Number(candidate.slice(5, 7)),
        day = Number(candidate.slice(8, 10)),
        calendar = new Date(Date.UTC(year, month - 1, day));
      if (
        calendar.getUTCFullYear() !== year ||
        calendar.getUTCMonth() !== month - 1 ||
        calendar.getUTCDate() !== day
      )
        return null;
    }
    return new Date(epoch).toISOString();
  }
  function exact(input, keys) {
    const candidate = negotiationRecord(input);
    return (
      Object.keys(candidate).length === keys.length &&
      keys.every((key) => Object.hasOwn(candidate, key))
    );
  }
  function cents(input) {
    return (
      typeof input === 'number' && Number.isSafeInteger(input) && input > 0 && input <= 100_000_000
    );
  }
  function isVintedNegotiationOffer(input) {
    const candidate = negotiationRecord(input);
    return (
      exact(input, [
        'offerId',
        'transactionId',
        'itemId',
        'buyerId',
        'sellerId',
        'originalPriceCents',
        'offeredPriceCents',
        'currency',
        'status',
      ]) &&
      ['offerId', 'transactionId', 'itemId', 'buyerId', 'sellerId'].every(
        (key) => typeof candidate[key] === 'string' && !!negotiationId(candidate[key]),
      ) &&
      candidate['buyerId'] !== candidate['sellerId'] &&
      candidate['status'] === 'pending' &&
      candidate['currency'] === 'EUR' &&
      cents(candidate['originalPriceCents']) &&
      cents(candidate['offeredPriceCents']) &&
      candidate['offeredPriceCents'] <= candidate['originalPriceCents']
    );
  }
  function isVintedNegotiationCommand(input) {
    const candidate = negotiationRecord(input);
    if (candidate['kind'] === 'message')
      return (
        exact(input, ['kind', 'externalConversationId', 'text']) &&
        typeof candidate['externalConversationId'] === 'string' &&
        !!negotiationId(candidate['externalConversationId']) &&
        typeof candidate['text'] === 'string' &&
        !!candidate['text'].trim() &&
        candidate['text'].length <= 2000 &&
        ![...candidate['text']].some((character) => {
          const code = character.charCodeAt(0);
          return code < 32 && code !== 9 && code !== 10 && code !== 13;
        })
      );
    if (
      !exact(input, [
        'kind',
        'action',
        'externalConversationId',
        'transactionId',
        'itemId',
        'buyerId',
        'offerId',
        'originalPriceCents',
        'offeredPriceCents',
        'priceCents',
        'currency',
      ]) ||
      candidate['kind'] !== 'offer' ||
      !['accept', 'decline', 'counter'].includes(String(candidate['action'])) ||
      candidate['currency'] !== 'EUR' ||
      !['externalConversationId', 'transactionId', 'itemId', 'buyerId', 'offerId'].every(
        (key) => typeof candidate[key] === 'string' && !!negotiationId(candidate[key]),
      ) ||
      !cents(candidate['originalPriceCents']) ||
      !cents(candidate['offeredPriceCents']) ||
      candidate['offeredPriceCents'] > candidate['originalPriceCents']
    )
      return false;
    return candidate['action'] === 'counter'
      ? cents(candidate['priceCents']) &&
          candidate['priceCents'] > candidate['offeredPriceCents'] &&
          candidate['priceCents'] <= candidate['originalPriceCents'] &&
          candidate['priceCents'] >= Math.ceil(candidate['originalPriceCents'] / 2)
      : candidate['priceCents'] === null;
  }
  function isConfirmedNegotiationOffer(input) {
    const candidate = negotiationRecord(input);
    return (
      exact(input, ['command', 'externalId']) &&
      isVintedNegotiationCommand(candidate['command']) &&
      candidate['command'].kind === 'offer' &&
      ['counter', 'accept'].includes(candidate['command'].action) &&
      typeof candidate['externalId'] === 'string' &&
      !!negotiationId(candidate['externalId'])
    );
  }
  function isVintedNegotiationResult(input) {
    const candidate = negotiationRecord(input);
    return (
      Object.keys(candidate).every((key) => ['outcome', 'externalId', 'errorCode'].includes(key)) &&
      ['sent', 'failed', 'outcome_unknown', 'skipped'].includes(String(candidate['outcome'])) &&
      (candidate['outcome'] === 'sent'
        ? typeof candidate['externalId'] === 'string' && !!negotiationId(candidate['externalId'])
        : candidate['externalId'] === undefined) &&
      (candidate['errorCode'] === undefined ||
        (typeof candidate['errorCode'] === 'string' &&
          /^[a-z_]{1,80}$/.test(candidate['errorCode'])))
    );
  }
  function isVintedNegotiationEvent(input) {
    const event = negotiationRecord(input);
    if (
      event['confirmed'] !== true ||
      !['buyer_accepted', 'purchased'].includes(String(event['type'])) ||
      typeof event['id'] !== 'string' ||
      !negotiationId(event['id']) ||
      typeof event['transactionId'] !== 'string' ||
      !negotiationId(event['transactionId'])
    )
      return false;
    return (
      exact(event, ['id', 'type', 'transactionId', 'confirmed']) ||
      (exact(event, [
        'id',
        'type',
        'transactionId',
        'confirmed',
        'originalPriceCents',
        'priceCents',
        'currency',
      ]) &&
        event['currency'] === 'EUR' &&
        cents(event['originalPriceCents']) &&
        cents(event['priceCents']) &&
        event['priceCents'] <= event['originalPriceCents'])
    );
  }
  // Every supplied proof must agree; optional identifiers never hide contradictory evidence.
  function identifiersAgree(expected, candidates) {
    return candidates.every(
      (candidate) => candidate === undefined || negotiationId(candidate) === expected,
    );
  }
  function singleItemProof(itemId, ...records) {
    return records.every((input) => {
      const proof = negotiationRecord(input);
      return (
        proof.is_bundle !== true &&
        ['item_count', 'items_count', 'quantity'].every(
          (key) => proof[key] === undefined || proof[key] === 1,
        ) &&
        identifiersAgree(itemId, [proof.item_id]) &&
        (proof.item_ids === undefined ||
          (Array.isArray(proof.item_ids) &&
            proof.item_ids.length === 1 &&
            negotiationId(proof.item_ids[0]) === itemId)) &&
        (proof.items === undefined ||
          (Array.isArray(proof.items) &&
            proof.items.length === 1 &&
            negotiationId(negotiationRecord(proof.items[0]).id) === itemId &&
            singleItemProof(itemId, proof.items[0])))
      );
    });
  }
  function suppliedCurrencies(...sources) {
    return sources.flatMap((source) => {
      const price = negotiationRecord(source);
      return [price.currency, price.currency_code].filter((currency) => currency !== undefined);
    });
  }
  function hasConsistentEur(...sources) {
    const currencies = suppliedCurrencies(...sources);
    return currencies.length > 0 && currencies.every((currency) => currency === 'EUR');
  }
  function conversationProof(conversation, accountId) {
    const relation = negotiationRecord(conversation.transaction),
      item = negotiationRecord(conversation.item);
    const itemId =
      Array.isArray(relation.item_ids) && relation.item_ids.length === 1
        ? negotiationId(relation.item_ids[0])
        : null;
    const buyerId = negotiationId(negotiationRecord(conversation.opposite_user).id);
    if (
      !itemId ||
      !buyerId ||
      buyerId === accountId ||
      relation.item_count !== 1 ||
      !negotiationId(relation.id) ||
      suppliedCurrencies(conversation, relation, item, item.price, relation.offer_price).some(
        (currency) => currency !== 'EUR',
      ) ||
      !singleItemProof(itemId, conversation, relation, item, negotiationRecord(relation.order)) ||
      !identifiersAgree(itemId, [conversation.item_id, item.id, relation.item_id]) ||
      !identifiersAgree(accountId, [relation.seller_id, negotiationRecord(relation.seller).id]) ||
      !identifiersAgree(buyerId, [relation.buyer_id, negotiationRecord(relation.buyer).id]) ||
      [relation.current_user_side, relation.user_side].some(
        (side) => side !== undefined && side !== 'seller',
      ) ||
      (negotiationId(relation.seller_id) !== accountId && relation.current_user_side !== 'seller')
    )
      return null;
    return { itemId, buyerId, transactionId: negotiationId(relation.id) };
  }
  function entityEur(entity) {
    return hasConsistentEur(entity, entity.price, entity.original_price, entity.price_fixed);
  }
  function readVintedNegotiationOffer(messageInput, conversationInput, accountId) {
    const message = negotiationRecord(messageInput),
      entity = negotiationRecord(message.entity),
      conversation = negotiationRecord(conversationInput),
      proof = conversationProof(conversation, accountId);
    const offerId = negotiationId(entity.offer_request_id),
      transactionId = negotiationId(entity.transaction_id),
      originalPriceCents = negotiationCents(entity.original_price),
      offeredPriceCents = negotiationCents(entity.price);
    const itemPrice = negotiationRecord(conversation.item).price;
    if (
      !proof ||
      message.entity_type !== 'offer_request_message' ||
      entity.status !== 10 ||
      entity.current !== true ||
      !offerId ||
      transactionId !== proof.transactionId ||
      negotiationId(entity.user_id) !== proof.buyerId ||
      !originalPriceCents ||
      !offeredPriceCents ||
      !entityEur(entity) ||
      (itemPrice !== undefined &&
        (!hasConsistentEur(entity, itemPrice) ||
          negotiationCents(itemPrice) !== originalPriceCents))
    )
      return null;
    const offer = {
      offerId,
      transactionId,
      itemId: proof.itemId,
      buyerId: proof.buyerId,
      sellerId: accountId,
      originalPriceCents,
      offeredPriceCents,
      currency: 'EUR',
      status: 'pending',
    };
    return isVintedNegotiationOffer(offer) ? offer : null;
  }
  // Payment alone establishes the event; a complete, exactly bound price proof adds optional prices.
  function readVintedNegotiationPurchase(
    transactionInput,
    conversationInput,
    accountId,
    observedAt,
  ) {
    const transaction = negotiationRecord(transactionInput),
      conversation = negotiationRecord(conversationInput),
      proof = conversationProof(conversation, accountId),
      order = negotiationRecord(transaction.order),
      relation = negotiationRecord(conversation.transaction);
    const transactionId = negotiationId(transaction.id),
      occurredAt =
        typeof transaction.debit_processed_at === 'string'
          ? negotiationProviderTime(transaction.debit_processed_at, observedAt)
          : null;
    if (
      !proof ||
      transactionId !== proof.transactionId ||
      transaction.user_side !== 'seller' ||
      (transaction.current_user_side !== undefined && transaction.current_user_side !== 'seller') ||
      negotiationId(negotiationRecord(transaction.seller).id) !== accountId ||
      !identifiersAgree(accountId, [transaction.seller_id]) ||
      !identifiersAgree(proof.buyerId, [
        transaction.buyer_id,
        negotiationRecord(transaction.buyer).id,
      ]) ||
      transaction.items_count !== 1 ||
      !Array.isArray(order.item_ids) ||
      order.item_ids.length !== 1 ||
      negotiationId(order.item_ids[0]) !== proof.itemId ||
      !singleItemProof(proof.itemId, transaction, order) ||
      !occurredAt
    )
      return null;
    const item = negotiationRecord(conversation.item),
      original = item.price,
      offer = negotiationRecord(transaction.offer),
      offered = offer.price;
    const originalPriceCents = negotiationCents(original),
      priceCents = negotiationCents(offered);
    const currencies = [
      transaction,
      relation,
      item,
      original,
      offer,
      offered,
      relation.offer_price,
    ];
    const hasCurrencyConflict = currencies.some((source) => {
      const price = negotiationRecord(source);
      return [price.currency, price.currency_code].some(
        (currency) => currency !== undefined && currency !== 'EUR',
      );
    });
    if (hasCurrencyConflict) return null;
    const prices =
      negotiationId(item.id) === proof.itemId &&
      originalPriceCents &&
      priceCents &&
      priceCents <= originalPriceCents &&
      hasConsistentEur(item, original) &&
      hasConsistentEur(offer, offered)
        ? { originalPriceCents, priceCents, currency: 'EUR' }
        : {};
    return {
      event: {
        id: negotiationId(transaction.purchase_id) ?? transactionId,
        type: 'purchased',
        transactionId,
        confirmed: true,
        ...prices,
      },
      occurredAt,
    };
  }
  class NegotiationError extends Error {
    code;
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  async function executeVintedNegotiation(
    adapter,
    accountId,
    command,
    sourceOffer,
    confirmedOffer,
  ) {
    if (
      !identifier(accountId) ||
      !isVintedNegotiationCommand(command) ||
      (sourceOffer !== null && !isVintedNegotiationOffer(sourceOffer)) ||
      (confirmedOffer !== null && !isConfirmedNegotiationOffer(confirmedOffer)) ||
      (sourceOffer && confirmedOffer) ||
      (command.kind === 'offer' && (sourceOffer || confirmedOffer)) ||
      (confirmedOffer &&
        command.externalConversationId !== confirmedOffer.command.externalConversationId)
    )
      return { outcome: 'failed', errorCode: 'invalid_command' };
    let attempted = false;
    async function identity() {
      await adapter.authorize();
      if (
        identifier(record(record(await adapter.read('/api/v2/users/current'))['user'])['id']) !==
        accountId
      )
        throw new NegotiationError('identity_changed');
    }
    async function context() {
      await identity();
      const conversation = record(
        record(await adapter.read(`/api/v2/conversations/${command.externalConversationId}`))[
          'conversation'
        ],
      );
      if (
        identifier(conversation['id']) !== command.externalConversationId ||
        !Array.isArray(conversation['messages'])
      )
        throw new NegotiationError('conversation_unconfirmed');
      const offerCommand = command.kind === 'offer' ? command : confirmedOffer?.command;
      const expected = offerCommand ?? sourceOffer;
      const proof = conversationProof(conversation, accountId);
      if (!proof) throw new NegotiationError('transaction_changed');
      if (!expected) return conversation;
      if (
        proof.transactionId !== expected.transactionId ||
        proof.buyerId !== expected.buyerId ||
        proof.itemId !== expected.itemId
      )
        throw new NegotiationError('transaction_changed');
      let publication;
      for (let pageNumber = 1; pageNumber <= 25; pageNumber++) {
        const wardrobe = record(
          await adapter.read(`/api/v2/wardrobe/${accountId}/items?page=${pageNumber}&per_page=20`),
        );
        if (
          !Array.isArray(wardrobe['items']) ||
          wardrobe['items'].length > 20 ||
          !Number.isSafeInteger(record(wardrobe['pagination'])['total_pages'])
        )
          throw new NegotiationError('item_unconfirmed');
        publication = wardrobe['items']
          .map(record)
          .find((item) => identifier(item['id']) === expected.itemId);
        if (publication || pageNumber >= Number(record(wardrobe['pagination'])['total_pages']))
          break;
      }
      if (
        !publication ||
        publication['is_closed'] !== false ||
        (publication['is_reserved'] === true && confirmedOffer?.command.action !== 'accept')
      )
        throw new NegotiationError('inactive_item');
      if (
        negotiationCents(publication['price']) !== expected.originalPriceCents ||
        !hasConsistentEur(publication, publication['price'])
      )
        throw new NegotiationError('price_changed');
      const messages = conversation['messages'];
      if (confirmedOffer) {
        const own = messages.map(record).filter((message) => {
          const entity = record(message['entity']);
          return (
            message['entity_type'] ===
              (confirmedOffer.command.action === 'counter'
                ? 'offer_message'
                : 'offer_request_message') &&
            identifier(
              entity[confirmedOffer.command.action === 'counter' ? 'id' : 'offer_request_id'],
            ) === confirmedOffer.externalId
          );
        });
        if (own.length !== 1) throw new NegotiationError('offer_changed');
        const entity = record(own[0]?.['entity']);
        if (
          (confirmedOffer.command.action === 'accept' &&
            (identifier(entity['transaction_id']) !== expected.transactionId ||
              entity['status'] !== 20)) ||
          (entity['original_price'] !== undefined &&
            negotiationCents(entity['original_price']) !== expected.originalPriceCents) ||
          entity['current'] !== true ||
          identifier(entity['user_id']) !==
            (confirmedOffer.command.action === 'counter' ? accountId : expected.buyerId) ||
          negotiationCents(entity['price']) !==
            (confirmedOffer.command.action === 'counter'
              ? confirmedOffer.command.priceCents
              : expected.offeredPriceCents) ||
          !entityEur(entity)
        )
          throw new NegotiationError('offer_changed');
      } else {
        const expectedOffer = sourceOffer ?? {
          offerId: expected.offerId,
          transactionId: expected.transactionId,
          itemId: expected.itemId,
          buyerId: expected.buyerId,
          sellerId: accountId,
          originalPriceCents: expected.originalPriceCents,
          offeredPriceCents: expected.offeredPriceCents,
          currency: 'EUR',
          status: 'pending',
        };
        const matches = messages.flatMap((message) => {
          const offer = readVintedNegotiationOffer(message, conversation, accountId);
          return offer ? [offer] : [];
        });
        if (
          matches.length !== 1 ||
          Object.entries(expectedOffer).some(([key, value]) => record(matches[0])[key] !== value)
        )
          throw new NegotiationError('offer_changed');
      }
      return conversation;
    }
    try {
      await context();
      if (command.kind === 'message')
        return await adapter.sendMessage(command, async () => {
          await context();
          await adapter.authorize();
        });
      // Re-read provider state and identity immediately before the write, then recheck the lease.
      await context();
      await identity();
      await adapter.authorize();
      attempted = true;
      const response = record(
        await adapter.write(
          `/api/v2/transactions/${command.transactionId}/${command.action === 'counter' ? 'offers' : `offer_requests/${command.offerId}/${command.action === 'accept' ? 'accept' : 'reject'}`}`,
          command.action === 'counter' ? 'POST' : 'PUT',
          command.action === 'counter' && command.priceCents !== null
            ? { offer: { price: (command.priceCents / 100).toFixed(2), currency: 'EUR' } }
            : undefined,
        ),
      );
      if (response['code'] === 99 || response['message_code'] === 'validation_error')
        return { outcome: 'failed', errorCode: 'provider_rejected' };
      if (command.action === 'counter') {
        const externalId = identifier(record(response['offer'])['id']);
        return externalId && !response['code'] && !response['errors'] && !response['message_code']
          ? { outcome: 'sent', externalId }
          : { outcome: 'outcome_unknown', errorCode: 'offer_unconfirmed' };
      }
      await identity();
      const after = record(
        record(await adapter.read(`/api/v2/conversations/${command.externalConversationId}`))[
          'conversation'
        ],
      );
      const afterProof = conversationProof(after, accountId);
      const matches = Array.isArray(after['messages'])
        ? after['messages']
            .map(record)
            .filter(
              (message) =>
                identifier(record(message['entity'])['offer_request_id']) === command.offerId,
            )
        : [];
      const entity = record(matches[0]?.['entity']);
      return identifier(after['id']) === command.externalConversationId &&
        afterProof?.transactionId === command.transactionId &&
        afterProof.itemId === command.itemId &&
        afterProof.buyerId === command.buyerId &&
        matches.length === 1 &&
        matches[0]['entity_type'] === 'offer_request_message' &&
        entity['status'] === (command.action === 'accept' ? 20 : 30) &&
        identifier(entity['transaction_id']) === command.transactionId &&
        identifier(entity['user_id']) === command.buyerId &&
        entityEur(entity) &&
        (entity['original_price'] === undefined ||
          negotiationCents(entity['original_price']) === command.originalPriceCents) &&
        negotiationCents(entity['price']) === command.offeredPriceCents
        ? { outcome: 'sent', externalId: command.offerId }
        : { outcome: 'outcome_unknown', errorCode: 'offer_unconfirmed' };
    } catch (error) {
      return {
        outcome: attempted ? 'outcome_unknown' : 'skipped',
        errorCode:
          typeof error?.code === 'string' && /^[a-z_]{1,80}$/.test(error.code)
            ? error.code
            : 'provider_unavailable',
        ...(Number.isFinite(error?.retryAfter) && error.retryAfter > 0
          ? { retryAfter: error.retryAfter }
          : {}),
      };
    }
  }
  const record = negotiationRecord,
    identifier = negotiationId;
  const api = {
    record: negotiationRecord,
    id: negotiationId,
    cents: negotiationCents,
    providerTime: negotiationProviderTime,
    readOffer: readVintedNegotiationOffer,
    readPurchase: readVintedNegotiationPurchase,
    isOffer: isVintedNegotiationOffer,
    isCommand: isVintedNegotiationCommand,
    isResult: isVintedNegotiationResult,
    isEvent: isVintedNegotiationEvent,
    isConfirmedOffer: isConfirmedNegotiationOffer,
    execute: executeVintedNegotiation,
  };
  root.FlipbaseVintedNegotiationRuntime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

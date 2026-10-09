// Provider contracts and execution; browser and authorization access stays in the adapter.
(function exposeNegotiation(root) {
  'use strict';
  Object.defineProperty(exports, '__esModule', { value: true });
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
  /** Only provider identifiers, actor, currency and current single-item state establish an offer. */
  function readVintedNegotiationOffer(messageInput, conversationInput, accountId) {
    const message = negotiationRecord(messageInput),
      entity = negotiationRecord(message['entity']),
      conversation = negotiationRecord(conversationInput),
      transaction = negotiationRecord(conversation['transaction']),
      item = negotiationRecord(conversation['item']);
    const sellerId =
      negotiationId(transaction['seller_id']) ??
      (transaction['current_user_side'] === 'seller' ? accountId : null);
    const buyerId =
      negotiationId(transaction['buyer_id']) ??
      (transaction['current_user_side'] === 'seller'
        ? negotiationId(negotiationRecord(conversation['opposite_user'])['id'])
        : null);
    const itemId = negotiationId(
      conversation['item_id'] ??
        item['id'] ??
        transaction['item_id'] ??
        (Array.isArray(transaction['item_ids']) && transaction['item_ids'].length === 1
          ? transaction['item_ids'][0]
          : null),
    );
    const offerId = negotiationId(entity['offer_request_id']),
      transactionId = negotiationId(entity['transaction_id']);
    const originalPriceCents = negotiationCents(entity['original_price']),
      offeredPriceCents = negotiationCents(entity['price']);
    const currency = entity['currency'] ?? negotiationRecord(entity['price'])['currency_code'];
    if (
      message['entity_type'] !== 'offer_request_message' ||
      entity['status'] !== 10 ||
      entity['current'] !== true ||
      sellerId !== accountId ||
      (transaction['current_user_side'] !== undefined &&
        transaction['current_user_side'] !== 'seller') ||
      buyerId === accountId ||
      buyerId !== negotiationId(entity['user_id']) ||
      buyerId !== negotiationId(negotiationRecord(conversation['opposite_user'])['id']) ||
      transactionId !== negotiationId(transaction['id']) ||
      transaction['item_count'] !== 1 ||
      !Array.isArray(transaction['item_ids']) ||
      transaction['item_ids'].length !== 1 ||
      !offerId ||
      !transactionId ||
      !itemId ||
      !buyerId ||
      !sellerId ||
      !originalPriceCents ||
      !offeredPriceCents ||
      currency !== 'EUR' ||
      conversation['is_bundle'] === true ||
      transaction['is_bundle'] === true ||
      (transaction['item_count'] !== undefined && transaction['item_count'] !== 1) ||
      (Array.isArray(transaction['item_ids']) &&
        (transaction['item_ids'].length !== 1 ||
          negotiationId(transaction['item_ids'][0]) !== itemId))
    )
      return null;
    const offer = {
      offerId,
      transactionId,
      itemId,
      buyerId,
      sellerId,
      originalPriceCents,
      offeredPriceCents,
      currency: 'EUR',
      status: 'pending',
    };
    return isVintedNegotiationOffer(offer) ? offer : null;
  }
  /** A debit timestamp establishes payment, unlike checkout, offer acceptance or a translated status. */
  function readVintedNegotiationPurchase(
    transactionInput,
    conversationInput,
    accountId,
    observedAt,
  ) {
    const transaction = negotiationRecord(transactionInput),
      conversation = negotiationRecord(conversationInput),
      relation = negotiationRecord(conversation['transaction']),
      order = negotiationRecord(transaction['order']);
    const transactionId = negotiationId(transaction['id']),
      itemId = negotiationId(
        conversation['item_id'] ??
          negotiationRecord(conversation['item'])['id'] ??
          relation['item_id'] ??
          (Array.isArray(relation['item_ids']) && relation['item_ids'].length === 1
            ? relation['item_ids'][0]
            : null),
      );
    const occurredAt =
      typeof transaction['debit_processed_at'] === 'string'
        ? negotiationProviderTime(transaction['debit_processed_at'], observedAt)
        : null;
    if (
      !transactionId ||
      transactionId !== negotiationId(relation['id']) ||
      transaction['user_side'] !== 'seller' ||
      negotiationId(negotiationRecord(transaction['seller'])['id']) !== accountId ||
      (relation['seller_id'] !== undefined && negotiationId(relation['seller_id']) !== accountId) ||
      (relation['current_user_side'] !== undefined && relation['current_user_side'] !== 'seller') ||
      !itemId ||
      !Array.isArray(order['item_ids']) ||
      order['item_ids'].length !== 1 ||
      negotiationId(order['item_ids'][0]) !== itemId ||
      transaction['items_count'] !== 1 ||
      conversation['is_bundle'] === true ||
      typeof occurredAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(occurredAt) ||
      !Number.isFinite(Date.parse(occurredAt)) ||
      Date.parse(occurredAt) > Date.parse(observedAt) + 60_000
    )
      return null;
    const original = negotiationRecord(conversation['item'])['price'],
      offered = negotiationRecord(transaction['offer'])['price'];
    const originalPriceCents = negotiationCents(original),
      priceCents = negotiationCents(offered);
    const prices =
      originalPriceCents &&
      priceCents &&
      priceCents <= originalPriceCents &&
      negotiationRecord(original)['currency_code'] === 'EUR' &&
      negotiationRecord(offered)['currency_code'] === 'EUR'
        ? { originalPriceCents, priceCents, currency: 'EUR' }
        : {};
    return {
      event: {
        id: negotiationId(transaction['purchase_id']) ?? transactionId,
        type: 'purchased',
        transactionId,
        confirmed: true,
        ...prices,
      },
      occurredAt: new Date(occurredAt).toISOString(),
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
      if (!expected) return conversation;
      const transaction = record(conversation['transaction']),
        item = record(conversation['item']);
      const itemIds = [
        conversation['item_id'],
        item['id'],
        transaction['item_id'],
        ...(Array.isArray(transaction['item_ids']) ? transaction['item_ids'] : []),
      ].flatMap((candidate) => {
        const id = identifier(candidate);
        return id ? [id] : [];
      });
      if (
        identifier(transaction['id']) !== expected.transactionId ||
        (identifier(transaction['seller_id']) ??
          (transaction['current_user_side'] === 'seller' ? accountId : null)) !== accountId ||
        (transaction['current_user_side'] !== undefined &&
          transaction['current_user_side'] !== 'seller') ||
        (identifier(transaction['buyer_id']) ??
          (transaction['current_user_side'] === 'seller'
            ? identifier(record(conversation['opposite_user'])['id'])
            : null)) !== expected.buyerId ||
        identifier(record(conversation['opposite_user'])['id']) !== expected.buyerId ||
        expected.buyerId === accountId ||
        transaction['item_count'] !== 1 ||
        !Array.isArray(transaction['item_ids']) ||
        transaction['item_ids'].length !== 1 ||
        !itemIds.length ||
        itemIds.some((id) => id !== expected.itemId) ||
        conversation['is_bundle'] === true ||
        transaction['is_bundle'] === true ||
        (transaction['item_count'] !== undefined && transaction['item_count'] !== 1) ||
        (Array.isArray(transaction['item_ids']) &&
          (transaction['item_ids'].length !== 1 ||
            identifier(transaction['item_ids'][0]) !== expected.itemId))
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
        record(publication['price'])['currency_code'] !== 'EUR'
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
          entity['current'] !== true ||
          identifier(entity['user_id']) !==
            (confirmedOffer.command.action === 'counter' ? accountId : expected.buyerId) ||
          negotiationCents(entity['price']) !==
            (confirmedOffer.command.action === 'counter'
              ? confirmedOffer.command.priceCents
              : expected.offeredPriceCents) ||
          (entity['currency'] ?? record(entity['price'])['currency_code']) !== 'EUR'
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
      const transaction = record(after['transaction']);
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
        identifier(transaction['id']) === command.transactionId &&
        (identifier(transaction['seller_id']) ??
          (transaction['current_user_side'] === 'seller' ? accountId : null)) === accountId &&
        matches.length === 1 &&
        entity['status'] === (command.action === 'accept' ? 20 : 30) &&
        identifier(entity['transaction_id']) === command.transactionId &&
        identifier(entity['user_id']) === command.buyerId &&
        (entity['currency'] ?? record(entity['price'])['currency_code']) === 'EUR' &&
        negotiationCents(entity['price']) === command.offeredPriceCents
        ? { outcome: 'sent', externalId: command.offerId }
        : { outcome: 'outcome_unknown', errorCode: 'offer_unconfirmed' };
    } catch (error) {
      return {
        outcome: attempted ? 'outcome_unknown' : 'skipped',
        errorCode: error instanceof NegotiationError ? error.code : 'provider_unavailable',
      };
    }
  }
  const record = negotiationRecord,
    identifier = negotiationId;
  async function send(adapter, accountId, claim, messages) {
    if (
      typeof adapter.csrf !== 'string' ||
      !adapter.csrf.trim() ||
      adapter.csrf.length > 512 ||
      /[\r\n]/.test(adapter.csrf)
    )
      return { outcome: 'skipped', errorCode: 'login_required' };
    return executeVintedNegotiation(
      {
        authorize: adapter.authorize,
        read: adapter.read,
        write: (path, method, body) =>
          adapter.write(path, {
            method,
            csrf: adapter.csrf,
            ...(body ? { body: JSON.stringify(body), json: true } : {}),
          }),
        sendMessage: async (command, authorize) => {
          const result = await messages.send(
            {
              ...adapter,
              read: async (path) => {
                await adapter.authorize();
                return adapter.read(path);
              },
              write: async (path, request) => {
                await authorize();
                return adapter.write(path, request);
              },
            },
            accountId,
            {
              externalConversationId: command.externalConversationId,
              text: command.text,
              attachment: null,
            },
          );
          return {
            outcome: result.outcome,
            ...(result.externalMessageId ? { externalId: result.externalMessageId } : {}),
            ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          };
        },
      },
      accountId,
      claim.command,
      claim.sourceOffer,
      claim.confirmedOffer,
    );
  }
  function validClaim(claim, binding, now) {
    return (
      claim &&
      Object.keys(claim).length === 9 &&
      [
        'jobId',
        'claimToken',
        'workspaceId',
        'connectionId',
        'externalAccountId',
        'expiresAt',
        'command',
        'sourceOffer',
        'confirmedOffer',
      ].every((key) => Object.hasOwn(claim, key)) &&
      ['jobId', 'claimToken', 'workspaceId', 'connectionId'].every(
        (key) =>
          typeof claim[key] === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claim[key]),
      ) &&
      claim.workspaceId === binding.workspaceId &&
      claim.connectionId === binding.connectionId &&
      claim.externalAccountId === binding.externalAccountId &&
      typeof claim.expiresAt === 'string' &&
      Date.parse(claim.expiresAt) > now &&
      isVintedNegotiationCommand(claim.command) &&
      (claim.sourceOffer === null ||
        (isVintedNegotiationOffer(claim.sourceOffer) &&
          claim.sourceOffer.sellerId === binding.externalAccountId)) &&
      (claim.confirmedOffer === null ||
        (isConfirmedNegotiationOffer(claim.confirmedOffer) &&
          claim.confirmedOffer.command.externalConversationId ===
            claim.command.externalConversationId)) &&
      !(claim.sourceOffer && claim.confirmedOffer) &&
      !(claim.command.kind === 'offer' && (claim.sourceOffer || claim.confirmedOffer))
    );
  }
  const api = {
    send,
    validClaim,
    providerTime: negotiationProviderTime,
    readOffer: readVintedNegotiationOffer,
    readPurchase: readVintedNegotiationPurchase,
    isOffer: isVintedNegotiationOffer,
    isCommand: isVintedNegotiationCommand,
    isResult: isVintedNegotiationResult,
  };
  root.FlipbaseVintedNegotiation = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);

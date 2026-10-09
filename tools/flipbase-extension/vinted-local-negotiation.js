// Local browser adapter; provider validation and execution share the Worker runtime.
(function exposeNegotiation(root) {
  'use strict';
  const runtime =
    root.FlipbaseVintedNegotiationRuntime ??
    (typeof require === 'function' ? require('./vinted-negotiation-runtime.js') : null);
  if (!runtime) throw new Error('Negotiation runtime is missing.');
  const {
    execute: executeVintedNegotiation,
    isCommand: isVintedNegotiationCommand,
    isOffer: isVintedNegotiationOffer,
    isConfirmedOffer: isConfirmedNegotiationOffer,
    id: identifier,
  } = runtime;
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
            ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}),
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
  const api = { ...runtime, send, validClaim };
  root.FlipbaseVintedNegotiation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

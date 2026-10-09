// Konto- und versuchgebundener Client. Abholung und Browserausführung werden getrennt angeschlossen.
(function exposeListingClient(root) {
  'use strict';
  const runtime =
    root.FlipbaseVintedListingRuntime ??
    (typeof require === 'function' ? require('./vinted-listing-runtime.js') : null);
  if (!runtime) throw new Error('Inseratvertrag fehlt.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function invalid() {
    return new Error('Der lokale Inseratversuch ist ungültig.');
  }
  function fields(value, names) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== names.length ||
      names.some((name) => !Object.hasOwn(value, name))
    )
      throw invalid();
    return value;
  }
  function identifier(value) {
    if (
      typeof value !== 'string' ||
      !/^[1-9][0-9]{0,18}$/.test(value) ||
      BigInt(value) > 9223372036854775807n
    )
      throw invalid();
    return value;
  }
  function timestamp(value) {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    )
      throw invalid();
    const year = Number(value.slice(0, 4)),
      month = Number(value.slice(5, 7)),
      day = Number(value.slice(8, 10));
    const result = Date.parse(value);
    if (
      year < 2000 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
      Number(value.slice(11, 13)) > 23 ||
      Number(value.slice(14, 16)) > 59 ||
      Number(value.slice(17, 19)) > 59 ||
      !Number.isFinite(result)
    )
      throw invalid();
    return result;
  }
  function approvedBinding(binding) {
    if (
      !binding ||
      typeof binding.workspaceId !== 'string' ||
      !uuid.test(binding.workspaceId) ||
      typeof binding.connectionId !== 'string' ||
      !uuid.test(binding.connectionId) ||
      typeof binding.externalAccountId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(binding.externalAccountId)
    )
      throw invalid();
    timestamp(binding.expiresAt);
    return Object.freeze({
      workspaceId: binding.workspaceId,
      connectionId: binding.connectionId,
      externalAccountId: binding.externalAccountId,
      expiresAt: binding.expiresAt,
    });
  }
  function parseClaim(input, binding, now) {
    binding = approvedBinding(binding);
    const value = fields(input, [
      'jobId',
      'claimToken',
      'workspaceId',
      'connectionId',
      'externalAccountId',
      'action',
      'snapshot',
      'expiresAt',
      'absoluteExpiresAt',
    ]);
    const expiresAt = timestamp(value.expiresAt),
      absoluteExpiresAt = timestamp(value.absoluteExpiresAt);
    if (
      !Number.isFinite(now) ||
      timestamp(binding.expiresAt) <= now ||
      typeof value.claimToken !== 'string' ||
      !uuid.test(value.claimToken) ||
      value.workspaceId !== binding.workspaceId ||
      value.connectionId !== binding.connectionId ||
      value.externalAccountId !== binding.externalAccountId ||
      !['publish', 'vinted_draft'].includes(value.action) ||
      expiresAt <= now ||
      expiresAt > absoluteExpiresAt ||
      absoluteExpiresAt > timestamp(binding.expiresAt)
    )
      throw invalid();
    return Object.freeze({
      jobId: identifier(value.jobId),
      claimToken: value.claimToken,
      workspaceId: binding.workspaceId,
      connectionId: binding.connectionId,
      externalAccountId: binding.externalAccountId,
      action: value.action,
      snapshot: runtime.parseSnapshot(value.snapshot, binding.workspaceId, binding.connectionId),
      expiresAt: value.expiresAt,
      absoluteExpiresAt: value.absoluteExpiresAt,
    });
  }

  function createClient(binding, adapter) {
    binding = approvedBinding(binding);
    if (
      typeof adapter?.request !== 'function' ||
      typeof adapter.photo !== 'function' ||
      typeof adapter.now !== 'function'
    )
      throw invalid();
    const scope = { workspaceId: binding.workspaceId, connectionId: binding.connectionId };
    const attempts = new WeakMap();
    let current = null,
      claiming = false;
    const clock = () => {
      const value = adapter.now();
      if (!Number.isFinite(value)) throw invalid();
      return value;
    };
    function attempt(claim, active = true) {
      const state = attempts.get(claim);
      if (!state || (active && (current !== claim || state.finished))) throw invalid();
      return state;
    }
    const command = (claim, action) => ({
      ...scope,
      action,
      jobId: claim.jobId,
      claimToken: claim.claimToken,
    });
    async function claim() {
      if (claiming || current || timestamp(binding.expiresAt) <= clock()) throw invalid();
      claiming = true;
      try {
        const value = await adapter.request({ ...scope, action: 'listing_claim' });
        if (value === null) return null;
        current = parseClaim(value, binding, clock());
        attempts.set(current, {
          expiresAt: timestamp(current.expiresAt),
          absoluteExpiresAt: timestamp(current.absoluteExpiresAt),
          beginReserved: false,
          beginAcknowledged: false,
          loading: false,
          finished: false,
        });
        return current;
      } finally {
        claiming = false;
      }
    }
    async function check(claim) {
      const state = attempt(claim);
      if (
        timestamp(binding.expiresAt) <= clock() ||
        state.expiresAt <= clock() ||
        state.absoluteExpiresAt <= clock()
      )
        return false;
      const value = await adapter.request(command(claim, 'listing_check'));
      // Ältere Antworten dürfen ein inzwischen beendetes oder widerrufenes Fenster nicht öffnen.
      if (current !== claim || state.finished || state.expiresAt === 0) return false;
      if (value?.active === false) {
        fields(value, ['active']);
        state.expiresAt = 0;
        return false;
      }
      fields(value, ['active', 'expiresAt', 'absoluteExpiresAt']);
      const expiresAt = timestamp(value.expiresAt);
      if (
        value.active !== true ||
        timestamp(value.absoluteExpiresAt) !== state.absoluteExpiresAt ||
        expiresAt <= clock() ||
        expiresAt > state.absoluteExpiresAt ||
        timestamp(binding.expiresAt) <= clock()
      )
        throw invalid();
      state.expiresAt = expiresAt;
      return true;
    }
    async function begin(claim) {
      const state = attempt(claim);
      if (state.beginReserved) throw invalid();
      // Vor dem await reservieren; Antwortverlust darf keinen zweiten Schreibbeginn auslösen.
      state.beginReserved = true;
      if (!(await check(claim))) throw invalid();
      const value = fields(await adapter.request(command(claim, 'listing_begin')), ['ok']);
      if (value.ok !== true || current !== claim || state.finished || state.expiresAt === 0)
        throw invalid();
      state.beginAcknowledged = true;
    }
    async function loadPhoto(claim, imageId) {
      const state = attempt(claim);
      const image = claim.snapshot.images.find((image) => image.id === imageId);
      if (!image || state.loading) throw invalid();
      state.loading = true;
      try {
        if (!(await check(claim))) throw invalid();
        const response = await adapter.photo({ ...command(claim, 'listing_photo'), imageId });
        const length = response.headers.get('content-length');
        if (
          response.status !== 200 ||
          response.redirected ||
          !response.body ||
          response.headers.get('x-listing-image-id') !== image.id ||
          response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
            image.mimeType ||
          (length !== null && (!/^[0-9]+$/.test(length) || Number(length) !== image.byteSize))
        ) {
          await response.body?.cancel().catch(() => undefined);
          throw invalid();
        }
        const bytes = new Uint8Array(image.byteSize),
          reader = response.body.getReader();
        let offset = 0,
          complete = false;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) {
              complete = true;
              break;
            }
            if (chunk.value.byteLength > bytes.length - offset) throw invalid();
            bytes.set(chunk.value, offset);
            offset += chunk.value.byteLength;
          }
        } finally {
          if (!complete) await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        if (offset !== bytes.length || !(await check(claim))) throw invalid();
        return Object.freeze({
          id: image.id,
          fileName: image.fileName,
          mimeType: image.mimeType,
          bytes,
        });
      } finally {
        state.loading = false;
      }
    }
    async function finish(claim, result) {
      const state = attempt(claim, false);
      if (
        !runtime.isResult(result, claim.action, claim.externalAccountId) ||
        (result.outcome === 'confirmed' && !state.beginAcknowledged)
      )
        throw invalid();
      result = Object.freeze({ ...result });
      // Nach Widerruf/Fristablauf darf ausschließlich das Ergebnis des alten Versuchs eintreffen.
      const receipt = await adapter.request({ ...command(claim, 'listing_finish'), result });
      if (
        !receipt ||
        receipt.id !== claim.jobId ||
        receipt.workspaceId !== claim.workspaceId ||
        receipt.draftId !== claim.snapshot.images[0].storagePath.split('/')[1] ||
        (receipt.connectionId !== null && receipt.connectionId !== claim.connectionId) ||
        receipt.externalAccountId !== claim.externalAccountId ||
        receipt.action !== claim.action ||
        receipt.executionMode !== 'local' ||
        (receipt.state !== result.outcome &&
          !(receipt.state === 'cancelled' && result.outcome === 'failed')) ||
        (result.outcome === 'confirmed' &&
          (receipt.externalId !== result.externalId ||
            receipt.providerState !== result.providerState ||
            timestamp(receipt.verifiedAt) !== timestamp(result.verifiedAt)))
      )
        throw invalid();
      state.finished = true;
      if (current === claim) current = null;
      return receipt;
    }
    return Object.freeze({ claim, check, begin, loadPhoto, finish });
  }
  const api = Object.freeze({ parseClaim, createClient });
  root.FlipbaseVintedListingClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

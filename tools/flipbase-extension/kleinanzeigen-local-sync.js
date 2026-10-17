// Lesender, wiederaufnehmbarer Abgleich. Erst der Server bestätigt den vollständigen Bestand.
(function defineKleinanzeigenSync(root) {
  let busy = false;
  const id = (value) =>
    typeof value === 'string' &&
    /^[1-9][0-9]{0,18}$/u.test(value) &&
    BigInt(value) <= 9223372036854775807n;
  const token = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const errorCodes = [
    'schema_changed',
    'needs_login',
    'interrupted',
    'account_changed',
    'unsupported',
    'access_revoked',
  ];
  function failure(code) {
    const error = new Error(
      code === 'account_changed'
        ? 'Das Kleinanzeigen-Konto hat sich geändert. Wechsle zum gebundenen Konto.'
        : code === 'needs_login'
          ? 'Melde Dich im gebundenen Kleinanzeigen-Konto an.'
          : 'Der Kleinanzeigen-Abgleich wurde gestoppt. Der bisherige Inseratbestand bleibt erhalten.',
    );
    error.code = code;
    return error;
  }
  function same(value, scope) {
    return (
      value?.workspaceId === scope.workspaceId &&
      value.connectionId === scope.connectionId &&
      value.runId === scope.runId &&
      value.generation === scope.generation
    );
  }
  function validDisplayFields(item) {
    const price = item.priceCents ?? null;
    const currency = item.currency ?? null;
    const day = item.publishedOn ?? null;
    const image = item.imageUrl ?? null;
    return (
      (price === null || (Number.isSafeInteger(price) && price >= 0 && price <= 2147483647)) &&
      currency === (price === null ? null : 'EUR') &&
      (image === null ||
        (typeof image === 'string' &&
          image.length <= 2048 &&
          /^https:\/\/img\.kleinanzeigen\.de\/api\/v1\/prod-ads\/images\/[^\s#]+$/u.test(image))) &&
      (day === null ||
        (typeof day === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/u.test(day) &&
          Number.isFinite(Date.parse(day)) &&
          new Date(day).toISOString().slice(0, 10) === day))
    );
  }
  function validPage(page, expected, externalAccountId, seen) {
    if (!record(page) || page.identity?.externalAccountId !== externalAccountId)
      throw failure(page?.identity ? 'account_changed' : 'schema_changed');
    if (
      page.pageCursor !== expected ||
      !Array.isArray(page.items) ||
      page.items.length > 200 ||
      page.complete !== (page.nextCursor === null) ||
      (page.nextCursor !== null && page.nextCursor !== 'page:' + (Number(expected.slice(5)) + 1)) ||
      (!page.items.length && page.nextCursor !== null)
    )
      throw failure('schema_changed');
    const ids = new Set(seen);
    for (const item of page.items) {
      if (
        !record(item) ||
        typeof item.externalId !== 'string' ||
        !/^[1-9][0-9]{0,31}$/u.test(item.externalId) ||
        ids.has(item.externalId) ||
        typeof item.title !== 'string' ||
        !item.title.trim() ||
        typeof item.url !== 'string' ||
        item.publishedAt !== null ||
        !validDisplayFields(item) ||
        !['active', 'unknown'].includes(item.state)
      )
        throw failure('schema_changed');
      ids.add(item.externalId);
    }
    return {
      pageCursor: page.pageCursor,
      nextCursor: page.nextCursor,
      items: page.items.map((item) => ({
        externalId: item.externalId,
        title: item.title,
        url: item.url,
        publishedAt: null,
        publishedOn: item.publishedOn ?? null,
        priceCents: item.priceCents ?? null,
        currency: item.currency ?? null,
        imageUrl: item.imageUrl ?? null,
        state: item.state,
      })),
    };
  }
  function publicResult(answer, scope, expectedCount) {
    if (
      !same(answer, scope) ||
      answer.state !== 'confirmed' ||
      !Number.isFinite(Date.parse(answer.observedAt)) ||
      !Number.isSafeInteger(answer.itemCount) ||
      answer.itemCount < 0 ||
      answer.itemCount > 20000 ||
      (expectedCount !== undefined && answer.itemCount !== expectedCount)
    )
      throw failure('schema_changed');
    return {
      ...scope,
      state: 'confirmed',
      observedAt: answer.observedAt,
      itemCount: answer.itemCount,
    };
  }
  async function run(installation, runId, adapter) {
    if (busy) throw failure('interrupted');
    busy = true;
    let progress;
    try {
      const binding = installation?.binding;
      if (
        installation?.phase !== 'connected' ||
        !binding ||
        !id(binding.connectionId) ||
        !id(runId) ||
        !Number.isSafeInteger(binding.generation) ||
        binding.generation < 1 ||
        !Number.isFinite(Date.parse(binding.expiresAt)) ||
        Date.parse(binding.expiresAt) <= adapter.now()
      )
        throw failure('access_revoked');
      const scope = {
        workspaceId: binding.workspaceId,
        connectionId: binding.connectionId,
        generation: binding.generation,
        runId,
      };
      const heartbeat = async () => {
        const answer = await adapter.rpc({
          action: 'heartbeat',
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
          generation: scope.generation,
        });
        if (
          answer?.workspaceId !== scope.workspaceId ||
          answer.connectionId !== scope.connectionId ||
          answer.generation !== scope.generation ||
          answer.externalAccountId !== binding.externalAccountId ||
          !Number.isFinite(Date.parse(answer.expiresAt)) ||
          Date.parse(answer.expiresAt) <= adapter.now()
        )
          throw failure('access_revoked');
      };
      await heartbeat();
      const account = await adapter.readAccount();
      if (account?.identity?.externalAccountId !== binding.externalAccountId)
        throw failure(account?.identity ? 'account_changed' : 'needs_login');
      const saved = await adapter.loadProgress();
      if (same(saved, scope) && saved.externalAccountId === binding.externalAccountId)
        progress = saved;
      if (progress?.phase === 'confirmed') return publicResult(progress.result, scope);
      if (progress?.phase === 'finishing') {
        progress = { ...progress, quota: account.quota ?? null };
        await adapter.saveProgress(progress);
      }
      if (
        !progress ||
        !['reading', 'finishing'].includes(progress.phase) ||
        !token(progress.claimToken)
      ) {
        const claim = await adapter.rpc({ action: 'sync_claim', ...scope });
        if (
          !same(claim, scope) ||
          !token(claim.claimToken) ||
          claim.externalAccountId !== binding.externalAccountId ||
          claim.nextCursor !== 'page:1'
        )
          throw failure('schema_changed');
        progress = {
          ...scope,
          externalAccountId: binding.externalAccountId,
          claimToken: claim.claimToken,
          phase: 'reading',
          nextCursor: 'page:1',
          seenIds: [],
          pageCount: 0,
          pendingPage: null,
        };
        await adapter.saveProgress(progress);
      }
      const claimed = {
        ...scope,
        claimToken: progress.claimToken,
        externalAccountId: binding.externalAccountId,
      };
      while (progress.phase === 'reading' && progress.nextCursor !== null) {
        if (progress.pageCount >= 500 || progress.seenIds.length > 20000)
          throw failure('unsupported');
        await heartbeat();
        if (!progress.pendingPage) {
          const page = await adapter.readPage(progress.nextCursor);
          progress.pendingPage = validPage(
            page,
            progress.nextCursor,
            binding.externalAccountId,
            progress.seenIds,
          );
          await adapter.saveProgress(progress);
        }
        const pending = progress.pendingPage;
        const answer = await adapter.rpc({ action: 'sync_page', ...claimed, ...pending });
        if (
          !same(answer, scope) ||
          answer.acceptedCursor !== pending.pageCursor ||
          answer.nextCursor !== pending.nextCursor ||
          answer.complete !== (pending.nextCursor === null)
        )
          throw failure('schema_changed');
        progress = {
          ...progress,
          seenIds: [...progress.seenIds, ...pending.items.map((item) => item.externalId)],
          pageCount: progress.pageCount + 1,
          nextCursor: pending.nextCursor,
          pendingPage: null,
        };
        await adapter.saveProgress(progress);
      }
      if (progress.phase === 'reading') {
        const finalAccount = await adapter.readAccount();
        if (finalAccount?.identity?.externalAccountId !== binding.externalAccountId)
          throw failure(finalAccount?.identity ? 'account_changed' : 'needs_login');
        progress = { ...progress, phase: 'finishing', quota: finalAccount.quota ?? null };
        await adapter.saveProgress(progress);
      }
      await heartbeat();
      const answer = await adapter.rpc({
        action: 'sync_finish',
        ...claimed,
        quota: progress.quota,
      });
      if (
        !same(answer, scope) ||
        answer.state !== 'confirmed' ||
        !Number.isFinite(Date.parse(answer.observedAt)) ||
        !Number.isSafeInteger(answer.itemCount) ||
        answer.itemCount !== progress.seenIds.length
      )
        throw failure('schema_changed');
      const result = publicResult(answer, scope, progress.seenIds.length);
      await adapter.saveProgress({
        ...scope,
        externalAccountId: binding.externalAccountId,
        phase: 'confirmed',
        result,
      });
      return result;
    } catch (error) {
      // Bei verlorener Netzwerkantwort behalten wir den exakten Checkpoint. Ein bereits
      // abgeschlossener Import darf nicht nachträglich als gescheitert umgeschrieben werden.
      if (progress?.phase === 'reading' && errorCodes.includes(error?.code)) {
        try {
          await adapter.rpc({
            action: 'sync_fail',
            workspaceId: progress.workspaceId,
            connectionId: progress.connectionId,
            generation: progress.generation,
            runId: progress.runId,
            claimToken: progress.claimToken,
            externalAccountId: progress.externalAccountId,
            errorCode: error.code,
          });
          await adapter.saveProgress(null);
        } catch {
          /* Bei verlorener Freigabe läuft die serverseitige Lease aus. */
        }
      }
      throw error instanceof Error ? error : failure('interrupted');
    } finally {
      busy = false;
    }
  }
  root.FlipbaseKleinanzeigenSync = Object.freeze({ run });
})(globalThis);

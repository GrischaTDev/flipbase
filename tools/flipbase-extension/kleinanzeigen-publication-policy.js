// Kein verbindlicher Klick ohne frischen kostenlosen Anbieterstand.
(function defineKleinanzeigenPolicy(root) {
  const PRIVATE_CONSUMER_LIMIT = 100;
  function blocked(reason) {
    return { allowed: false, reason };
  }
  function fresh(value, now, maxAge) {
    if (typeof value !== 'string') return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && time <= now && now - time <= maxAge;
  }
  function evaluate(input, now) {
    if (!input || !Number.isFinite(now)) return blocked('unknown');
    // Der aktuelle Anbieterhinweis hat Vorrang vor jedem Kontingentwert.
    if (input.fee?.state === 'paid') return blocked('fees_due');
    if (input.fee?.state !== 'free' || !fresh(input.fee.observedAt, now, 10_000))
      return blocked('fee_unknown');
    if (input.accountType !== 'private' || input.categoryGroup !== 'consumer_goods')
      return blocked('quota_unknown');
    const quota = input.quota;
    if (
      !quota ||
      typeof input.externalAccountId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/u.test(input.externalAccountId) ||
      quota.externalAccountId !== input.externalAccountId ||
      quota.accountType !== input.accountType ||
      quota.source !== 'account_settings' ||
      !fresh(quota.observedAt, now, 60_000) ||
      !Number.isSafeInteger(quota.used) ||
      quota.used < 0 ||
      !Number.isSafeInteger(input.reserved) ||
      input.reserved < 0
    )
      return blocked('quota_unknown');
    if (
      quota.used >= PRIVATE_CONSUMER_LIMIT ||
      input.reserved >= PRIVATE_CONSUMER_LIMIT - quota.used
    )
      return blocked('quota_exhausted');
    return { allowed: true, reason: null };
  }
  root.FlipbaseKleinanzeigenPolicy = Object.freeze({ evaluate });
})(globalThis);

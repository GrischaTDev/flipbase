(function exposeScheduler(root) {
  function createScheduler(adapter) {
    let ticking = false;
    async function tick() {
      if (ticking) return;
      ticking = true;
      try {
        let installation = await adapter.load();
        if (
          !installation?.binding ||
          (!installation.pendingFinish &&
            Date.parse(installation.binding.expiresAt) <= adapter.now())
        )
          return;
        const schedule = { ...installation.schedule };
        if (
          (!installation.pendingFinish &&
            (schedule.pauseReason || schedule.retryAfter > adapter.now())) ||
          installation.leaseUntil > adapter.now()
        )
          return;
        const due = [];
        if (!installation.pendingFinish && !(schedule.latestAt > adapter.now()))
          due.push(['INBOX_SYNC', 'latestAt', 300_000]);
        else if (
          !installation.pendingFinish &&
          schedule.backfillAt &&
          schedule.backfillAt <= adapter.now()
        )
          due.push(['INBOX_BACKFILL', 'backfillAt', 60_000]);
        if (!(schedule.commandsAt > adapter.now()))
          due.push(['MESSAGES_SEND', 'commandsAt', 90_000]);
        for (const [action, field, delay] of due) {
          schedule[field] = adapter.now() + delay;
          installation = await adapter.load();
          if (!installation?.binding) return;
          await adapter.save({ ...installation, schedule });
          try {
            const result = await adapter.run(action, installation.binding);
            if (action !== 'MESSAGES_SEND')
              schedule.backfillAt = result.nextPage > 1 ? adapter.now() + 60_000 : null;
          } catch (error) {
            if (
              [
                'login_required',
                'interaction_required',
                'verification_required',
                'session_blocked',
                'local_binding_invalid',
                'identity_changed',
              ].includes(error.code)
            )
              schedule.pauseReason = error.code;
            else if (error.code === 'rate_limited')
              schedule.retryAfter = error.retryAfter ?? adapter.now() + 300_000;
            schedule.lastError = error.code ?? 'unavailable';
            installation = await adapter.load();
            if (installation) await adapter.save({ ...installation, schedule });
            break;
          }
          schedule.lastSuccessAt = adapter.now();
          installation = await adapter.load();
          if (installation) await adapter.save({ ...installation, schedule });
        }
      } finally {
        ticking = false;
      }
    }
    return { tick };
  }
  const api = { createScheduler };
  root.FlipbaseVintedScheduler = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

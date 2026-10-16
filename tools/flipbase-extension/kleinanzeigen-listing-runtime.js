// Ausführung genau eines dauerhaften Kleinanzeigen-Auftrags; keine Erfolgsmeldung aus click().
(function defineKleinanzeigenListing(root) {
  const unknown = () => ({ outcome: 'outcome_unknown', errorCode: 'publication_unconfirmed' });
  const stop = (errorCode) => ({ outcome: 'needs_user_action', errorCode });
  function targetUrl(address, id) {
    try {
      const url = new URL(address);
      const match = /^\/s-anzeige\/[^/]+\/([1-9][0-9]*)-[0-9]+-[0-9]+$/u.exec(url.pathname);
      return (
        url.origin === 'https://www.kleinanzeigen.de' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        match?.[1] === id
      );
    } catch {
      return false;
    }
  }
  function validResult(value, job, now) {
    if (
      !value ||
      typeof value !== 'object' ||
      value.externalAccountId !== job.externalAccountId ||
      typeof value.externalId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/u.test(value.externalId) ||
      !targetUrl(value.url, value.externalId) ||
      typeof value.verifiedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.verifiedAt)) ||
      Date.parse(value.verifiedAt) > now ||
      now - Date.parse(value.verifiedAt) > 86400000
    )
      return unknown();
    if (
      (value.outcome === 'confirmed' && value.providerState === 'active') ||
      (value.outcome === 'processing' && value.providerState === 'processing')
    )
      return {
        outcome: value.outcome,
        url: value.url,
        externalId: value.externalId,
        externalAccountId: value.externalAccountId,
        providerState: value.providerState,
        verifiedAt: value.verifiedAt,
      };
    return unknown();
  }
  async function run(job, adapter) {
    let began = job?.state === 'writing' || job?.state === 'outcome_unknown';
    let progress;
    let validated = false;
    const finishStop = async (code) => {
      const result = stop(code);
      if (validated && job.state === 'claimed' && job.claimToken) await adapter.finish(result);
      return result;
    };
    try {
      if (
        !job ||
        typeof job.id !== 'string' ||
        !/^[1-9][0-9]*$/u.test(job.id) ||
        typeof job.externalAccountId !== 'string' ||
        !/^[1-9][0-9]{0,31}$/u.test(job.externalAccountId) ||
        !Number.isSafeInteger(job.grantGeneration) ||
        job.grantGeneration < 1 ||
        !Number.isSafeInteger(job.draftRevision) ||
        job.draftRevision < 1
      )
        return stop('invalid_job');
      validated = true;
      progress = await adapter.loadProgress(job);
      if (progress && progress.jobId !== job.id) return await finishStop('another_job_pending');
      const identityMatches = async () =>
        (await adapter.readIdentity())?.externalAccountId === job.externalAccountId;
      if (!(await identityMatches())) return await finishStop('account_changed');
      if (progress?.phase === 'result' && progress.result?.outcome === 'confirmed') {
        const outcome = validResult(progress.result, job, adapter.now());
        await adapter.finish(outcome);
        return outcome;
      }
      if (began || progress?.phase === 'writing' || progress?.phase === 'result') {
        const outcome = validResult(await adapter.readResult(job), job, adapter.now());
        await adapter.saveProgress({ jobId: job.id, phase: 'result', result: outcome });
        await adapter.finish(outcome);
        return outcome;
      }
      if (job.state !== 'claimed' || typeof job.claimToken !== 'string' || !job.claimToken)
        return stop('not_claimed');
      const grantMatches = async () => {
        const grant = await adapter.checkGrant(job);
        return grant?.active === true && grant.generation === job.grantGeneration;
      };
      if (!(await grantMatches())) return await finishStop('grant_changed');
      if ((await adapter.loadCurrentSchema(job))?.valid !== true)
        return await finishStop('schema_changed');
      if ((await adapter.fill(job))?.valid !== true) return await finishStop('invalid_fields');
      if ((await adapter.verifyUploads(job))?.complete !== true)
        return await finishStop('images_incomplete');
      if (!(await identityMatches()) || !(await grantMatches()))
        return await finishStop('account_or_grant_changed');
      const decision = root.FlipbaseKleinanzeigenPolicy.evaluate(
        await adapter.detectFee(job),
        adapter.now(),
      );
      if (!decision.allowed) {
        const outcome = stop(decision.reason);
        await adapter.finish(outcome);
        return outcome;
      }
      // Bereits eine verlorene begin-Antwort ist unklar: niemals automatisch erneut einreihen.
      began = true;
      const begin = await adapter.begin(job);
      if (begin?.authorized !== true) return stop('begin_rejected');
      await adapter.saveProgress({ jobId: job.id, phase: 'writing' });
      if (!(await identityMatches()) || !(await grantMatches())) {
        const outcome = stop('account_or_grant_changed');
        await adapter.finish(outcome);
        return outcome;
      }
      const finalDecision = root.FlipbaseKleinanzeigenPolicy.evaluate(
        await adapter.detectFee(job),
        adapter.now(),
      );
      if (!finalDecision.allowed) {
        const outcome = stop(finalDecision.reason);
        await adapter.finish(outcome);
        return outcome;
      }
      await adapter.submitOnce(job);
      const outcome = validResult(await adapter.readResult(job), job, adapter.now());
      await adapter.saveProgress({ jobId: job.id, phase: 'result', result: outcome });
      await adapter.finish(outcome);
      return outcome;
    } catch {
      // Nach begin wird ausschließlich abgeglichen. Auch ein Fehler beim Speichern darf keinen zweiten Klick auslösen.
      const result =
        began || progress?.phase === 'writing' || progress?.phase === 'result'
          ? unknown()
          : stop('preparation_failed');
      if (validated && job.claimToken)
        try {
          await adapter.finish(result);
        } catch {
          /* Nicht bestätigte Ergebnisse bleiben zur reinen Nachprüfung gespeichert. */
        }
      return result;
    }
  }
  root.FlipbaseKleinanzeigenListing = Object.freeze({ run });
})(globalThis);

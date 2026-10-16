// Persistente Browserversuche; Rohsecrets bleiben ausschließlich im vertrauenswürdigen Erweiterungsspeicher.
(function definePublicationJobs(root) {
  const id = (value) =>
    typeof value === 'string' &&
    /^[1-9][0-9]{0,18}$/u.test(value) &&
    BigInt(value) <= 9223372036854775807n;
  const secret = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
  function same(value, request) {
    return (
      value?.workspaceId === request.workspaceId &&
      value.connectionId === request.connectionId &&
      value.generation === request.generation
    );
  }
  function create(adapter) {
    let busy = false;
    async function run(request, origin) {
      if (busy) throw new Error('Ein Kleinanzeigen-Auftrag wird bereits bearbeitet.');
      busy = true;
      let timer;
      let renewal;
      let renewalError = null;
      try {
        if (
          !id(request.jobId) ||
          !id(request.connectionId) ||
          !['publish', 'reconcile'].includes(request.mode)
        )
          throw new Error('Ungültiger Auftrag.');
        let progress = await adapter.loadProgress(request);
        let installation = await adapter.loadInstallation();
        if (progress) {
          if (
            !same(progress, request) ||
            progress.jobId !== request.jobId ||
            progress.appOrigin !== origin ||
            !secret(progress.claimToken) ||
            progress.installation?.appOrigin !== origin ||
            !same(progress.installation.binding, request)
          )
            throw new Error('Der vorhandene Browserversuch gehört zu einem anderen Auftrag.');
          installation = progress.installation;
        } else {
          if (request.mode === 'reconcile')
            throw new Error('Öffne für die Ergebnisprüfung das ursprüngliche Browserprofil.');
          if (
            installation?.phase !== 'connected' ||
            installation.appOrigin !== origin ||
            !same(installation.binding, request) ||
            !installation.binding.canPublish ||
            installation.binding.accountType !== 'private' ||
            Date.parse(installation.binding.expiresAt) <= adapter.now() ||
            !secret(installation.secret)
          )
            throw new Error('Die lokale Veröffentlichungsfreigabe fehlt.');
          progress = {
            workspaceId: request.workspaceId,
            connectionId: request.connectionId,
            generation: request.generation,
            jobId: request.jobId,
            appOrigin: origin,
            claimToken: adapter.secret(),
            attemptId: adapter.uuid(),
            phase: 'claiming',
            installation,
          };
          if (!secret(progress.claimToken))
            throw new Error('Der Browserversuch konnte nicht gesichert werden.');
          await adapter.saveProgress(progress);
        }
        const common = {
          workspaceId: request.workspaceId,
          connectionId: request.connectionId,
          generation: request.generation,
          jobId: request.jobId,
          claimToken: progress.claimToken,
        };
        if (request.mode === 'publish') await adapter.quota(installation, request, null);
        const claimed = await adapter.rpc(installation, { action: 'job_claim', ...common });
        if (
          !claimed ||
          claimed.id !== request.jobId ||
          claimed.workspaceId !== request.workspaceId ||
          claimed.connectionId !== request.connectionId ||
          claimed.grantGeneration !== request.generation ||
          !Number.isSafeInteger(claimed.version) ||
          claimed.version < 1 ||
          !Number.isSafeInteger(claimed.draftRevision) ||
          claimed.draftRevision < 1 ||
          claimed.immutableSnapshot?.externalAccountId !== installation.binding.externalAccountId ||
          !Array.isArray(claimed.immutableSnapshot.images) ||
          claimed.immutableSnapshot.images.length > 20 ||
          !claimed.immutableSnapshot.content
        )
          throw new Error('Der beanspruchte Auftrag konnte nicht eindeutig geprüft werden.');
        const ack = () => ({
          workspaceId: request.workspaceId,
          connectionId: request.connectionId,
          generation: request.generation,
          jobId: request.jobId,
          handled: true,
        });
        if (claimed.state === 'needs_user_action') return ack();
        if (
          !['claimed', 'writing', 'outcome_unknown'].includes(claimed.state) ||
          claimed.claimToken !== progress.claimToken
        )
          throw new Error('Der Auftrag besitzt keinen gültigen Browserversuch.');
        if (request.mode === 'reconcile' && claimed.state === 'claimed')
          throw new Error('Die Ergebnisprüfung startet keine neue Veröffentlichung.');
        const job = {
          ...claimed,
          externalAccountId: claimed.immutableSnapshot.externalAccountId,
          content: claimed.immutableSnapshot.content,
          images: claimed.immutableSnapshot.images,
        };
        let version = job.version;
        let fee;
        const save = async (fields) => {
          progress = { ...progress, ...fields };
          await adapter.saveProgress(progress);
        };
        let checkInFlight;
        const check = () => {
          if (!checkInFlight)
            checkInFlight = performCheck().finally(() => {
              checkInFlight = undefined;
            });
          return checkInFlight;
        };
        const performCheck = async () => {
          if (renewalError) throw renewalError;
          const current = await adapter.loadInstallation();
          if (
            current?.secret !== installation.secret ||
            !same(current.binding, request) ||
            !current.binding.canPublish
          )
            throw new Error('Die lokale Freigabe wurde geändert.');
          const result = await adapter.rpc(installation, { action: 'job_check', ...common });
          if (
            result?.active !== true ||
            result.generation !== request.generation ||
            !Number.isSafeInteger(result.version) ||
            result.version < version
          )
            throw new Error('Die serverseitige Freigabe ist nicht mehr aktuell.');
          version = result.version;
          return result;
        };
        const stopTimer = async () => {
          clearInterval(timer);
          timer = undefined;
          if (renewal) await renewal;
        };
        if (job.state === 'claimed') {
          timer = setInterval(() => {
            if (renewal) return;
            renewal = check()
              .catch((error) => {
                renewalError = error;
              })
              .finally(() => {
                renewal = undefined;
              });
          }, 30000);
        }
        await root.FlipbaseKleinanzeigenListing.run(job, {
          now: adapter.now,
          loadProgress: async () =>
            progress.phase === 'claiming' || progress.phase === 'prepared'
              ? null
              : { jobId: job.id, phase: progress.phase, result: progress.result },
          saveProgress: save,
          readIdentity: () => adapter.readIdentity(installation),
          checkGrant: check,
          loadCurrentSchema: async () => {
            await check();
            const baseline = await adapter.readBaseline(installation);
            await save({ baseline });
            const form = await adapter.openForm(installation, job);
            await save({
              tabId: form.tabId,
              minimumDocumentTime: form.minimumDocumentTime,
              phase: 'prepared',
              schema: form.schema,
            });
            return { valid: form.schemaRevision === job.content.schemaRevision };
          },
          fill: async () => {
            await check();
            const result = await adapter.step(progress, 'prepare', {
              job: {
                id: job.id,
                externalAccountId: job.externalAccountId,
                content: job.content,
                images: job.images,
              },
              schema: progress.schema,
            });
            if (result?.valid !== true) return result;
            for (const image of job.images) {
              await check();
              const encoded = await adapter.photo(
                installation,
                { ...common, action: 'job_photo', imageId: image.imageId },
                image,
              );
              await check();
              const uploaded = await adapter.step(progress, 'upload', { image, encoded });
              if (uploaded?.complete !== true) throw new Error('images_incomplete');
            }
            return result;
          },
          verifyUploads: () => adapter.step(progress, 'verify'),
          detectFee: async () => {
            const quota = await adapter.quota(installation, request, job.id);
            fee = await adapter.step(progress, 'fee');
            return {
              externalAccountId: job.externalAccountId,
              accountType: installation.binding.accountType,
              categoryGroup:
                job.content.categoryId?.split('/')[0] === '153' ? 'consumer_goods' : 'unknown',
              quota: {
                externalAccountId: job.externalAccountId,
                accountType: installation.binding.accountType,
                used: quota.quota?.used,
                observedAt: quota.quota?.observedAt,
                source: 'account_settings',
              },
              reserved: quota.quota?.reserved,
              fee,
            };
          },
          begin: async () => {
            await stopTimer();
            await check();
            return await adapter.rpc(installation, {
              action: 'job_begin',
              ...common,
              expectedVersion: version,
              fee: {
                state: fee?.state ?? 'unknown',
                observedAt: fee?.observedAt ?? new Date(adapter.now()).toISOString(),
              },
            });
          },
          submitOnce: () => adapter.step(progress, 'submit'),
          readResult: () => adapter.readResult(installation, job, progress),
          finish: async (result) => {
            await stopTimer();
            await adapter.rpc(installation, { action: 'job_finish', ...common, result });
          },
        });
        return ack();
      } finally {
        clearInterval(timer);
        if (renewal) await renewal;
        busy = false;
      }
    }
    return { run };
  }
  root.FlipbaseKleinanzeigenPublicationJobs = Object.freeze({ create });
})(globalThis);

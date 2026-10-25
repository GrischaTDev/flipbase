// Vollständige Fassungen samt Originalbildern bleiben vor jedem Löschversuch lokal gesichert.
(function defineRelistingJobs(root) {
  let database;
  function db() {
    if (!database)
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open('flipbase_kleinanzeigen_relisting', 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('attempts', { keyPath: 'key' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    return database;
  }
  async function load(key) {
    const database = await db();
    return await new Promise((resolve, reject) => {
      const request = database.transaction('attempts').objectStore('attempts').get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }
  async function save(value) {
    const database = await db();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('attempts', 'readwrite');
      transaction.objectStore('attempts').put(value);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  async function all() {
    const database = await db();
    return await new Promise((resolve, reject) => {
      const records = [];
      const request = database.transaction('attempts').objectStore('attempts').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(records);
          return;
        }
        const record = cursor.value;
        // Die Übersicht hält keine Originalbild-Pakete im Arbeitsspeicher.
        records.push({
          key: record.key,
          externalId: record.externalId,
          phase: record.phase,
          snapshot: { content: { title: record.snapshot.content.title } },
        });
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }
  const comparable = (snapshot) =>
    JSON.stringify({
      ...snapshot,
      imageUrls: snapshot.imageUrls.map((address) => new URL(address).pathname),
    });
  function create(adapter) {
    let busy = false;
    const readSaved = adapter.load ?? load;
    const writeSaved = adapter.save ?? save;
    async function run(request, origin) {
      if (busy) throw new Error('Ein Kleinanzeigen-Inserat wird bereits neu eingestellt.');
      busy = true;
      let record;
      try {
        const installation = await adapter.installation();
        const binding = installation?.binding;
        if (
          installation?.phase !== 'connected' ||
          installation.appOrigin !== origin ||
          !binding?.canPublish ||
          binding.accountType !== 'private' ||
          ['workspaceId', 'connectionId', 'generation'].some(
            (key) => binding[key] !== request[key],
          ) ||
          Date.parse(binding.expiresAt) <= Date.now()
        )
          throw new Error('access_revoked');
        const check = async () => {
          const session = await adapter.check(installation);
          if (
            !session?.canPublish ||
            session.externalAccountId !== binding.externalAccountId ||
            session.generation !== binding.generation ||
            (await adapter.identity()).externalAccountId !== binding.externalAccountId
          )
            throw new Error('account_changed');
        };
        await check();
        const key = [
          origin,
          request.workspaceId,
          request.connectionId,
          binding.externalAccountId,
          request.externalId,
        ].join(':');
        record = await readSaved(key);
        if (record && record.generation !== request.generation && record.phase !== 'secured') {
          // Bewusstes Fortsetzen mit neuer, aktuell geprüfter Freigabe desselben Kontos.
          record = { ...record, generation: binding.generation };
          await writeSaved(record);
        }
        if (!record || record.phase === 'secured') {
          const source = await adapter.source(installation, request.externalId);
          const snapshot = source.snapshot;
          const categoryPath = Object.hasOwn(request.categoryPaths, snapshot.categoryLabel)
            ? request.categoryPaths[snapshot.categoryLabel]
            : null;
          if (!categoryPath)
            return {
              externalId: request.externalId,
              outcome: 'needs_user_action',
              errorCode: 'category_missing',
            };
          const images = [];
          for (const [index, url] of snapshot.imageUrls.entries()) {
            await check();
            images.push(await adapter.photo(url, index));
          }
          record = {
            key,
            externalId: request.externalId,
            generation: binding.generation,
            phase: 'secured',
            snapshot,
            images,
            categoryPath,
            sourceTabId: source.tabId,
            sourceDocumentTime: source.minimumDocumentTime,
            attemptId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          };
          // Erst nach erfolgreichem Commit dieser Transaktion darf der Löschweg beginnen.
          await writeSaved(record);
        }
        const persist = async (fields) => {
          record = { ...record, ...fields };
          await writeSaved(record);
        };
        const job = () => ({
          id: request.externalId,
          externalAccountId: binding.externalAccountId,
          content: record.content,
          images: record.images.map(({ encoded: _encoded, ...image }) => image),
        });
        const progress = () => ({
          ...record,
          jobId: request.externalId,
          installation,
          minimumDocumentTime: record.minimumDocumentTime,
          tabId: record.tabId,
        });
        const result = await root.FlipbaseKleinanzeigenRelisting.run({
          load: async () => record,
          save: async (value) => {
            await writeSaved({ ...record, ...value });
            record = { ...record, ...value };
          },
          check,
          prepare: async () => {
            const baseline = await adapter.baseline(installation);
            const target = await adapter.target(installation, request, record.categoryPath);
            const schema = target.result.schema;
            if (!schema || schema.categoryLabel !== record.snapshot.categoryLabel)
              return { complete: false };
            const fields = Object.fromEntries(
              schema.fields.map((field) => [
                field.key,
                record.snapshot.content.categoryFields[field.key] ?? '',
              ]),
            );
            if (record.snapshot.content.shippingType === 'both') {
              const methods = record.snapshot.shippingMethods;
              const groups = schema.shipping.groups.filter(
                (group) =>
                  methods.length &&
                  methods.every((value) => group.choices.some((choice) => choice.value === value)),
              );
              if (groups.length !== 1) return { complete: false };
              fields['ad-shipping-package-size'] = groups[0].value;
              fields['ad-shipping-options'] = JSON.stringify(methods);
            }
            const content = {
              ...record.snapshot.content,
              categoryId: record.categoryPath,
              categoryFields: fields,
              schemaRevision: target.result.schemaRevision,
            };
            await persist({
              content,
              baseline,
              tabId: target.tabId,
              minimumDocumentTime: target.minimumDocumentTime,
              schema,
            });
            const prepared = await adapter.step(progress(), 'prepare', { job: job(), schema });
            if (!prepared?.valid) return { complete: false };
            for (const image of record.images) {
              await check();
              if (
                !(await adapter.step(progress(), 'upload', { image, encoded: image.encoded }))
                  ?.complete
              )
                return { complete: false };
            }
            return { complete: true };
          },
          verify: () => adapter.step(progress(), 'verify'),
          costs: async () => {
            const quota = await adapter.quota(installation, request);
            if (!quota?.quota?.allowed) return { allowed: false };
            return root.FlipbaseKleinanzeigenPolicy.evaluate(
              {
                externalAccountId: binding.externalAccountId,
                accountType: binding.accountType,
                categoryGroup: ['153', '161', '17', '185', '80', '73', '272'].includes(
                  record.categoryPath.split('/')[0],
                )
                  ? 'consumer_goods'
                  : 'unknown',
                quota: {
                  ...quota.quota,
                  externalAccountId: binding.externalAccountId,
                  accountType: binding.accountType,
                  source: 'account_settings',
                },
                reserved: quota.quota.reserved,
                fee: await adapter.step(progress(), 'fee'),
              },
              Date.now(),
            );
          },
          sourceUnchanged: async (snapshot) => {
            const current = await adapter.source(
              installation,
              request.externalId,
              record.sourceTabId,
            );
            return comparable(current.snapshot) === comparable(snapshot);
          },
          remove: () =>
            adapter.remove(installation, request.externalId, record.snapshot.content.title),
          sourceAbsent: async () => {
            const end = Date.now() + 20000;
            do {
              if (!(await adapter.baseline(installation)).includes(request.externalId)) return true;
              await new Promise((resolve) => setTimeout(resolve, 500));
            } while (Date.now() < end);
            return false;
          },
          submit: () => adapter.step(progress(), 'submit'),
          result: () =>
            adapter.result(installation, job(), progress(), (value) =>
              persist({ receipt: value.receipt, tabId: value.tabId }),
            ),
        });
        await persist({ lastResult: result, updatedAt: new Date().toISOString() });
        if (result.outcome !== 'confirmed' && record.tabId) await adapter.show(record.tabId);
        return {
          ...result,
          externalId: request.externalId,
          ...(result.externalId && result.externalId !== request.externalId
            ? { newExternalId: result.externalId }
            : {}),
        };
      } finally {
        busy = false;
      }
    }
    async function list(request, origin) {
      const installation = await adapter.installation();
      const binding = installation?.binding;
      if (
        installation?.phase !== 'connected' ||
        installation.appOrigin !== origin ||
        !binding?.canPublish ||
        ['workspaceId', 'connectionId', 'generation'].some(
          (key) => binding[key] !== request[key],
        ) ||
        Date.parse(binding.expiresAt) <= Date.now()
      )
        throw new Error('access_revoked');
      const session = await adapter.check(installation);
      if (
        !session?.canPublish ||
        session.externalAccountId !== binding.externalAccountId ||
        session.generation !== binding.generation
      )
        throw new Error('access_revoked');
      const prefix = [
        origin,
        request.workspaceId,
        request.connectionId,
        binding.externalAccountId,
        '',
      ].join(':');
      return (await (adapter.all ?? all)())
        .filter((record) => record.key.startsWith(prefix) && record.phase !== 'confirmed')
        .map((record) => ({
          externalId: record.externalId,
          title: record.snapshot.content.title,
          phase: record.phase,
        }));
    }
    return { run, list };
  }
  root.FlipbaseKleinanzeigenRelistingJobs = Object.freeze({ create });
})(globalThis);

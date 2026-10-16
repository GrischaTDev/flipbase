// Kategorien werden entlang tatsächlich angebotener Links gewählt; kein Submit.
(function defineFormRuntime(root) {
  async function run(installation, input, origin, adapter) {
    const binding = installation?.binding;
    if (
      installation?.phase !== 'connected' ||
      installation.appOrigin !== origin ||
      !binding ||
      ['workspaceId', 'connectionId', 'generation'].some((key) => binding[key] !== input[key]) ||
      typeof input.categoryPath !== 'string' ||
      (input.categoryPath !== '' && !/^[1-9][0-9]*(?:\/[a-z0-9_]+){0,5}$/u.test(input.categoryPath))
    )
      throw new Error('Die lokale Kontobindung passt nicht.');
    const check = async () => {
      const current = await adapter.check();
      if (
        !current ||
        ['workspaceId', 'connectionId', 'generation', 'externalAccountId'].some(
          (key) => current[key] !== binding[key],
        )
      )
        throw new Error('Die Freigabe hat sich geändert.');
    };
    const identity = async () => {
      await check();
      const current = await adapter.readIdentity();
      if (
        current?.externalAccountId !== binding.externalAccountId ||
        current.accountType !== 'private'
      )
        throw new Error('Das Kleinanzeigen-Konto hat sich geändert.');
    };
    await identity();
    let page = await adapter.open();
    if (page?.path !== '') throw new Error('Die Kategorieauswahl hat sich geändert.');
    const parts = input.categoryPath ? input.categoryPath.split('/') : [];
    for (let index = 0; index < parts.length; index++) {
      const path = parts.slice(0, index + 1).join('/');
      const choices = page?.choices?.filter((choice) => choice.path === path);
      if (choices?.length !== 1 || (index < parts.length - 1 && !choices[0].isParent))
        throw new Error('Diese Kategorie wird nicht angeboten.');
      await check();
      page = await adapter.choose(path);
      if (page?.path !== path) throw new Error('Kategorie nicht bestätigt.');
    }
    if (!page.selectedLeaf) {
      if (!Array.isArray(page.choices) || !page.choices.length)
        throw new Error('Kategorieauswahl unvollständig.');
      await identity();
      return {
        workspaceId: binding.workspaceId,
        connectionId: binding.connectionId,
        externalAccountId: binding.externalAccountId,
        generation: binding.generation,
        categoryPath: input.categoryPath,
        categoryLabel: page.label,
        choices: page.choices,
        schema: null,
        schemaRevision: null,
        observedAt: new Date(adapter.now()).toISOString(),
      };
    }
    if (!page.canContinue) throw new Error('Kategorie nicht bestätigt.');
    await check();
    await adapter.continue(input.categoryPath);
    const schema = await adapter.readSchema(input.categoryPath, page.label);
    if (
      schema?.categoryPath !== input.categoryPath ||
      (schema.categoryLabel !== undefined && schema.categoryLabel !== page.label)
    )
      throw new Error('Formular gehört nicht zur Kategorie.');
    await identity();
    return await adapter.seal(schema, new Date(adapter.now()).toISOString());
  }
  root.FlipbaseKleinanzeigenForm = Object.freeze({ run });
})(globalThis);

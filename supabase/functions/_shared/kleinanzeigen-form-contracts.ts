export interface KleinanzeigenCategoryChoice {
  readonly path: string;
  readonly label: string;
  readonly isParent: boolean;
}
export interface KleinanzeigenFieldChoice {
  readonly value: string;
  readonly label: string;
  readonly description: string;
}
export interface KleinanzeigenProviderField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'select' | 'search';
  readonly selection: 'label' | 'value';
  readonly required: boolean;
  readonly choices: readonly KleinanzeigenFieldChoice[];
}
export interface KleinanzeigenShippingGroup {
  readonly value: string;
  readonly label: string;
  readonly choices: readonly KleinanzeigenFieldChoice[];
}
export interface KleinanzeigenProviderSchema {
  readonly categoryPath: string;
  readonly categoryLabel: string;
  readonly titleMax: number;
  readonly descriptionMax: number;
  readonly photoCountMax: number;
  readonly photoBytesMax: number;
  readonly priceStepCents: number;
  readonly fields: readonly KleinanzeigenProviderField[];
  readonly shipping: {
    readonly defaultGroup: string | null;
    readonly defaultMethods: readonly string[];
    readonly groups: readonly KleinanzeigenShippingGroup[];
  };
}
export interface KleinanzeigenFormResult {
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly externalAccountId: string;
  readonly generation: number;
  readonly categoryPath: string;
  readonly categoryLabel: string;
  readonly choices: readonly KleinanzeigenCategoryChoice[];
  readonly schema: KleinanzeigenProviderSchema | null;
  readonly schemaRevision: string | null;
  readonly observedAt: string;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const fields = (value: unknown, names: readonly string[]): value is Record<string, unknown> =>
  record(value) &&
  Object.keys(value).length === names.length &&
  names.every((name) => Object.hasOwn(value, name));
const text = (value: unknown, max = 200): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\u0000-\u0008\u000b-\u001f]/u.test(value);
export function kleinanzeigenCategoryPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 160 &&
    (value === '' || /^[1-9][0-9]*(?:\/[a-z0-9_]+){0,5}$/u.test(value))
  );
}
function choices(value: unknown): value is KleinanzeigenFieldChoice[] {
  return (
    Array.isArray(value) &&
    value.length <= 250 &&
    value.every(
      (choice) =>
        fields(choice, ['value', 'label', 'description']) &&
        text(choice['value']) &&
        text(choice['label']) &&
        typeof choice['description'] === 'string' &&
        choice['description'].length <= 1000,
    ) &&
    new Set(value.map((choice) => (choice as KleinanzeigenFieldChoice).value)).size === value.length
  );
}
export function parseKleinanzeigenProviderSchema(
  value: unknown,
): KleinanzeigenProviderSchema | null {
  if (
    !fields(value, [
      'categoryPath',
      'categoryLabel',
      'titleMax',
      'descriptionMax',
      'photoCountMax',
      'photoBytesMax',
      'priceStepCents',
      'fields',
      'shipping',
    ]) ||
    !kleinanzeigenCategoryPath(value['categoryPath']) ||
    !value['categoryPath'] ||
    !text(value['categoryLabel'], 600) ||
    value['titleMax'] !== 65 ||
    value['descriptionMax'] !== 4000 ||
    value['photoCountMax'] !== 20 ||
    value['photoBytesMax'] !== 12582912 ||
    value['priceStepCents'] !== 100 ||
    !Array.isArray(value['fields']) ||
    value['fields'].length > 30
  )
    return null;
  for (const field of value['fields']) {
    if (
      !fields(field, ['key', 'label', 'kind', 'selection', 'required', 'choices']) ||
      !text(field['key'], 160) ||
      !/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/u.test(field['key']) ||
      !text(field['label']) ||
      !['select', 'search'].includes(String(field['kind'])) ||
      !['label', 'value'].includes(String(field['selection'])) ||
      typeof field['required'] !== 'boolean' ||
      !choices(field['choices']) ||
      (field['kind'] === 'select' && !field['choices'].length) ||
      (field['kind'] === 'search' && field['choices'].length !== 0)
    )
      return null;
  }
  if (
    new Set(value['fields'].map((field) => (field as KleinanzeigenProviderField).key)).size !==
      value['fields'].length ||
    !fields(value['shipping'], ['defaultGroup', 'defaultMethods', 'groups'])
  )
    return null;
  const shipping = value['shipping'];
  if (
    !Array.isArray(shipping['groups']) ||
    shipping['groups'].length > 10 ||
    !Array.isArray(shipping['defaultMethods']) ||
    shipping['defaultMethods'].length > 20 ||
    !shipping['defaultMethods'].every((method) => text(method, 100)) ||
    new Set(shipping['defaultMethods']).size !== shipping['defaultMethods'].length
  )
    return null;
  for (const group of shipping['groups'])
    if (
      !fields(group, ['value', 'label', 'choices']) ||
      !text(group['value'], 100) ||
      !text(group['label']) ||
      !choices(group['choices']) ||
      !group['choices'].length
    )
      return null;
  const groups = shipping['groups'] as unknown as KleinanzeigenShippingGroup[];
  if (new Set(groups.map((group) => group.value)).size !== groups.length) return null;
  const selected = groups.find((group) => group.value === shipping['defaultGroup']);
  if (
    groups.length
      ? !selected ||
        shipping['defaultMethods'].some(
          (method) => !selected.choices.some((choice) => choice.value === method),
        )
      : shipping['defaultGroup'] !== null || shipping['defaultMethods'].length > 0
  )
    return null;
  return structuredClone(value) as unknown as KleinanzeigenProviderSchema;
}
export function parseKleinanzeigenFormResult(
  value: unknown,
  scope: {
    readonly workspaceId: string;
    readonly connectionId: string;
    readonly externalAccountId: string;
    readonly generation: number;
    readonly categoryPath: string;
  },
): KleinanzeigenFormResult | null {
  if (
    !fields(value, [
      'workspaceId',
      'connectionId',
      'externalAccountId',
      'generation',
      'categoryPath',
      'categoryLabel',
      'choices',
      'schema',
      'schemaRevision',
      'observedAt',
    ]) ||
    Object.entries(scope).some(([key, expected]) => value[key] !== expected) ||
    typeof value['categoryLabel'] !== 'string' ||
    value['categoryLabel'].length > 600 ||
    !Array.isArray(value['choices']) ||
    value['choices'].length > 300 ||
    typeof value['observedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['observedAt']))
  )
    return null;
  const depth = scope.categoryPath ? scope.categoryPath.split('/').length + 1 : 1;
  for (const choice of value['choices'])
    if (
      !fields(choice, ['path', 'label', 'isParent']) ||
      !kleinanzeigenCategoryPath(choice['path']) ||
      !choice['path'] ||
      !text(choice['label']) ||
      typeof choice['isParent'] !== 'boolean' ||
      !choice['path'].startsWith(scope.categoryPath ? scope.categoryPath + '/' : '') ||
      choice['path'].split('/').length !== depth
    )
      return null;
  if (
    new Set(value['choices'].map((choice) => (choice as KleinanzeigenCategoryChoice).path)).size !==
    value['choices'].length
  )
    return null;
  if (value['schema'] === null) {
    if (value['schemaRevision'] !== null || !value['choices'].length) return null;
  } else {
    const schema = parseKleinanzeigenProviderSchema(value['schema']);
    if (
      !schema ||
      schema.categoryPath !== scope.categoryPath ||
      schema.categoryLabel !== value['categoryLabel'] ||
      value['choices'].length ||
      typeof value['schemaRevision'] !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value['schemaRevision'])
    )
      return null;
  }
  return structuredClone(value) as unknown as KleinanzeigenFormResult;
}

export interface KleinanzeigenFormImport {
  readonly action: 'form_schema';
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly generation: number;
  readonly externalAccountId: string;
  readonly schema: KleinanzeigenProviderSchema;
  readonly observedAt: string;
}
export function parseKleinanzeigenFormImport(
  value: unknown,
  now = Date.now(),
): KleinanzeigenFormImport | null {
  if (
    !fields(value, [
      'action',
      'workspaceId',
      'connectionId',
      'generation',
      'externalAccountId',
      'schema',
      'observedAt',
    ]) ||
    value['action'] !== 'form_schema' ||
    typeof value['workspaceId'] !== 'string' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value['workspaceId']) ||
    !(
      typeof value['connectionId'] === 'string' &&
      /^[1-9][0-9]{0,18}$/u.test(value['connectionId']) &&
      BigInt(value['connectionId']) <= 9223372036854775807n
    ) ||
    typeof value['generation'] !== 'number' ||
    !Number.isSafeInteger(value['generation']) ||
    value['generation'] < 1 ||
    typeof value['externalAccountId'] !== 'string' ||
    !/^[1-9][0-9]{0,31}$/u.test(value['externalAccountId']) ||
    typeof value['observedAt'] !== 'string'
  )
    return null;
  const observed = Date.parse(value['observedAt']);
  const schema = parseKleinanzeigenProviderSchema(value['schema']);
  if (!schema || !Number.isFinite(observed) || observed < now - 60000 || observed > now + 5000)
    return null;
  return {
    action: 'form_schema',
    workspaceId: value['workspaceId'],
    connectionId: value['connectionId'],
    generation: value['generation'],
    externalAccountId: value['externalAccountId'],
    schema,
    observedAt: value['observedAt'],
  };
}

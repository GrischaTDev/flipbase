import { parseTemplate } from '@angular/compiler';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeSelectPattern = /<select\b/giu;
const localStatusPillPattern =
  /<span\b[^>]*class\s*=\s*"[^"]*(?:rounded-full|rounded-lg|rounded-md)[^"]*px-[^"]*(?:bg-(?:amber|blue|emerald|rose)-|text-(?:amber|blue|emerald|rose)-)[^"]*"[^>]*>/giu;
const blackPrimaryVariantPattern =
  /<app-button\b[^>]*\bvariant\s*=\s*["']primary-dark["'][^>]*>/giu;
const directTableColumnMenuPattern = /<app-table-column-menu\b/giu;
const legacyTableToolbarPattern = /<app-table-toolbar\b/giu;
const nativeTableSearchPattern = /<input\b[^>]*\btype\s*=\s*["']search["'][^>]*>/giu;
const purchaseWorkspacePath =
  /\/purchases\/(?:components|pages)\/(?:purchase-entry-form|purchase-line-editor|purchase-cost-editor|purchase-cost-summary|purchase-cost-overview-dialog|purchase-create|purchase-detail|purchase-edit)\//u;
const nativeWorkspaceControlPattern = /<(?:button|input|textarea)\b[^>]*>/giu;
const strictSharedFormPath = /^src\/app\/features\/(?:expenses|settings)\//u;
const nativeFormControlPattern = /<(?:input|textarea)\b[^>]*>/giu;
const nativeFormControlTypes = new Set([
  'text',
  'email',
  'password',
  'url',
  'tel',
  'number',
  'date',
  'time',
  'datetime-local',
  'search',
]);

const legacyNativeFormControlPaths = new Set([
  'src/app/features/accounting/accounting.component.html',
  'src/app/features/audit/components/record-timeline/record-timeline.component.html',
  'src/app/features/auth/login/login.component.html',
  'src/app/features/auth/register/register.component.html',
  'src/app/features/auth/set-password/set-password.component.html',
  'src/app/features/deal-calculator/deal-calculator.component.html',
  'src/app/features/fulfillment/fulfillment.component.html',
  'src/app/features/image-optimizer/components/optimizer-header/optimizer-header.component.html',
  'src/app/features/listings/pages/listing-editor/listing-editor.component.html',
  'src/app/features/onboarding/workspace-setup/workspace-setup.component.html',
  'src/app/features/research/research.component.html',
  'src/app/features/sales/components/sale-create-modal/sale-create-modal.component.html',
  'src/app/features/sales/sales.component.html',
]);

const legacyCustomModalPaths = new Set([
  'src/app/features/accounting/accounting.component.html',
  'src/app/features/auth/components/privacy-modal/privacy-modal.component.html',
  'src/app/features/auth/components/terms-modal/terms-modal.component.html',
  'src/app/features/fulfillment/fulfillment.component.html',
  'src/app/features/research/research.component.html',
  'src/app/features/sales/sales.component.html',
]);

const approvedTableExceptions = new Map([
  [
    'src/app/features/purchases/pages/purchase-print/purchase-print.component.html',
    new Set(['static-table']),
  ],
  [
    'src/app/features/purchases/components/purchase-line-editor/purchase-line-editor.component.html',
    new Set(['embedded-table']),
  ],
  [
    'src/app/features/purchases/components/purchase-detail-table/purchase-detail-table.component.html',
    new Set(['static-table']),
  ],
  ['src/app/features/accounting/accounting.component.html', new Set(['static-table'])],
  ['src/app/features/analytics/analytics.component.html', new Set(['static-table'])],
  ['src/app/features/fulfillment/fulfillment.component.html', new Set(['static-table'])],
  ['src/app/features/dashboard/dashboard.component.html', new Set(['static-table'])],
  ['src/app/features/catalog/catalog.component.html', new Set(['static-table'])],
  [
    'src/app/features/inventory/components/stock-position-list/stock-position-list.component.html',
    new Set(['data-table-content', 'static-table']),
  ],
]);

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/u).length;
}

function attributeValue(node, name) {
  const attribute = [...(node.attributes ?? []), ...(node.templateAttrs ?? [])].find(
    (candidate) => candidate.name === name,
  );
  return attribute?.value ?? null;
}

function templateElements(source, path) {
  const parsed = parseTemplate(source, path, { preserveWhitespaces: false });
  if (parsed.errors?.length) {
    throw new Error(parsed.errors.map((error) => error.toString()).join('\n'));
  }
  const elements = [];
  const walk = (nodes, ancestors) => {
    for (const node of nodes ?? []) {
      const nextAncestors = typeof node.name === 'string' ? [...ancestors, node] : ancestors;
      if (typeof node.name === 'string') elements.push({ node, ancestors });
      walk(node.children, nextAncestors);
    }
  };
  walk(parsed.nodes, []);
  return elements;
}

export function findAdminSharedUiViolations(path, source) {
  const violations = [];
  const normalizedPath = path.replaceAll('\\', '/');
  const elements = templateElements(source, path);
  const tables = elements.filter(({ node }) => node.name === 'table');

  for (const match of source.matchAll(nativeSelectPattern)) {
    violations.push({ rule: 'native-select', line: lineAt(source, match.index) });
  }
  for (const match of source.matchAll(localStatusPillPattern)) {
    violations.push({ rule: 'local-status-pill', line: lineAt(source, match.index) });
  }
  for (const match of source.matchAll(blackPrimaryVariantPattern)) {
    violations.push({ rule: 'black-primary-variant', line: lineAt(source, match.index) });
  }
  for (const match of source.matchAll(directTableColumnMenuPattern)) {
    violations.push({ rule: 'direct-table-column-menu', line: lineAt(source, match.index) });
  }
  for (const match of source.matchAll(legacyTableToolbarPattern)) {
    violations.push({ rule: 'legacy-table-toolbar', line: lineAt(source, match.index) });
  }

  if (strictSharedFormPath.test(normalizedPath)) {
    for (const match of source.matchAll(nativeFormControlPattern)) {
      const tag = match[0];
      const hiddenFileTransport =
        /\btype=["']file["']/u.test(tag) &&
        /\bclass=["'][^"']*\b(?:hidden|sr-only)\b/u.test(tag) &&
        /\bdata-shared-ui-exception=["']native-file-picker["']/u.test(tag);
      if (!hiddenFileTransport) {
        violations.push({ rule: 'native-form-control', line: lineAt(source, match.index) });
      }
    }
  } else if (
    !purchaseWorkspacePath.test(normalizedPath) &&
    !legacyNativeFormControlPaths.has(normalizedPath)
  ) {
    for (const { node } of elements) {
      const isTextarea = node.name === 'textarea';
      const inputType = node.name === 'input' ? attributeValue(node, 'type') || 'text' : null;
      const isStandardInput = inputType !== null && nativeFormControlTypes.has(inputType);
      const tableSearchHandledSeparately = inputType === 'search' && tables.length > 0;
      if ((isTextarea || isStandardInput) && !tableSearchHandledSeparately) {
        violations.push({ rule: 'native-form-control', line: node.sourceSpan.start.line + 1 });
      }
    }
  }

  if (
    source.includes('appModalDialog') &&
    !source.includes('<app-modal-shell') &&
    !legacyCustomModalPaths.has(normalizedPath)
  ) {
    violations.push({
      rule: 'custom-modal-shell',
      line: lineAt(source, source.indexOf('appModalDialog')),
    });
  }

  if (tables.length > 0) {
    for (const match of source.matchAll(nativeTableSearchPattern)) {
      violations.push({ rule: 'native-table-search', line: lineAt(source, match.index) });
    }

    for (const { node, ancestors } of tables) {
      const line = node.sourceSpan.start.line + 1;
      const exception = attributeValue(node, 'data-shared-ui-exception');
      if (exception !== null) {
        if (!approvedTableExceptions.get(path)?.has(exception)) {
          violations.push({ rule: 'unapproved-table-exception', line });
        }
        continue;
      }

      const dataTableIndex = ancestors.findIndex((ancestor) => ancestor.name === 'app-data-table');
      const inContentSlot = ancestors
        .slice(dataTableIndex + 1)
        .some((ancestor) => attributeValue(ancestor, 'table-content') !== null);
      if (dataTableIndex < 0) {
        violations.push({ rule: 'managed-table-without-data-table', line });
      } else if (!inContentSlot) {
        violations.push({ rule: 'table-outside-content-slot', line });
      }
    }
  }

  if (purchaseWorkspacePath.test(normalizedPath)) {
    for (const match of source.matchAll(nativeWorkspaceControlPattern)) {
      const tag = match[0];
      const hiddenFileTransport =
        /\btype=["']file["']/u.test(tag) &&
        /\bclass=["'][^"']*\b(?:hidden|sr-only)\b/u.test(tag) &&
        /\bdata-shared-ui-exception=["']native-file-picker["']/u.test(tag);
      if (!hiddenFileTransport) {
        violations.push({ rule: 'native-workspace-control', line: lineAt(source, match.index) });
      }
    }
  }

  return violations.sort(
    (left, right) => left.line - right.line || left.rule.localeCompare(right.rule),
  );
}

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? collectHtmlFiles(path) : [path];
    }),
  );
  return files.flat().filter((path) => path.endsWith('.html'));
}

export async function checkAdminSharedUi(root = process.cwd()) {
  const featuresRoot = resolve(root, 'src/app/features');
  const files = (await collectHtmlFiles(featuresRoot)).filter(
    (path) => !relative(featuresRoot, path).replaceAll('\\', '/').startsWith('store/'),
  );
  const violations = [];

  for (const path of files) {
    const source = await readFile(path, 'utf8');
    const relativePath = relative(root, path).replaceAll('\\', '/');
    for (const violation of findAdminSharedUiViolations(relativePath, source)) {
      violations.push(`${relativePath}:${violation.line} ${violation.rule}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(`Abweichungen von Shared-UI-Komponenten:\n${violations.join('\n')}`);
  }

  return { files: files.length, findings: 0 };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await checkAdminSharedUi(dirname(dirname(fileURLToPath(import.meta.url))));
  console.log(JSON.stringify(result));
}

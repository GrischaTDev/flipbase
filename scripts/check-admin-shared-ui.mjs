import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeSelectPattern = /<select\b/giu;
const localStatusPillPattern =
  /<span\b[^>]*class\s*=\s*"[^"]*(?:rounded-full|rounded-lg|rounded-md)[^"]*px-[^"]*(?:bg-(?:amber|blue|emerald|rose)-|text-(?:amber|blue|emerald|rose)-)[^"]*"[^>]*>/giu;
const blackPrimaryVariantPattern =
  /<app-button\b[^>]*\bvariant\s*=\s*["']primary-dark["'][^>]*>/giu;
const purchaseWorkspacePath =
  /\/purchases\/(?:components|pages)\/(?:purchase-entry-form|purchase-line-editor|purchase-cost-editor|purchase-cost-summary|purchase-cost-overview-dialog|purchase-create|purchase-detail|purchase-edit)\//u;
const nativeWorkspaceControlPattern = /<(?:button|input|textarea)\b[^>]*>/giu;

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/u).length;
}

export function findAdminSharedUiViolations(path, source) {
  const violations = [];
  for (const match of source.matchAll(nativeSelectPattern)) {
    violations.push({ rule: 'native-select', line: lineAt(source, match.index) });
  }
  for (const match of source.matchAll(localStatusPillPattern)) {
    violations.push({ rule: 'local-status-pill', line: lineAt(source, match.index) });
  }
  for (const match of source.matchAll(blackPrimaryVariantPattern)) {
    violations.push({ rule: 'black-primary-variant', line: lineAt(source, match.index) });
  }
  if (purchaseWorkspacePath.test(path.replaceAll('\\', '/'))) {
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

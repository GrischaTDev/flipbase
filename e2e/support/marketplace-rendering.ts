import {
  type Component,
  type Type,
  resolveForwardRef,
  ɵReflectionCapabilities,
  ɵclearResolutionOfComponentResourcesQueue,
  ɵresolveComponentResources,
  ɵrestoreComponentResolutionQueue,
} from '@angular/core';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

interface BindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}
interface RenderingComponent {
  type: unknown;
  path: string;
}
interface SignalBinding {
  name: string;
  alias: string;
  kind: 'input' | 'model' | 'output';
}

const reflection = new ɵReflectionCapabilities();
const sources = new Map<string, Promise<ts.SourceFile>>();

function readSource(path: string): Promise<ts.SourceFile> {
  let source = sources.get(path);
  if (!source) {
    source = readFile(path, 'utf8').then((text) =>
      ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true),
    );
    sources.set(path, source);
  }
  return source;
}

function angularAnnotation(type: Type<unknown>): Component | undefined {
  return reflection
    .annotations(type)
    .find((item) => item.ngMetadataName === 'Component' || item.ngMetadataName === 'Directive') as
    Component | undefined;
}

function findSourceClass(source: ts.SourceFile, type: Type<unknown>) {
  const declarations = source.statements.filter(ts.isClassDeclaration);
  const named = declarations.find((node) => node.name?.text === type.name);
  if (named) return named;
  // Der Angular-Builder darf JavaScript-Klassen umbenennen. Der tatsächliche
  // Angular-Selector verbindet sie weiterhin eindeutig mit ihrer Quelldeklaration.
  const selector = angularAnnotation(type)?.selector;
  if (!selector) return undefined;
  const candidates = declarations.filter((node) =>
    ts.getDecorators(node)?.some((decorator) => {
      if (!ts.isCallExpression(decorator.expression)) return false;
      const metadata = decorator.expression.arguments[0];
      return (
        metadata &&
        ts.isObjectLiteralExpression(metadata) &&
        metadata.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
            property.name.text === 'selector' &&
            ts.isStringLiteralLike(property.initializer) &&
            property.initializer.text === selector,
        )
      );
    }),
  );
  if (candidates.length > 1)
    throw new Error(`Mehrdeutiger Testselector ${selector} in ${source.fileName}`);
  return candidates[0];
}

function readBindings(source: ts.SourceFile, type: Type<unknown>): SignalBinding[] {
  const declaration = findSourceClass(source, type);
  if (!declaration) throw new Error(`Testklasse ${type.name} fehlt in ${source.fileName}`);
  const signalImports = new Map<string, SignalBinding['kind']>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@angular/core'
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const binding of bindings.elements) {
      const name = (binding.propertyName ?? binding.name).text;
      if (name === 'input' || name === 'model' || name === 'output')
        signalImports.set(binding.name.text, name);
    }
  }
  const result: SignalBinding[] = [];
  for (const member of declaration.members) {
    if (
      !ts.isPropertyDeclaration(member) ||
      !ts.isIdentifier(member.name) ||
      !member.initializer ||
      !ts.isCallExpression(member.initializer)
    )
      continue;
    const call = member.initializer;
    const target =
      ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'required'
        ? call.expression.expression
        : call.expression;
    if (!ts.isIdentifier(target)) continue;
    const kind = signalImports.get(target.text);
    if (!kind) continue;
    let alias = member.name.text;
    const required = ts.isPropertyAccessExpression(call.expression);
    const options = call.arguments[kind === 'output' || required ? 0 : 1];
    if (options && !ts.isObjectLiteralExpression(options)) {
      throw new Error(`Nichtstatische Signal-Optionen: ${type.name}.${member.name.text}`);
    }
    if (options && ts.isObjectLiteralExpression(options)) {
      const property = options.properties.find(
        (entry) =>
          ts.isPropertyAssignment(entry) &&
          (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) &&
          entry.name.text === 'alias',
      );
      if (property && ts.isPropertyAssignment(property)) {
        if (!ts.isStringLiteralLike(property.initializer)) {
          throw new Error(`Nichtstatischer Signal-Alias: ${type.name}.${member.name.text}`);
        }
        alias = property.initializer.text;
      }
    }
    result.push({ name: member.name.text, alias, kind });
  }
  return result;
}

/** Folgt nur tatsächlich eingebundenen lokalen Angular-Komponenten und Direktiven. */
async function collectComponents(entries: readonly RenderingComponent[]) {
  const paths = new Map<Type<unknown>, string>();
  for (const entry of entries) {
    const type = entry.type as Type<unknown>;
    const path = resolve(entry.path);
    if (paths.has(type) && paths.get(type) !== path) {
      throw new Error(`Widersprüchliche Testpfade für ${type.name}`);
    }
    paths.set(type, path);
  }
  const collected = new Map<Type<unknown>, { path: string; bindings: SignalBinding[] }>();
  async function visit(type: Type<unknown>, path: string): Promise<void> {
    if (collected.has(type)) return;
    const source = await readSource(path);
    collected.set(type, { path, bindings: readBindings(source, type) });
    const annotation = angularAnnotation(type);
    for (const dependency of (annotation?.imports ?? []).flat(Infinity)) {
      const importedType = resolveForwardRef(dependency) as Type<unknown>;
      if (typeof importedType !== 'function') continue;
      const explicitPath = paths.get(importedType);
      if (explicitPath) {
        await visit(importedType, explicitPath);
        continue;
      }
      const imports: { path: string; exportedName: string }[] = [];
      for (const statement of source.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          !statement.moduleSpecifier.text.startsWith('.') ||
          statement.importClause?.isTypeOnly
        )
          continue;
        const bindings = statement.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const binding of bindings.elements) {
          if (!binding.isTypeOnly)
            imports.push({
              path: resolve(dirname(path), statement.moduleSpecifier.text + '.ts'),
              exportedName: (binding.propertyName ?? binding.name).text,
            });
        }
      }
      let candidates = imports
        .filter((entry) => entry.exportedName === importedType.name)
        .map((entry) => entry.path);
      if (!candidates.length && angularAnnotation(importedType)?.selector) {
        for (const entry of imports) {
          const declaration = findSourceClass(await readSource(entry.path), importedType);
          if (declaration?.name?.text === entry.exportedName) candidates.push(entry.path);
        }
      }
      candidates = [...new Set(candidates)];
      if (candidates.length > 1)
        throw new Error(`Mehrdeutiger Testimport ${importedType.name} in ${path}`);
      if (candidates.length === 1) await visit(importedType, candidates[0]);
    }
  }
  for (const [type, path] of paths) await visit(type, path);
  return collected;
}

/**
 * Nur für Vitest-JIT: Ressourcen relativ zur tatsächlichen Quelldatei auflösen
 * und fehlende Signalmetadaten ergänzen. Bereits kompilierte Bindungen bleiben erhalten.
 * Die private Angular-Queue bleibt auf die vorbereiteten Komponenten begrenzt.
 */
export async function prepareMarketplaceRendering(
  components: readonly RenderingComponent[],
): Promise<() => void> {
  const collected = await collectComponents(components);
  const queue = ɵclearResolutionOfComponentResourcesQueue();
  const selected = new Map([...queue].filter(([type]) => collected.has(type)));
  const remaining = new Map([...queue].filter(([type]) => !collected.has(type)));
  const resourceSnapshots = new Map<Component, Component>();
  try {
    // Absolute URLs verhindern, dass Angular gleichnamige Dateien aus verschiedenen
    // Verzeichnissen unter demselben Schlüssel zwischenspeichert.
    const resources = new Map<string, string>();
    for (const [type, metadata] of selected) {
      const base = dirname(collected.get(type)!.path);
      resourceSnapshots.set(metadata, {
        ...metadata,
        ...(Array.isArray(metadata.styles) ? { styles: [...metadata.styles] } : {}),
      });
      const urls = [metadata.templateUrl, metadata.styleUrl, ...(metadata.styleUrls ?? [])].filter(
        (url): url is string => !!url,
      );
      for (const url of urls) {
        const path = resolve(base, url);
        if (!resources.has(path)) resources.set(path, await readFile(path, 'utf8'));
      }
      if (metadata.templateUrl) metadata.templateUrl = resolve(base, metadata.templateUrl);
      if (metadata.styleUrl) metadata.styleUrl = resolve(base, metadata.styleUrl);
      if (metadata.styleUrls)
        metadata.styleUrls = metadata.styleUrls.map((url) => resolve(base, url));
    }
    ɵrestoreComponentResolutionQueue(selected);
    await ɵresolveComponentResources(async (url) => {
      const resource = resources.get(url);
      if (resource === undefined) throw new Error(`Nicht zugeordnete Testressource: ${url}`);
      return resource;
    });
    ɵrestoreComponentResolutionQueue(remaining);
  } catch (error) {
    for (const [metadata, snapshot] of resourceSnapshots) {
      for (const key of ['template', 'styles', 'templateUrl', 'styleUrl', 'styleUrls'] as const) {
        delete metadata[key];
      }
      Object.assign(metadata, snapshot);
    }
    ɵrestoreComponentResolutionQueue(queue);
    throw error;
  }

  const restore: (() => void)[] = [];
  const reset = () =>
    restore
      .splice(0)
      .reverse()
      .forEach((restoreBindings) => restoreBindings());
  try {
    for (const [type, { bindings }] of collected) {
      const definition = type as unknown as { ɵcmp?: BindingMetadata; ɵdir?: BindingMetadata };
      const metadata = definition.ɵcmp ?? definition.ɵdir;
      if (!metadata) continue;
      const previous = {
        inputs: metadata.inputs,
        declaredInputs: metadata.declaredInputs,
        outputs: metadata.outputs,
      };
      restore.push(() => Object.assign(metadata, previous));
      metadata.inputs = { ...metadata.inputs };
      metadata.declaredInputs = { ...metadata.declaredInputs };
      metadata.outputs = { ...metadata.outputs };
      for (const { name, alias, kind } of bindings) {
        if (kind !== 'output') {
          const existing = metadata.inputs[alias];
          if (
            existing !== undefined &&
            (!Array.isArray(existing) || existing[0] !== name || existing[1] !== 1)
          ) {
            throw new Error(`Widersprüchlicher Testeingang: ${type.name}.${alias}`);
          }
          if (
            metadata.declaredInputs[alias] !== undefined &&
            metadata.declaredInputs[alias] !== name
          ) {
            throw new Error(`Widersprüchlicher deklarierter Testeingang: ${type.name}.${alias}`);
          }
          metadata.inputs[alias] ??= [name, 1, null];
          metadata.declaredInputs[alias] ??= name;
        }
        if (kind !== 'input') {
          const outputAlias = kind === 'model' ? `${alias}Change` : alias;
          if (
            metadata.outputs[outputAlias] !== undefined &&
            metadata.outputs[outputAlias] !== name
          ) {
            throw new Error(`Widersprüchlicher Testausgang: ${type.name}.${outputAlias}`);
          }
          metadata.outputs[outputAlias] = name;
        }
      }
    }
  } catch (error) {
    reset();
    throw error;
  }
  return reset;
}

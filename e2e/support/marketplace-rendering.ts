import { ɵresolveComponentResources } from '@angular/core';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

interface BindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}
/** Nur für den bestehenden Vitest-JIT-Lauf: ersetzt dort fehlende Compiler-Metadaten. */
export async function prepareMarketplaceRendering(
  components: readonly { type: unknown; path: string }[],
): Promise<() => void> {
  const files = new Map<string, string>();
  for (const { path } of components) {
    const prefix = path.replace(/\.ts$/, '');
    files.set(`./${basename(prefix)}.html`, `${prefix}.html`);
    files.set(`./${basename(prefix)}.scss`, `${prefix}.scss`);
  }
  await ɵresolveComponentResources((url) => {
    const path = files.get(url);
    if (!path) throw new Error(`Nicht zugeordnete Testressource: ${url}`);
    return readFile(resolve(path), 'utf8');
  });
  const restore: (() => void)[] = [];
  for (const { type, path } of components) {
    const definition = type as { ɵcmp?: BindingMetadata; ɵdir?: BindingMetadata };
    const metadata = definition.ɵcmp ?? definition.ɵdir;
    if (!metadata) continue;
    const previous = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
      outputs: metadata.outputs,
    };
    metadata.inputs = { ...metadata.inputs };
    metadata.declaredInputs = { ...metadata.declaredInputs };
    metadata.outputs = { ...metadata.outputs };
    for (const match of (await readFile(resolve(path), 'utf8')).matchAll(
      /readonly\s+(\w+)\s*=\s*(input|model|output)(?=[<.(])/g,
    )) {
      const [, name, kind] = match;
      if (kind !== 'output') {
        metadata.inputs[name] = [name, 1, null];
        metadata.declaredInputs[name] = name;
      }
      if (kind === 'output') metadata.outputs[name] = name;
      if (kind === 'model') metadata.outputs[`${name}Change`] = name;
    }
    restore.push(() => Object.assign(metadata, previous));
  }
  return () => restore.reverse().forEach((reset) => reset());
}

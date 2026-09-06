/**
 * Liest den Kategoriebaum aus dem HTML der Vinted-Startseite.
 *
 * Warum aus dem HTML und nicht aus der API: Vinted hat keinen offenen Endpunkt
 * dafuer - /api/v2/catalogs und /api/v2/catalog/initializers antworten mit 404
 * (gemessen am 02.09. und erneut am 06.09.2026). Der vollstaendige Baum steht
 * aber in einem Next.js-Flight-Block der Startseite unter dem Schluessel
 * `catalogTree`.
 *
 * Der Block sieht so aus:
 *
 *   self.__next_f.push([1,"d4:[\"$\",…,{\"catalogTree\":[{…}]}]\n"])
 *
 * Der Inhalt ist ein JS-String-Literal, die Anfuehrungszeichen darin sind
 * escaped. Deshalb wird das Literal erst mit JSON.parse entpackt und der Baum
 * anschliessend aus dem entpackten Text ausgeschnitten. Ein Zugriff mit einem
 * einzelnen regulaeren Ausdruck ueber das rohe HTML scheitert an genau diesen
 * Escapes.
 */

export interface VintedCategory {
  id: number;
  parentId: number | null;
  title: string;
  slug: string;
  path: string;
  isLeaf: boolean;
}

interface TreeNode {
  id: number;
  title: string;
  url?: string;
  catalogs?: TreeNode[];
}

const PUSH_MARKER = 'self.__next_f.push([1,';
const TREE_KEY = '"catalogTree":[';

/** Ende eines JS-String-Literals ab der oeffnenden Anfuehrung, Escapes beachtet. */
function findStringEnd(text: string, openQuote: number): number {
  let index = openQuote + 1;

  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === '"') return index;
    index++;
  }

  return -1;
}

/** Schneidet ab `start` ein ausgeglichenes JSON-Array aus. */
function sliceArray(text: string, start: number): string | null {
  let depth = 0;

  for (let index = start; index < text.length; index++) {
    if (text[index] === '[') depth++;
    else if (text[index] === ']') {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function findTree(html: string): TreeNode[] | null {
  for (
    let at = html.indexOf(PUSH_MARKER);
    at !== -1;
    at = html.indexOf(PUSH_MARKER, at + PUSH_MARKER.length)
  ) {
    const openQuote = html.indexOf('"', at + PUSH_MARKER.length);
    if (openQuote === -1) continue;

    const closeQuote = findStringEnd(html, openQuote);
    if (closeQuote === -1) continue;

    let payload: string;
    try {
      payload = JSON.parse(html.slice(openQuote, closeQuote + 1)) as string;
    } catch {
      continue;
    }

    const keyAt = payload.indexOf(TREE_KEY);
    if (keyAt === -1) continue;

    const array = sliceArray(payload, payload.indexOf('[', keyAt));
    if (array === null) continue;

    try {
      return JSON.parse(array) as TreeNode[];
    } catch {
      continue;
    }
  }

  return null;
}

/** Letztes Pfadsegment der Kategorieadresse, z. B. "1049-boots". */
function slugOf(node: TreeNode): string {
  const url = node.url ?? '';
  const segments = url.split('/').filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? String(node.id);
}

export function parseCategoryTree(html: string): VintedCategory[] {
  const tree = findTree(html);

  if (tree === null) throw new Error('Kein catalogTree im HTML gefunden');
  if (tree.length === 0) throw new Error('Der catalogTree ist leer');

  const flat: VintedCategory[] = [];

  const walk = (nodes: TreeNode[], parentId: number | null, parentPath: string): void => {
    for (const node of nodes) {
      const children = node.catalogs ?? [];
      const path = parentPath === '' ? node.title : `${parentPath} > ${node.title}`;

      flat.push({
        id: node.id,
        parentId,
        title: node.title,
        slug: slugOf(node),
        path,
        isLeaf: children.length === 0,
      });

      if (children.length > 0) walk(children, node.id, path);
    }
  };

  walk(tree, null, '');

  return flat;
}

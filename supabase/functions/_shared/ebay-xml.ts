/** Kleiner XML-Leser für die festen Trading-Antworten; keine DTDs oder externen Entitäten. */
export interface EbayXmlNode {
  name: string;
  text: string;
  attributes: Record<string, string>;
  children: EbayXmlNode[];
}
function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (!entity.startsWith('#')) return named[entity];
    const characterCode = entity.startsWith('#x')
      ? parseInt(entity.slice(2), 16)
      : parseInt(entity.slice(1), 10);
    if (
      characterCode > 0x10ffff ||
      characterCode <= 0 ||
      (characterCode >= 0xd800 && characterCode <= 0xdfff)
    )
      throw new Error('Invalid XML');
    return String.fromCodePoint(characterCode);
  });
}
export function parseEbayXml(xml: string): EbayXmlNode {
  if (xml.length > 4_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid XML');
  const root: EbayXmlNode = { name: '', text: '', attributes: {}, children: [] };
  const stack = [root];
  const tokens = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<([^>]+)>|([^<]+)/g;
  let consumed = 0;
  for (const match of xml.matchAll(tokens)) {
    if (match.index !== consumed) throw new Error('Invalid XML');
    consumed = match.index + match[0].length;
    const parent = stack[stack.length - 1];
    if (match[1] !== undefined) parent.text += match[1];
    else if (match[3] !== undefined) parent.text += decodeXmlEntities(match[3]);
    else if (match[2]) {
      const tag = match[2].trim();
      const name = tag.replace(/^\//, '').split(/[\s/]/)[0].split(':').pop();
      if (!name || !/^[A-Za-z_][\w.-]*$/.test(name)) throw new Error('Invalid XML');
      if (tag.startsWith('/')) {
        if (stack.length === 1 || parent.name !== name) throw new Error('Invalid XML');
        stack.pop();
      } else {
        const attributes: Record<string, string> = {};
        for (const attribute of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
          attributes[attribute[1]] = decodeXmlEntities(attribute[2] ?? attribute[3]);
        const node = { name, text: '', attributes, children: [] };
        parent.children.push(node);
        if (!tag.endsWith('/')) stack.push(node);
        if (stack.length > 40) throw new Error('Invalid XML');
      }
    }
  }
  if (consumed !== xml.length || stack.length !== 1 || root.children.length !== 1)
    throw new Error('Invalid XML');
  return root.children[0];
}
export function findXmlChild(node: EbayXmlNode | undefined, name: string): EbayXmlNode | undefined {
  return node?.children.find((child) => child.name === name);
}
export function readXmlText(node: EbayXmlNode | undefined, name: string): string | null {
  return findXmlChild(node, name)?.text.trim() || null;
}

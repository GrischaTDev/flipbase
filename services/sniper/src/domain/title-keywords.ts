/** Titelregeln für zentrale Suchfilter. Die Beschreibung wird hier nie übergeben. */
export type TitleKeywordMode = 'all' | 'any';

export const MAX_TITLE_KEYWORDS = 10;
export const MAX_TITLE_KEYWORD_LENGTH = 80;

const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

/** Bindestriche gelten als Worttrenner, bedeutungstragende Satzzeichen bleiben erhalten. */
function normalizeTitleText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{Dash_Punctuation}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Reihenfolge für die Eingabemaske erhalten, doppelte und leere Eingaben entfernen.
 * Beschädigte Konfigurationen werden zurückgewiesen, niemals zu „keine Einschränkung“.
 */
export function normalizeTitleKeywords(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError('Stichwörter müssen eine Liste sein.');
  const keywords = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new TypeError('Jedes Stichwort muss eine Zeichenfolge sein.');
    }
    const keyword = normalizeTitleText(value);
    if (!keyword) continue;
    if (!LETTER_OR_NUMBER.test(keyword)) {
      throw new Error('Ein Stichwort muss Buchstaben oder Zahlen enthalten.');
    }
    if ([...keyword].length > MAX_TITLE_KEYWORD_LENGTH) {
      throw new RangeError(
        `Ein Stichwort darf höchstens ${MAX_TITLE_KEYWORD_LENGTH} Zeichen enthalten.`,
      );
    }
    keywords.add(keyword);
    if (keywords.size > MAX_TITLE_KEYWORDS) {
      throw new RangeError(
        `Ein Filter darf höchstens ${MAX_TITLE_KEYWORDS} verschiedene Stichwörter enthalten.`,
      );
    }
  }
  return Object.freeze([...keywords]);
}

/**
 * String-Suche statt eines aus Nutzereingaben erzeugten regulären Ausdrucks.
 * Wörter zählen nur an Unicode-Wortgrenzen; Wortgruppen müssen zusammenstehen.
 */
function containsKeyword(title: string, keyword: string): boolean {
  let offset = 0;
  for (;;) {
    const start = title.indexOf(keyword, offset);
    if (start < 0) return false;
    const end = start + keyword.length;
    // Codepoints beachten: Ein UTF-16-Surrogat ist allein keine Wortgrenze.
    const lastUnit = title.charCodeAt(start - 1);
    const beforeLastUnit = title.charCodeAt(start - 2);
    const previousLength =
      lastUnit >= 0xdc00 &&
      lastUnit <= 0xdfff &&
      beforeLastUnit >= 0xd800 &&
      beforeLastUnit <= 0xdbff
        ? 2
        : 1;
    const previous = start === 0 ? '' : title.slice(start - previousLength, start);
    const following = end === title.length ? '' : String.fromCodePoint(title.codePointAt(end)!);
    if (!WORD_CHARACTER.test(previous) && !WORD_CHARACTER.test(following)) return true;
    offset = start + 1;
  }
}

/** Einmal je Abfrage vorbereiten und vor dem Speichern auf jeden Artikeltitel anwenden. */
export function createTitleKeywordMatcher(
  values: readonly string[],
  mode: TitleKeywordMode,
): (title: string) => boolean {
  if (mode !== 'all' && mode !== 'any') {
    throw new Error('Unbekannter Modus für die Titel-Stichwörter.');
  }
  const keywords = normalizeTitleKeywords(values);
  return (title: string): boolean => {
    if (typeof title !== 'string') return false;
    if (keywords.length === 0) return true;
    const normalizedTitle = normalizeTitleText(title);
    return mode === 'all'
      ? keywords.every((keyword) => containsKeyword(normalizedTitle, keyword))
      : keywords.some((keyword) => containsKeyword(normalizedTitle, keyword));
  };
}

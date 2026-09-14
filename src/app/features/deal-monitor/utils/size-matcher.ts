/**
 * Gleicht Größenangaben aus Vinted-Angeboten (z. B. 'XXL / 54', '2XL', 'L / 40')
 * robust mit einem gewählten Standard-Größenfilter ab.
 */
export function matchesSize(
  itemSize: string | null | undefined,
  filterSize: string | null | undefined,
): boolean {
  if (!filterSize) return true;
  if (!itemSize) return false;

  const raw = itemSize.toLowerCase().trim();
  const filter = filterSize.toLowerCase().trim();

  if (raw === filter) return true;

  // Trennung an Leerzeichen, Schrägstrichen, Bindestrichen, Klammern etc.
  const tokens = raw.split(/[\s/\\(),-]+/).filter(Boolean);

  if (filter === 'xs') {
    return tokens.includes('xs') || tokens.includes('34');
  }
  if (filter === 's') {
    return (tokens.includes('s') || tokens.includes('36')) && !tokens.includes('xs');
  }
  if (filter === 'm') {
    return tokens.includes('m') || tokens.includes('38');
  }
  if (filter === 'l') {
    const hasL = tokens.some((t) => t === 'l' || t === '40' || t === '42');
    const hasXl = tokens.some((t) => t === 'xl' || t === 'xxl' || t === '2xl');
    return hasL && !hasXl;
  }
  if (filter === 'xl') {
    const hasXl = tokens.some((t) => t === 'xl' || t === '44' || t === '46');
    const hasXxl = tokens.some((t) => t === 'xxl' || t === '2xl' || t === '3xl');
    return hasXl && !hasXxl;
  }
  if (filter === 'xxl') {
    return tokens.some(
      (t) => t === 'xxl' || t === '2xl' || t === '48' || t === '50' || t === '52' || t === '54',
    );
  }
  if (filter === '3xl') {
    return tokens.some((t) => t === '3xl' || t === 'xxxl' || t === '4xl' || t === '5xl');
  }

  return tokens.includes(filter);
}

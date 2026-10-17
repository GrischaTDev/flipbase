/** Regeln gelten nur für neue Auswahl; Originaldaten und gespeicherte Kennungen bleiben erhalten. */
export interface CategorySelectionRules {
  readonly excluded: readonly string[];
  readonly included: readonly string[];
}
/** Die spezifischste Regel gewinnt, damit Bekleidung unter ausgeschlossenen Bereichen bleibt. */
export function categorySelectionAllowed(
  path: readonly string[],
  rules: CategorySelectionRules,
): boolean {
  for (const id of [...path].reverse()) {
    if (rules.included.includes(id)) return true;
    if (rules.excluded.includes(id)) return false;
  }
  return true;
}
/** Gesperrte Eltern bleiben ausschließlich als Weg zu erlaubten Unterkategorien sichtbar. */
export function categoryNavigationIds(
  paths: readonly (readonly string[])[],
  rules: CategorySelectionRules,
): ReadonlySet<string> {
  const visible = new Set<string>();
  for (const path of paths)
    if (categorySelectionAllowed(path, rules)) for (const id of path) visible.add(id);
  return visible;
}

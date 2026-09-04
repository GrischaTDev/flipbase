# Final-Fix-Report

## Befund

Ein Git-Rename von einem technischen Template nach `docs/` konnte bei der
Erkennung nur als Dokumentationsziel erscheinen. Dadurch wurde die
Anwendungsprüfung fälschlich übersprungen.

## TDD-Nachweis

- **RED:** Der echte Git-Test „Technischer Pfad bleibt bei einem Rename nach
  docs anwendungsrelevant“ schlug mit `application=false` statt
  `application=true` fehl.
- **GREEN:** Der Diff-Aufruf nutzt nun `--no-renames`; derselbe Test und alle
  übrigen Tests der Datei bestehen mit 13/13.

## Verifikation

- `node --test scripts/detect-supabase-changes.test.mjs` — 13 bestanden
- Prettier für beide betroffenen Dateien — erfolgreich
- ESLint für beide betroffenen Dateien — erfolgreich

## Commit

`fix(ci): preserve source paths in rename detection` (finaler Commit auf diesem
Zweig)

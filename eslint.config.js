// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  {
    // Erzeugte und fremde Verzeichnisse pruefen wir nicht.
    ignores: [
      'dist/**',
      'coverage/**',
      '.angular/**',
      'node_modules/**',
      'supabase/**',
      // Erzeugt durch `supabase gen types` - Aenderungen hier waeren beim
      // naechsten Erzeugen wieder weg.
      'src/app/core/models/supabase.types.ts',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // Leere catch-Bloecke sind im Projekt bewusst gesetzt und jeweils
      // kommentiert (z. B. blockierter Speicherzugriff). Sonstige leere
      // Bloecke bleiben ein Fehler.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `any` ist ein echter Mangel, aber 51 Stellen gehoeren zur Umstellung
      // auf den Strict Mode (Plan 8.11). Bis dahin sichtbar, aber nicht
      // blockierend.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Projektkonvention: Selektoren mit Praefix "app", Komponenten in
      // Bindestrichschreibweise, Direktiven in Binnenmajuskel.
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      // Nicht genutzte Variablen sind ein Fehler - fuehrende Unterstriche
      // gelten als bewusst ungenutzt.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
);

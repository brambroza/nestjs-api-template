// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            'process.env access is only allowed in src/shared/config. Read config via ConfigService.',
        },
      ],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['src/shared/config/**/*.ts', 'src/main.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts'],
    ignores: ['src/modules/*/domain/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'new Date() is forbidden inside domain. Take a Date parameter (Clock port lives in application).',
        },
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'Date.now() is forbidden inside domain. Take a Date parameter (Clock port lives in application).',
        },
      ],
    },
  },
);

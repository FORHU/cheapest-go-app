import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';

export default tseslint.config(
    { ignores: ['.next/**', 'node_modules/**'] },
    ...tseslint.configs.recommended,
    {
        plugins: {
            'react-hooks': reactHooks,
            '@next/next': nextPlugin,
        },
        rules: {
            // typescript-eslint — too noisy for a JS-heavy codebase
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            // react-hooks — keep exhaustive-deps as warning only
            'react-hooks/rules-of-hooks': 'warn',
            'react-hooks/exhaustive-deps': 'warn',
            // next.js
            '@next/next/no-img-element': 'warn',
        },
    },
    {
        // English written straight into JSX never reaches a locale file, so it is
        // invisible to any coverage count — which is why the sections scoring best
        // on key coverage were the ones showing English on a Korean storefront.
        //
        // Storefront only: the back office is deliberately English (see CONTEXT.md,
        // Interface Language), so linting it would be noise with no reader.
        //
        // A warning rather than an error, on purpose. There are already ~71 of these;
        // failing the build would block every PR until they are all fixed. The point
        // is that a new one is visible the moment it is written.
        files: ['src/components/**/*.tsx', 'src/app/(main)/**/*.tsx'],
        ignores: ['src/components/admin/**', 'src/app/**/admin/**', '**/*.test.tsx'],
        plugins: { react: reactPlugin },
        rules: {
            'react/jsx-no-literals': ['warn', {
                noStrings: true,
                ignoreProps: true,
                // Punctuation and separators carry no meaning to translate.
                allowedStrings: [
                    '·', '•', '—', '–', '-', '/', '|', ':', ',', '.', '×', '+', '~',
                    '(', ')', '[', ']', '&', '@', '#', '%', '*', '→', '←', '↑', '↓',
                ],
            }],
        },
    },
);

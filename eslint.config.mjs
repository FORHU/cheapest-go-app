import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

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
);

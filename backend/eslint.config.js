import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'src/db/migrations', 'src/db/seeders', 'src/db/config'] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.ts'],
        languageOptions: { ecmaVersion: 2022, globals: globals.node },
        rules: {
            // Request generics use `{}` for "no params/body" throughout the controllers.
            '@typescript-eslint/no-empty-object-type': 'off',
            // Express/Sequelize typings frequently need `any`; keep it visible but non-blocking.
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },
    {
        files: ['scripts/**/*.ts', 'tests/**/*.ts'],
        rules: { 'no-console': 'off' },
    },
);

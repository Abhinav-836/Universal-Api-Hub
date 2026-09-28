// BUG FIX: the frontend had a `lint` script (eslint src/) and CI runs it,
// but no ESLint config existed, so ESLint 8 aborted with
// "couldn't find a configuration file". Named .cjs because package.json
// sets "type": "module".
module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  rules: {
    'react/prop-types': 'off',
    'react/no-unescaped-entities': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_|^React$' }],
  },
  ignorePatterns: ['dist/', 'node_modules/'],
};

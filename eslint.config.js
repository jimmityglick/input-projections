const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.cache/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
    ],
  },

  // Plain JS (repo scripts/tools) - CommonJS
  {
    files: ["**/*.{js,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    ...js.configs.recommended,
    rules: {
      "no-console": "off",
    },
  },

  // Plain JS (repo scripts/tools) - ESM
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    ...js.configs.recommended,
    rules: {
      "no-console": "off",
    },
  },

  // TypeScript (engine/library code) - type-aware
  ...tseslint.config({
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "no-console": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
    },
  }),

  // TypeScript (renderer) - syntax-only linting (handled by Vite for typechecking/build)
  ...tseslint.config({
    files: ["renderer/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
    ],
    rules: {
      "no-console": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
    },
  }),
];

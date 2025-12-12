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

  // Plain JS (repo scripts/tools)
  {
    files: ["**/*.{js,cjs,mjs}"],
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

  // TypeScript (future repo code)
  ...tseslint.config({
    files: ["**/*.{ts,tsx}"],
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
    },
  }),
];


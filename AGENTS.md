# Repository Guidelines

## Project Structure

- `schema.json`: Canonical JSON Schema (draft 2020-12) for Input Projection definitions.
- `examples/`: Example projection files (`*.json`) that should validate against `schema.json`.
- `tools/`: Developer utilities (example validation, ad-hoc test runners).
- `docs/`: Specification documents (`docs/SPEC.md`, `docs/full_specification.md`).

## Build, Test, and Development Commands

- `npm install`: Installs local JS dependencies (Ajv + formats) used by some tooling.
- `./tools/run_examples.sh`: Validates all `examples/*.json` against `schema.json` (uses `npx ajv-cli`).
- `./tools/run_examples.sh examples/simple-email.json`: Validates one file (useful while iterating).
- `node tools/test_suite.js`: Runs the ad-hoc test suite (currently driven by `tests.json` / `schema2.json`).

Notes:
- `tools/run_examples.sh` configures a repo-local npm cache at `.cache/npm` so it works even if `~/.npm` is not writable.

## Coding Style & Naming Conventions

- JSON: 2-space indentation, stable key ordering where practical, and no trailing commas.
- Schema design: prefer `$defs` reuse and keep `additionalProperties`/`unevaluatedProperties` behavior explicit to avoid accidental over/under-permissiveness.
- Examples: keep filenames descriptive and kebab-cased (e.g., `examples/purchase-order.json`).

## Testing Guidelines

- Treat schema validation as the primary “test”: any new/changed example must pass `./tools/run_examples.sh`.
- If you add negative test cases in `tests.json`, prefix the key with `invalid_` (the test runner treats those as expected failures).

## Commit & Pull Request Guidelines

- Commits follow Conventional Commits style seen in history, e.g. `feat(schema): ...`, `fix(schema): ...`, `docs: ...`, `chore(schema): ...`.
- PRs should include:
  - A short description of the schema change and motivation.
  - Updated/added examples in `examples/` demonstrating the change.
  - The output of `./tools/run_examples.sh` (or note why it’s not applicable).

## Security & Configuration Tips

- Do not commit generated artifacts like `.cache/` (local npm cache/logs). If you need a clean state, delete `.cache/`.
- Avoid committing `node_modules/`; prefer `npm install` and commit `package.json`/`package-lock.json` changes when dependency updates are intentional.

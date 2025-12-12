# Repository Guidelines

## Project Structure

- `schemas/`: JSON Schema files (draft 2020-12) for Input Projection definitions.
  - `schemas/projection.latest.schema.json`: Default schema pointer used by tooling.
  - `schemas/projection.v2.schema.json`: Current schema version used by the test runner by default.
  - `schemas/projection.v1.schema.json`: Legacy schema version retained for reference.
- `tests/fixtures/`: Fixture projection files (`*.json`) that should validate against `schemas/projection.latest.schema.json`.
- `tests/cases/`: JSON test suites (`*.json`) mapping `testName -> projection`.
- `tools/`: Developer utilities (example validation, ad-hoc test runners).
- `docs/`: Specification documents (`docs/SPEC.md`, `docs/full_specification.md`).

## Build, Test, and Development Commands

- `npm install`: Installs local JS dependencies (Ajv + formats) used by some tooling.
- `npm test`: Runs the full test suite (fixtures + case suites).
- `node tools/test_suite.js`: Runs the test suite directly (supports `--schema`, `--casesDir`, `--fixturesDir`).

## Coding Style & Naming Conventions

- JSON: 2-space indentation, stable key ordering where practical, and no trailing commas.
- Schema design: prefer `$defs` reuse and keep `additionalProperties`/`unevaluatedProperties` behavior explicit to avoid accidental over/under-permissiveness.
- Fixtures: keep filenames descriptive and kebab-cased (e.g., `tests/fixtures/purchase-order.json`).

## Testing Guidelines

- Treat schema validation as the primary “test”: any new/changed fixture or case must pass `npm test`.
- Case suites: prefix failing cases with `invalid_` (expected failures).
- Fixture files: prefix the filename with `invalid_` for expected failures (rare; prefer case suites).

## Commit & Pull Request Guidelines

- Commits follow Conventional Commits style seen in history, e.g. `feat(schema): ...`, `fix(schema): ...`, `docs: ...`, `chore(schema): ...`.
- PRs should include:
  - A short description of the schema change and motivation.
  - Updated/added tests in `tests/` demonstrating the change.
  - The output of `npm test` (or note why it’s not applicable).

## Security & Configuration Tips

- Do not commit generated artifacts like `.cache/` (local npm cache/logs). If you need a clean state, delete `.cache/`.
- Avoid committing `node_modules/`; prefer `npm install` and commit `package.json`/`package-lock.json` changes when dependency updates are intentional.

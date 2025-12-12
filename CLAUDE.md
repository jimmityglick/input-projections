# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository defines and validates **Input Projections**—declarative specifications for constrained data input. The core specification is in `docs/SPEC.md`.

## Commands

```bash
npm install          # Install dependencies (ajv, ajv-formats)
npm test             # Run full test suite (fixtures + case suites)
npm run lint         # Run ESLint
npm run lint:fix     # Run ESLint with auto-fix
npm run typecheck    # Run TypeScript type checking
```

### Test Runner Options

```bash
node tools/test_suite.js                          # Run all tests
node tools/test_suite.js tests/cases/core.json    # Run single case file
node tools/test_suite.js --schema <path>          # Use custom schema
node tools/test_suite.js --fixtureFile <path>     # Run single fixture
```

## Architecture

### Schema Versioning

- `schemas/projection.latest.schema.json` - Pointer to current schema (currently v2)
- `schemas/projection.v2.schema.json` - Current production schema
- `schemas/projection.v1.schema.json` - Legacy reference

### Test Structure

- `tests/fixtures/` - Complete projection files (e.g., `purchase-order.json`)
- `tests/cases/` - JSON objects mapping `testName -> projection`
  - Prefix test names with `invalid_` for expected validation failures

### Node Types (Five Primitives)

Every Input Projection is composed of exactly these node kinds:

1. **Scalar** - Atomic values (string, number, boolean, null) with constraints
2. **Struct** - Fixed collection of named fields (product type)
3. **Union** - Discriminated choice between variants (sum type)
4. **List** - Bounded sequence (`maxItems` required)
5. **Reference** - Opaque pointer to external entity (format-validated only)

## Conventions

- JSON: 2-space indent, no trailing commas
- Filenames: kebab-case for fixtures (e.g., `purchase-order.json`)
- Commits: Conventional Commits (`feat(schema):`, `fix(schema):`, `docs:`, `chore:`)
- Schema design: use `$defs` reuse, keep `additionalProperties` explicit

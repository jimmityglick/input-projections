const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function normalizeExpectedValue(value) {
  if (value === "__undefined__") return undefined;
  return value;
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => path.join(dirPath, e.name))
    .sort();
}

// Built output from `npm run build`.
// eslint-disable-next-line import/no-dynamic-require, global-require
const { createEngine } = require("../dist/index.js");

const repoRoot = path.resolve(__dirname, "..");
const fixturesDir = path.join(repoRoot, "tests", "fixtures");
const engineDir = path.join(repoRoot, "tests", "engine");

test("engine parses all valid fixtures", () => {
  for (const filePath of listJsonFiles(fixturesDir)) {
    const base = path.basename(filePath, ".json");
    if (base.startsWith("invalid_")) continue;
    const projection = readJson(filePath);
    assert.doesNotThrow(() => createEngine(projection), `fixture ${base} should parse`);
  }
});

test("engine scenarios", async (t) => {
  for (const filePath of listJsonFiles(engineDir)) {
    const suite = readJson(filePath);
    const suiteName = path.basename(filePath);
    if (!suite || typeof suite !== "object" || Array.isArray(suite)) {
      assert.fail(`${suiteName} must be an object`);
    }

    const scenarios = Array.isArray(suite.scenarios) ? suite.scenarios : [];
    for (const scenario of scenarios) {
      // eslint-disable-next-line no-await-in-loop
      await t.test(`${suiteName}::${scenario.name}`, () => {
        const engine = createEngine(scenario.projection);
        if (scenario.initialValue !== undefined) engine.reset(scenario.initialValue);
        const expects = Array.isArray(scenario.expect) ? scenario.expect : [];
        const steps = Array.isArray(scenario.steps) ? scenario.steps : [];

        for (let i = 0; i < steps.length; i += 1) {
          const state = engine.dispatch(steps[i]);
          const exp = expects[i];
          if (exp && exp.judgment) assert.equal(state.sigma.root, exp.judgment);
          if (exp && "value" in exp) {
            assert.deepEqual(state.value, normalizeExpectedValue(exp.value));
          }
          if (exp && exp.cursor) {
            if (exp.cursor.valuePath) {
              assert.deepEqual(state.cursor.valuePath, exp.cursor.valuePath);
            }
            if (exp.cursor.projectionPath) {
              assert.deepEqual(state.cursor.projectionPath, exp.cursor.projectionPath);
            }
          }
        }
      });
    }
  }
});

test("relation issues include related field paths", () => {
  const projection = readJson(path.join(fixturesDir, "password-confirmation.json"));
  const engine = createEngine(projection);

  engine.dispatch({ type: "SetScalar", at: ["password"], value: "abc12345" });
  const state = engine.dispatch({ type: "SetScalar", at: ["confirm_password"], value: "zzz99999" });

  const relationIssues = state.sigma.issues.filter((i) => i.code === "relation_failed");
  assert.equal(relationIssues.length, 1);
  const issue = relationIssues[0];

  assert.deepEqual(issue.relatedProjectionPaths, [
    [{ type: "Field", name: "password" }],
    [{ type: "Field", name: "confirm_password" }],
  ]);
  assert.deepEqual(issue.relatedValuePaths, [["password"], ["confirm_password"]]);
});

test("relation related paths are absolute (root-relative)", () => {
  const projection = {
    version: "1.0.0",
    root: {
      kind: "Struct",
      fields: {
        account: {
          kind: "Struct",
          fields: {
            password: { kind: "Scalar", required: true, scalar: { type: "string" } },
            confirm_password: { kind: "Scalar", required: true, scalar: { type: "string" } },
          },
          required: ["password", "confirm_password"],
          relations: [{ op: "eq", left: "password", right: "confirm_password", label: "Passwords must match" }],
        },
      },
      required: ["account"],
    },
  };

  const engine = createEngine(projection);
  engine.dispatch({ type: "SetScalar", at: ["account", "password"], value: "abc12345" });
  const state = engine.dispatch({ type: "SetScalar", at: ["account", "confirm_password"], value: "zzz99999" });

  // Note: sigma.issues can include the same Issue object multiple times due to parent aggregation.
  const relationIssues = state.sigma.issues.filter((i) => i.code === "relation_failed");
  const uniqueRelationIssues = [...new Set(relationIssues)];
  assert.equal(uniqueRelationIssues.length, 1);
  const issue = uniqueRelationIssues[0];

  // Issue is reported at the Struct that declared the relation (the nested struct).
  assert.deepEqual(issue.projectionPath, [{ type: "Field", name: "account" }]);
  assert.deepEqual(issue.valuePath, ["account"]);

  // Related paths are absolute/root-relative, not just ["password"].
  assert.deepEqual(issue.relatedProjectionPaths, [
    [{ type: "Field", name: "account" }, { type: "Field", name: "password" }],
    [{ type: "Field", name: "account" }, { type: "Field", name: "confirm_password" }],
  ]);
  assert.deepEqual(issue.relatedValuePaths, [["account", "password"], ["account", "confirm_password"]]);
});

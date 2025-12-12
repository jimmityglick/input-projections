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
        }
      });
    }
  }
});

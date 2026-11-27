// Use the same projection and judgment implementation as the browser.
const fs = require("node:fs");
const { isDeepStrictEqual } = require("node:util");
const { createEngine, parseProjection } = require("../dist/index.js");
const projection = require(`../tests/fixtures/${process.argv[2]}.json`);
const parsed = parseProjection(projection);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
const values = JSON.parse(fs.readFileSync(0, "utf8"));
const { value, sigma } = createEngine(parsed.value).reset(values);
if (sigma.root !== "Valid") {
  const issue = sigma.issues[0];
  process.stdout.write(JSON.stringify(`${issue.valuePath.join(".")}: ${issue.message}`));
} else if (!isDeepStrictEqual(values, value)) {
  process.stdout.write(JSON.stringify("Value contains unknown, inactive, or noncanonical fields"));
} else {
  process.stdout.write("null");
}

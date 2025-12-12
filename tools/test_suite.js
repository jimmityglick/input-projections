const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function formatErrors(errors) {
  if (!errors || errors.length === 0) return "";
  return errors
    .map((e) => `${e.instancePath || "/"} ${e.message}`)
    .join("; ");
}

function parseArgs(argv) {
  const args = {
    schema: null,
    testsDir: null,
    casesDir: null,
    fixturesDir: null,
    caseFiles: [],
    fixtureFiles: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    if (arg === "--schema") {
      args.schema = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--testsDir") {
      args.testsDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--casesDir") {
      args.casesDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--fixturesDir") {
      args.fixturesDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--caseFile") {
      args.caseFiles.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--fixtureFile") {
      args.fixtureFiles.push(argv[i + 1]);
      i += 1;
      continue;
    }

    // Positional args: treat as case files (JSON maps of testName -> projection)
    args.caseFiles.push(arg);
  }

  return args;
}

function printUsage() {
  const cmd = "node tools/test_suite.js";
  // Keep this minimal on purpose.
  console.log(`Usage:
  ${cmd}                       # run all tests in tests/
  ${cmd} tests/cases/core.json # run one case file

Options:
  --schema <path>        (default: schema2.json if present, else schema.json)
  --testsDir <dir>       (default: tests)
  --casesDir <dir>       (default: tests/cases)
  --fixturesDir <dir>    (default: tests/fixtures)
  --caseFile <path>      (repeatable)
  --fixtureFile <path>   (repeatable)
`);
}

const repoRoot = path.resolve(__dirname, "..");
const schema2Path = path.join(repoRoot, "schema2.json");
const schemaJsonPath = path.join(repoRoot, "schema.json");

const defaults = {
  schema: fs.existsSync(schema2Path) ? schema2Path : schemaJsonPath,
  testsDir: path.join(repoRoot, "tests"),
  casesDir: path.join(repoRoot, "tests", "cases"),
  fixturesDir: path.join(repoRoot, "tests", "fixtures"),
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}

const schemaPath = path.resolve(repoRoot, args.schema || defaults.schema);
const testsDir = path.resolve(repoRoot, args.testsDir || defaults.testsDir);
const casesDir = path.resolve(repoRoot, args.casesDir || defaults.casesDir);
const fixturesDir = path.resolve(
  repoRoot,
  args.fixturesDir || defaults.fixturesDir,
);

if (!fs.existsSync(schemaPath)) {
  console.error(`error: schema not found: ${schemaPath}`);
  process.exit(1);
}

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const schema = readJson(schemaPath);
const validate = ajv.compile(schema);

const caseFiles =
  args.caseFiles.length > 0
    ? args.caseFiles.map((p) => path.resolve(repoRoot, p))
    : listJsonFiles(casesDir);

const fixtureFiles =
  args.fixtureFiles.length > 0
    ? args.fixtureFiles.map((p) => path.resolve(repoRoot, p))
    : listJsonFiles(fixturesDir);

if (!fs.existsSync(testsDir)) {
  console.error(`error: tests directory not found: ${testsDir}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;

function runOne(name, projection, shouldBeValid) {
  const isValid = validate(projection);
  if ((shouldBeValid && isValid) || (!shouldBeValid && !isValid)) {
    passed += 1;
    return;
  }

  failed += 1;
  console.error(`FAIL: ${name}`);
  console.error(`  expected: ${shouldBeValid ? "valid" : "invalid"}`);
  console.error(`  actual:   ${isValid ? "valid" : "invalid"}`);
  if (!isValid) {
    console.error(`  errors:   ${formatErrors(validate.errors)}`);
  }
}

for (const filePath of caseFiles) {
  const suite = readJson(filePath);
  if (!suite || typeof suite !== "object" || Array.isArray(suite)) {
    failed += 1;
    console.error(`FAIL: ${filePath} (expected an object of test cases)`);
    continue;
  }

  for (const [testName, projection] of Object.entries(suite)) {
    const shouldBeValid = !testName.startsWith("invalid_");
    runOne(`${path.basename(filePath)}::${testName}`, projection, shouldBeValid);
  }
}

for (const filePath of fixtureFiles) {
  const projection = readJson(filePath);
  const baseName = path.basename(filePath, ".json");
  const shouldBeValid = !baseName.startsWith("invalid_");
  runOne(`fixture::${baseName}`, projection, shouldBeValid);
}

console.log(`Summary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

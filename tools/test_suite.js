const fs = require('fs');
// const Ajv = require('ajv');
const Ajv = require('ajv/dist/2020')
const addFormats = require('ajv-formats');

// 1. Setup the Validator
const ajv = new Ajv({ 
    allErrors: true, 
    strict: false // strict mode off to allow our custom "invalid_" prefix logic 
});
addFormats(ajv); // Adds URI format support if needed

// 2. Load the Schema and the Test File
const schema = JSON.parse(fs.readFileSync('schema2.json', 'utf8'));
const tests = JSON.parse(fs.readFileSync('tests.json', 'utf8'));
const testsFail = JSON.parse(fs.readFileSync('tests_stress_fail.json', 'utf8'));

// 3. Compile the Validator
const validate = ajv.compile(schema);

console.log(`\n🔍 Running ${Object.keys(tests).length} tests from tests.json...\n`);

let passed = 0;
let failed = 0;

// 4. Iterate through every case
for (const [testName, projection] of Object.entries(tests)) {
    const shouldBeValid = !testName.startsWith('invalid_');
    const isValid = validate(projection);

    if (shouldBeValid && isValid) {
        console.log(`✅ ${testName}: PASS`);
        passed++;
    } else if (!shouldBeValid && !isValid) {
        console.log(`✅ ${testName}: PASS (Correctly rejected)`);
        passed++;
    } else {
        console.log(`❌ ${testName}: FAIL`);
        console.log(`   Expected: ${shouldBeValid ? 'Valid' : 'Invalid'}`);
        console.log(`   Actual:   ${isValid ? 'Valid' : 'Invalid'}`);
        if (!isValid) {
            console.log('   Schema Errors:', validate.errors.map(e => `${e.instancePath} ${e.message}`).join(', '));
        }
        failed++;
    }
}

console.log(`\n---------------------------------------------------`);
console.log(`Summary: ${passed} Passed, ${failed} Failed`);
if (failed > 0) process.exit(1);

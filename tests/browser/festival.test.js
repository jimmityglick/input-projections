// Run with npm run test:festival. All writes use a disposable SQLite database.
const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const os = require("node:os");
const { setTimeout: delay } = require("node:timers/promises");

let directory, app, driver, origin, driverURL, session;
async function freePort() {
  const socket = net.createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise(resolve => socket.close(resolve));
  return port;
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch (error) {
      if (error.cause?.code !== "ECONNREFUSED") throw error;
    }
    await delay(50);
  }
  throw new Error(`Service did not start: ${url}`);
}
async function command(endpoint, data, method = "POST") {
  const response = await fetch(driverURL + endpoint, {
    method, headers: {"Content-Type": "application/json"}, body: JSON.stringify(data),
  });
  const {value} = await response.json();
  assert.ok(response.ok, value?.message);
  return value;
}
const run = (script, ...args) => command(session + "/execute/sync", {script, args});
async function openForm() {
  await command(session + "/url", {url: origin + "/input-projections/festival.html"});
  for (let i = 0; i < 100; i++) {
    if (await run("return !!document.querySelector('#app input')")) return;
    await delay(50);
  }
  throw new Error("Festival form did not load");
}
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "festival-browser-"));
  const binary = path.join(directory, "service");
  execFileSync("go", ["build", "-o", binary, "./backend"]);
  const appPort = await freePort();
  origin = `http://127.0.0.1:${appPort}`;
  app = spawn(binary, ["-listen", `127.0.0.1:${appPort}`, "-db", path.join(directory, "test.db")]);
  await ready(origin + "/api/festival");
  const driverPort = await freePort();
  driverURL = `http://127.0.0.1:${driverPort}`;
  driver = spawn("chromedriver", [`--port=${driverPort}`]);
  await ready(driverURL + "/status");
  const result = await command("/session", {capabilities: {alwaysMatch: {
    "goog:chromeOptions": {args: ["--headless", "--no-sandbox", "--disable-gpu"]},
  }}});
  session = "/session/" + result.sessionId;
});
after(async () => {
  try {
    if (session) await command(session, undefined, "DELETE");
  } finally {
    for (const child of [driver, app]) {
      if (child && child.exitCode === null && child.signalCode === null) {
        const closed = once(child, "exit");
        child.kill();
        await closed;
      }
    }
    if (directory) await fs.rm(directory, {recursive: true, force: true});
  }
});

test("restoring saved content stays clean even if a property was removed and reinserted", async () => {
  await openForm();
  const url = origin + "/api/festival";
  const initial = await fetch(url);
  const status = await run(`
    const input = document.querySelector('input[data-value-path="/name"]');
    const name = input.value;
    input.closest('.node').querySelector('button.clear').click();
    input.value = name;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    const auto = document.querySelector('[role=switch]');
    auto.click();
    return [document.querySelector('#festival-save button').disabled, document.querySelector('[role=status]').textContent];
  `);
  assert.deepEqual(status, [true, "Loaded saved program"]);
  await delay(1200);
  const latest = await fetch(url);
  assert.equal(latest.headers.get("ETag"), initial.headers.get("ETag"));
  assert.deepEqual(await latest.json(), await initial.json());
  await run("document.querySelector('[role=switch]').click()");
});

test("format selectors show exactly the two possible kinds, and branch changes clear obsolete fields", async () => {
  await openForm();
  const result = await run(`
    const selects = Array.from(document.querySelectorAll('#app select'));
    const options = selects.map(select => Array.from(select.options, option => option.value));
    const first = selects[0];
    const previous = first.value;
    first.value = previous === "talk" ? "workshop" : "talk";
    first.dispatchEvent(new Event("change", {bubbles:true}));
    return {options, changed: first.value !== previous, saveDisabled: document.querySelector('#festival-save button').disabled};
  `);
  assert.equal(result.options.length, 8);
  for (const options of result.options) assert.deepEqual(options, ["talk", "workshop"]);
  assert.equal(result.changed, true);
  assert.equal(result.saveDisabled, true);
});

test("Add opens the new entity and focuses its ID", async () => {
  await openForm();
  for (const path of ["/tracks", "/speakers", "/venues/0/rooms/0/stages/0/sessions"]) {
    const result = await run(`
      const path = arguments[0];
      const list = document.querySelector('.node[data-value-path="' + path + '"]');
      const index = list.querySelectorAll(':scope > div > .list-item').length;
      list.querySelector('button[data-value-path="' + path + '"]').click();
      const id = document.querySelector('input[data-value-path="' + path + '/' + index + '/id"]');
      const bounds = id.getBoundingClientRect();
      return [id === document.activeElement, bounds.height > 0,
        bounds.top >= document.querySelector('#festival-save').getBoundingClientRect().bottom && bounds.bottom <= innerHeight];
    `, path);
    assert.deepEqual(result, [true, true, true], path);
  }
});

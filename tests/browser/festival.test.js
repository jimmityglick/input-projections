// Run with npm run test:festival. All writes use a disposable SQLite database.
const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const net = require("node:net");
const { isDeepStrictEqual } = require("node:util");
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

test("save responses preserve the latest draft and write exactly the intended revisions", async t => {
  const endpoint = origin + "/api/festival";
  for (const auto of [false, true]) {
    for (const accepted of [false, true]) {
      for (const outcome of ["original", "submitted", "another valid edit", "incomplete"]) {
        await t.test(`${auto ? "automatic" : "manual"}, ${accepted ? "accepted" : "rejected"}, then ${outcome}`, async () => {
          await openForm();
          const initial = await fetch(endpoint);
          const base = await initial.json();
          const submitted = {...base, name: base.name === "First edit" ? "New first edit" : "First edit"};
          if (!accepted) submitted.budget = 1;
          const latest = {
            original: base,
            submitted,
            "another valid edit": {...base, name: base.name === "Second edit" ? "New second edit" : "Second edit"},
            incomplete: {...base, name: ""},
          }[outcome];

          // Real HTTP and database; delay delivery of the first response to the UI.
          await run(`
            const [auto, submitted] = arguments;
            const toggle = document.querySelector('[role=switch]');
            if (toggle.checked !== auto) toggle.click();
            window.edit = draft => {
              for (const key of ['name', 'budget']) {
                const input = document.querySelector('input[data-value-path="/' + key + '"]');
                input.value = String(draft[key]);
                input.dispatchEvent(new Event('input', {bubbles: true}));
              }
            };
            const send = window.fetch;
            window.puts = [];
            window.fetch = async (...args) => {
              const response = await send(...args);
              if (args[1]?.method === "PUT") {
                window.puts.push(response.status);
                if (window.puts.length === 1) await new Promise(resolve => {window.release = resolve});
              }
              return response;
            };
            window.edit(submitted);
            document.querySelector('#festival-save button').click();
          `, auto, submitted);
          for (let i = 0; i < 100 && !await run("return !!window.release"); i++) await delay(50);
          await run("window.edit(arguments[0]); window.release()", latest);
          const firstSaved = accepted ? submitted : base;
          const shouldFollowUp = auto && outcome !== "submitted" && outcome !== "incomplete"
            && !isDeepStrictEqual(latest, firstSaved);
          const expected = shouldFollowUp ? latest : firstSaved;
          const statuses = [accepted ? 204 : 422];
          if (shouldFollowUp) statuses.push(204);
          await delay(1000);
          for (let i = 0; i < 100 && await run("return window.puts.length") < statuses.length; i++) await delay(50);
          assert.deepEqual(await run("return window.puts"), statuses);
          const state = await fetch(endpoint);
          assert.equal(Number(JSON.parse(state.headers.get("ETag"))),
            Number(JSON.parse(initial.headers.get("ETag"))) + Number(accepted) + Number(shouldFollowUp));
          assert.deepEqual(await state.json(), expected);
          assert.deepEqual(await run(`
            return [document.querySelector('input[data-value-path="/name"]').value,
              Number(document.querySelector('input[data-value-path="/budget"]').value),
              document.querySelector('#festival-save button').disabled];
          `), [latest.name, latest.budget,
            outcome === "incomplete" || isDeepStrictEqual(latest, expected)]);
        });
      }
    }
  }
});

test("linked edits yield the same saved program in every order", async () => {
  const endpoint = origin + "/api/festival";
  const baseline = await (await fetch(endpoint)).json();
  const expected = structuredClone(baseline);
  const speaker = expected.speakers[0];
  const oldID = speaker.id;
  speaker.id = "renamed-speaker";
  const assignments = [];
  for (const [v, venue] of expected.venues.entries()) {
    for (const [r, room] of venue.rooms.entries()) {
      for (const [s, stage] of room.stages.entries()) {
        for (const [i, slot] of stage.sessions.entries()) {
          for (const [j, id] of slot.speakers.entries()) {
            if (id !== oldID) continue;
            slot.speakers[j] = speaker.id;
            assignments.push([`/venues/${v}/rooms/${r}/stages/${s}/sessions/${i}/speakers/${j}`, speaker.id]);
          }
        }
      }
    }
  }
  const first = expected.venues[0].rooms[0].stages[0].sessions[0];
  first.seats = 44;
  first.format = {kind: "workshop", data: {reserved: 46, available: 48}};
  const path = "/venues/0/rooms/0/stages/0/sessions/0";
  const edits = {
    catalog: [["/speakers/0/id", speaker.id]],
    assignments,
    format: [[path + "/format/kind", "workshop"], [path + "/format/data/available", 48], [path + "/format/data/reserved", 46]],
    seats: [[path + "/seats", 44]],
  };
  function* orders(remaining) {
    if (!remaining.length) yield [];
    for (const key of remaining) {
      for (const rest of orders(remaining.filter(k => k !== key))) yield [key, ...rest];
    }
  }
  for (const order of orders(Object.keys(edits))) {
    await openForm();
    await run(`
      const auto = document.querySelector('[role=switch]');
      if (auto.checked) auto.click();
      for (const [path, value] of arguments[0]) {
        const control = document.querySelector('#app :is(input, select)[data-value-path="' + path + '"]');
        control.value = String(value);
        control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
      }
      document.querySelector('#festival-save button').click();
    `, order.flatMap(key => edits[key]));
    for (let i = 0; i < 100 && await run("return document.querySelector('[role=status]').textContent === 'Saving…'"); i++) await delay(50);
    const stored = await fetch(endpoint);
    assert.deepEqual(await stored.json(), expected, order.join(" → "));
    const reset = await fetch(endpoint, {
      method: "PUT", headers: {"Content-Type": "application/json", "If-Match": stored.headers.get("ETag")},
      body: JSON.stringify(baseline),
    });
    assert.equal(reset.status, 204);
  }
});

test("a connection error reads back the saved version and retains the draft", async t => {
  for (const outcome of ["committed", "never received", "offline", "superseded"]) {
    await t.test(outcome, async () => {
      await openForm();
      const endpoint = origin + "/api/festival";
      const baseline = await (await fetch(endpoint)).json();
      const name = baseline.name + " edit";
      await run(`
        const [outcome, name] = arguments;
        const auto = document.querySelector('[role=switch]');
        if (auto.checked) auto.click();
        const input = document.querySelector('input[data-value-path="/name"]');
        input.value = name;
        input.dispatchEvent(new Event('input', {bubbles: true}));
        const realFetch = window.fetch;
        window.requests = [];
        window.connected = false;
        window.fetch = async (url, options) => {
          window.requests.push(options?.method ?? "GET");
          if (options?.method === 'PUT') {
            if (outcome !== 'never received') {
              const receipt = await realFetch(url, options);
              if (outcome === 'superseded') {
                const changed = {...JSON.parse(options.body), name: 'Another saved value'};
                await realFetch(url, {...options, headers: {...options.headers, 'If-Match': receipt.headers.get('ETag')}, body: JSON.stringify(changed)});
              }
            }
            throw new TypeError('Connection interrupted');
          }
          if (outcome === 'offline' && !window.connected) throw new TypeError('Offline');
          return realFetch(url, options);
        };
        document.querySelector('#festival-save button').click();
      `, outcome, name);
      async function waitForStatus(fragment) {
        for (let i = 0; i < 100; i++) {
          if (await run("return document.querySelector('[role=status]').textContent.includes(arguments[0])", fragment)) return;
          await delay(50);
        }
        assert.fail("Missing status: " + fragment);
      }
      await waitForStatus({committed: "Saved to SQLite", "never received": "retry Save", offline: "Could not verify", superseded: "saved version changed"}[outcome]);
      assert.deepEqual(await run("return window.requests"), ["PUT", "GET"]);
      if (outcome === "offline") {
        await run(`
          window.connected = true;
          const input = document.querySelector('input[data-value-path="/name"]');
          input.value += " offline draft";
          input.dispatchEvent(new Event('input', {bubbles: true}));
          document.querySelector('#festival-save button').click();
        `);
        await waitForStatus("Unsaved changes");
        assert.deepEqual(await run("return window.requests"), ["PUT", "GET", "GET"]);
      }
      assert.equal(await run('return document.querySelector(\'input[data-value-path="/name"]\').value'),
        outcome === "offline" ? name + " offline draft" : name);
      const stored = await (await fetch(endpoint)).json();
      assert.equal(stored.name, outcome === "never received" ? baseline.name : outcome === "superseded" ? "Another saved value" : name);
    });
  }
});

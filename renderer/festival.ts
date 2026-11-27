import { createEngine, valuePathToString } from "../dist/esm/index.js";
import type { EngineValue } from "./types";
import definition from "../tests/fixtures/festival.json";
import { createRendererVDOM } from "./vdom/index";
import { festivalIDs } from "./festival_ids";
import { parseValuePath } from "./utils";
import { getAt } from "../dist/esm/kinetic/value_ops.js";
import { saveControls } from "./save_controls";

const endpoint = "/api/festival";
const toolbar = document.querySelector<HTMLElement>("#festival-save")!;
const outline = document.querySelector<HTMLElement>("#outline")!;
const form = document.querySelector<HTMLFormElement>("#program-form")!;
const app = document.querySelector<HTMLElement>("#app")!;
form.onsubmit = e => e.preventDefault();

function entities(value: EngineValue) {
  return Array.isArray(value) ? value.map(item =>
    item && typeof item === "object" && !Array.isArray(item) ? item : {}) : [];
}

// Keep the whole projection in one form while allowing long entity sections to fold.
function labelEntitySections() {
  for (const section of form.querySelectorAll<HTMLFieldSetElement>("fieldset[data-value-path]")) {
    const path = section.dataset.valuePath!;
    const name = section.querySelector<HTMLInputElement>(`input[data-value-path="${path}/name"]`);
    const legend = section.querySelector<HTMLElement>(":scope > legend");
    if (!name || !legend || path === "/") continue;
    let toggle = legend.querySelector("button");
    if (!toggle) {
      const kind = legend.textContent || "Entity";
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.dataset.kind = kind;
      toggle.setAttribute("aria-expanded", String(!/\/(speakers|tracks|sessions)\/\d+$/.test(path)));
      const button = toggle;
      button.onclick = () => button.setAttribute("aria-expanded", String(button.getAttribute("aria-expanded") !== "true"));
      legend.replaceChildren(toggle);
    }
    toggle.textContent = `${toggle.dataset.kind} · ${name.value || "Untitled"}`;
  }
}

function revealSection(target: HTMLElement | null) {
  for (let el = target; el && el !== form; el = el.parentElement) {
    el.querySelector(":scope > legend > button")?.setAttribute("aria-expanded", "true");
  }
}

function updateNavigation(value: EngineValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  labelEntitySections();
  const links = [["Overview", "/name"], ["Program tracks", "/tracks"], ["Speaker directory", "/speakers"], ["Venues and running order", "/venues"]];
  entities(value.venues).forEach((venue, i) => {
    links.push([String(venue.name || "New venue"), `/venues/${i}`]);
    entities(venue.rooms).forEach((room, j) => {
      links.push([String(room.name || "New room"), `/venues/${i}/rooms/${j}`]);
    });
  });
  const nav = document.createElement("div");
  for (const [label, path] of links) {
    const target = form.querySelector<HTMLElement>(`.node[data-value-path="${path}"]`);
    if (!target) continue;
    target.id = "section-" + path.slice(1).replaceAll("/", "-");
    const link = document.createElement("a");
    link.href = "#" + target.id;
    link.textContent = label;
    link.onclick = () => revealSection(target);
    if (path.includes("/rooms/")) link.className = "room-link";
    nav.append(link);
  }
  outline.querySelector("div")?.remove();
  outline.append(nav);

  for (const [list, id] of [[value.speakers, "speaker-options"], [value.tracks, "track-options"]] as const) {
    document.getElementById(id)!.replaceChildren(...entities(list).map(entity => {
      const option = document.createElement("option");
      option.value = String(entity.id ?? "");
      option.label = String(entity.name ?? "");
      return option;
    }));
  }
  for (const input of form.querySelectorAll<HTMLInputElement>("input[data-value-path]")) {
    const path = input.dataset.valuePath!;
    if (path.endsWith("/track") || /\/qualified\/\d+$/.test(path)) input.setAttribute("list", "track-options");
    if (/\/sessions\/\d+\/speakers\/\d+$/.test(path)) input.setAttribute("list", "speaker-options");
  }
}

async function start() {
  const response = await fetch(endpoint, {cache: "no-store"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const tag = response.headers.get("ETag");
  if (!tag) throw new Error("Missing festival revision");
  const engine = createEngine(definition);
  const initial = engine.reset(await response.json());
  if (initial.sigma.root !== "Valid") throw new Error("Stored program failed projection validation");
  const ids = festivalIDs();
  ids.reserve(initial.value);
  function showIDFields() {
    const value = engine.getState().value;
    for (const input of form.querySelectorAll<HTMLInputElement>('input[data-value-path$="/id"]')) {
      const path = parseValuePath(input.dataset.valuePath!);
      input.readOnly = ids.locked(value, path);
      input.title = input.readOnly ? "Stable entity ID" : "Choose an ID before saving";
      const clear = input.closest(".node")?.querySelector<HTMLButtonElement>("button.clear");
      if (clear) clear.disabled = input.readOnly;
    }
  }
  const saver = saveControls("program", endpoint, tag, () => engine.getState().value,
    () => engine.getState().sigma.root === "Valid", "Loaded saved program", snapshot => {
      const settle = ids.reserve(snapshot);
      showIDFields();
      return confirmed => { settle(confirmed); showIDFields(); };
    });
  toolbar.replaceChildren(saver.controls);
  const renderer = createRendererVDOM(action => {
    const previous = engine.getState().value;
    if ((action.type === "SetScalar" || action.type === "Unset") && ids.locked(previous, action.at)) {
      const path = valuePathToString(action.at);
      const input = form.querySelector<HTMLInputElement>(`input[data-value-path="${CSS.escape(path)}"]`);
      if (input) input.value = String(getAt(previous, action.at));
      return engine.getState();
    }
    const next = engine.dispatch(action);
    if (action.type !== "MoveCursor" && previous !== next.value) ids.afterEdit(previous, next.value, action.at);
    if (action.type === "MoveCursor") {
      const path = valuePathToString(next.cursor.valuePath);
      revealSection(form.querySelector<HTMLElement>(`[data-value-path="${CSS.escape(path)}"]`));
    }
    const focusBefore = document.activeElement;
    renderer.render(engine, app);
    const focused = document.activeElement;
    if (action.type === "MoveCursor" && focused instanceof HTMLElement && focused !== focusBefore) {
      const bounds = focused.getBoundingClientRect();
      if (bounds.top < toolbar.getBoundingClientRect().bottom || bounds.bottom > document.documentElement.clientHeight) {
        focused.scrollIntoView({block: "center"});
      }
    }
    if (next.value !== previous) {
      saver.changed();
      updateNavigation(next.value);
      showIDFields();
    }
    return next;
  });
  renderer.render(engine, app);
  updateNavigation(initial.value);
  showIDFields();
}
void start().catch((error: unknown) => { toolbar.textContent = `Could not load festival program: ${String(error)}`; });
